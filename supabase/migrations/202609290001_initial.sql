-- Execute once in a new Supabase project. No student data or owner credentials here.
create table public.admin_accounts (
  user_id uuid primary key references auth.users(id), email text not null,
  role text not null check (role in ('owner','admin')), enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from admin_accounts where user_id=auth.uid() and enabled) $$;
create function public.is_owner() returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from admin_accounts where user_id=auth.uid() and role='owner' and enabled) $$;

create table public.orders (
  order_number bigint primary key check (order_number>0 and order_number<=9999999999),
  status text not null check(status in ('待审核','已上架','已接单','已结束')),
  archived boolean not null default false, public_data jsonb not null,
  published_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.order_private (
  order_number bigint primary key references public.orders(order_number), full_address text not null,
  raw_text text not null, source_file text not null, anomalies jsonb not null default '[]'
);
create table public.import_exceptions (
  id uuid primary key default gen_random_uuid(), order_number bigint,
  candidate jsonb not null, reason text not null, resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number bigint not null references public.orders(order_number), created_at timestamptz not null default now(),
  primary key(user_id,order_number)
);
create table public.applications (
  id uuid primary key default gen_random_uuid(), order_number bigint not null references public.orders(order_number),
  nickname text not null, wechat text not null, school text not null, available_time text not null,
  note text not null default '', created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor uuid references auth.users(id),
  action text not null, order_number bigint, created_at timestamptz not null default now()
);
create table public.request_limits (bucket text primary key, counter integer not null default 0, expires_at timestamptz not null);
alter table public.admin_accounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_private enable row level security;
alter table public.import_exceptions enable row level security;
alter table public.favorites enable row level security;
alter table public.applications enable row level security;
alter table public.audit_log enable row level security;
alter table public.request_limits enable row level security;
create policy admin_read on public.admin_accounts for select to authenticated using (user_id=auth.uid() or public.is_owner());
create policy orders_public on public.orders for select using (not archived and status='已上架');
create policy orders_admin on public.orders for select to authenticated using (public.is_admin());
create policy private_admin on public.order_private for select to authenticated using(public.is_admin());
create policy exceptions_admin on public.import_exceptions for select to authenticated using(public.is_admin());
create policy exceptions_resolve on public.import_exceptions for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy favorites_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.orders where order_number=favorites.order_number and not archived and status='已上架'));
create policy favorites_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
create policy applications_admin on public.applications for select to authenticated using(public.is_admin());
create policy audit_admin on public.audit_log for select to authenticated using(public.is_admin());
-- Grant privileges explicitly; RLS still applies. Visitors never access private tables.
revoke all on public.admin_accounts,public.orders,public.order_private,public.import_exceptions,public.favorites,public.applications,public.audit_log,public.request_limits from anon,authenticated;
grant select on public.orders to anon,authenticated;
grant select on public.admin_accounts,public.order_private,public.import_exceptions,public.applications,public.audit_log to authenticated;
grant update(resolved) on public.import_exceptions to authenticated;
grant select,insert,delete on public.favorites to authenticated;

-- Only whitelisted fields can be stored in the publicly readable record.
create function public.redact_public_text(p text) returns text language plpgsql immutable set search_path=public as $$
declare t text:=coalesce(p,'');
begin
 t:=regexp_replace(t,'(\+?86[- ]?)?1[3-9]([- ]?[0-9]){9}','[手机号已隐藏]','g');
 t:=regexp_replace(t,'[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','[邮箱已隐藏]','g');
 t:=regexp_replace(t,'(微信号?|手机号|电话|联系方式|联系人|学生姓名|姓名|vx号?|wx号?|v信)[ :：]*[^，,；;。\n]+','[隐私信息已隐藏]','gi');
 t:=regexp_replace(t,'([A-Za-z][ ]*)?[0-9]+([-之][0-9]+)?[ ]*(号楼|号院|号|栋|幢|座|单元|楼|层|室|房)([ ]*[0-9]{2,5}(室|房)?)?','','g');
 t:=regexp_replace(t,'([A-Za-z]|[一二三四五六七八九十百]+)[ ]*(栋|幢|座|号楼|单元|楼|层)([ ]*[0-9]{2,5}(室|房)?)?','','g');
 return trim(t);
end $$;
create function public.clean_public(p jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb; k text;
begin
 if jsonb_typeof(p)<>'object' then raise exception '公开字段格式无效'; end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(p)
 where key=any(array['id','title','grade','subjects','types','district','address','scheduleText','slots','teacherGender','requirements','studentInfo','hourlyPrice','hourlyMax','priceEstimated','negotiable','lng','lat','locationQuality']);
 foreach k in array array['title','grade','district','address','scheduleText','requirements','studentInfo'] loop
   if result ? k then result:=jsonb_set(result,array[k],to_jsonb(public.redact_public_text(result->>k))); end if;
 end loop;
 return result;
end
$$;
create function public.search_orders(p_query text) returns setof public.orders language plpgsql stable security definer set search_path=public as $$
begin
 if length(trim(p_query))=0 or length(p_query)>120 then return; end if;
 return query select o.* from orders o where not o.archived and o.status in ('已上架','已接单')
 and (position(lower(trim(p_query)) in lower(o.order_number::text || ' ' || coalesce(o.public_data->>'title','') || ' ' || coalesce(o.public_data->>'address','') || ' ' || coalesce(o.public_data->>'district','') || ' ' || coalesce(o.public_data->>'subjects','') || ' ' || coalesce(o.public_data->>'requirements','') || ' ' || coalesce(o.public_data->>'studentInfo','')))>0)
 order by o.published_at desc limit 1000;
end $$;
create function public.import_orders(p_candidates jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare c jsonb; n bigint; s text; inserted boolean; imported integer:=0; exceptions integer:=0;
begin
 if not public.is_admin() then raise exception '需要有效管理员账号'; end if;
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>500 then raise exception '每批最多500条'; end if;
 for c in select value from jsonb_array_elements(p_candidates) loop
   n:=case when (c->>'id') ~ '^\d{1,10}$' then (c->>'id')::bigint else 0 end;
   if n<=0 or (select count(*) from jsonb_array_elements(p_candidates) x where x->>'id'=c->>'id')>1 then
     insert into import_exceptions(order_number,candidate,reason) values(n,c,'编号无效或批次内重复，等待人工核对'); exceptions:=exceptions+1; continue;
   end if;
   s:=case when length(trim(coalesce(c->>'full_address','')))=0 then '待审核' else '已上架' end;
   inserted:=false;
   insert into orders(order_number,status,public_data) values(n,s,public.clean_public(c->'public_data')) on conflict do nothing returning true into inserted;
   if coalesce(inserted,false) then
     insert into order_private values(n,coalesce(c->>'full_address',''),coalesce(c->>'raw_text',''),coalesce(c->>'source_file',''),coalesce(c->'anomalies','[]'));
     insert into audit_log(actor,action,order_number) values(auth.uid(),'import',n); imported:=imported+1;
   else
     insert into import_exceptions(order_number,candidate,reason) values(n,c,'编号已存在（含归档），不会覆盖，等待人工核对'); exceptions:=exceptions+1;
   end if;
 end loop;
 return jsonb_build_object('imported',imported,'exceptions',exceptions);
end $$;
create function public.save_order(p_id bigint,p_public jsonb,p_private jsonb) returns void language plpgsql security definer set search_path=public as $$
declare s text; a boolean;
begin
 if not public.is_admin() then raise exception '需要有效管理员账号'; end if;
 s:=p_public->>'status'; a:=coalesce((p_public->>'archived')::boolean,false);
 if s not in ('待审核','已上架','已接单','已结束') then raise exception '状态无效'; end if;
 if s='已上架' and length(trim(coalesce(p_private->>'full_address','')))=0 then raise exception '无地址单不能上架'; end if;
 update orders set public_data=public.clean_public(p_public), published_at=case when s='已上架' and status<>'已上架' then now() else published_at end, status=s,archived=a where order_number=p_id;
 if not found then raise exception '编号不存在'; end if;
 update order_private set full_address=p_private->>'full_address',raw_text=p_private->>'raw_text',source_file=p_private->>'source_file',anomalies=p_private->'anomalies' where order_number=p_id;
 insert into audit_log(actor,action,order_number) values(auth.uid(),case when a then 'archive' else 'edit' end,p_id);
end $$;
create function public.rate_limit(p_bucket text,p_max integer,p_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into request_limits values(p_bucket,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket) do update set counter=case when request_limits.expires_at<=now() then 1 else request_limits.counter+1 end,
 expires_at=case when request_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else request_limits.expires_at end returning counter into n;
 return n<=p_max;
end $$;
revoke all on function public.import_orders(jsonb),public.save_order(bigint,jsonb,jsonb),public.rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.import_orders(jsonb),public.save_order(bigint,jsonb,jsonb) to authenticated;
grant execute on function public.rate_limit(text,integer,integer) to service_role;
grant execute on function public.search_orders(text) to anon,authenticated;
create index orders_published on public.orders(status,archived,published_at desc);
create index applications_time on public.applications(created_at desc);
