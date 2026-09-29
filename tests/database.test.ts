import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { parseTXT, toPublicOrder } from '../shared/domain'
const db = new PGlite(),
  owner = '00000000-0000-4000-8000-000000000001',
  visitor = '00000000-0000-4000-8000-000000000002',
  adminId = '00000000-0000-4000-8000-000000000003'
const c = parseTXT(
  '1234\n四年级数学\n地址：天河测试花园\n时间：周六上午\n课酬：150元/2小时\n要求：认真',
  'test.txt',
)[0]
const payload = (id = 1234) => ({
  id,
  public_data: toPublicOrder({ ...c, id }),
  full_address: '天河测试花园3栋502室',
  raw_text: 'private raw source',
  source_file: 'private.txt',
  anomalies: [],
})
async function as(role: string, id: string | null = null) {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id || ''}',false);`,
  )
}
async function rpcImport(p: any) {
  return (
    await db.query<{ result: any }>('select public.import_orders($1::jsonb) as result', [JSON.stringify(p)])
  ).rows[0].result
}
beforeAll(async () => {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role; insert into auth.users values('${owner}'),('${visitor}'),('${adminId}');`,
  )
  await db.exec(
    readFileSync(new URL('../supabase/migrations/202609290001_initial.sql', import.meta.url), 'utf8'),
  )
  await db.exec(
    `insert into public.admin_accounts(user_id,email,role) values('${owner}','owner@example.test','owner'),('${adminId}','admin@example.test','admin');`,
  )
}, 20000)
afterAll(async () => await db.close())
describe('数据库迁移、RLS与真实RPC', () => {
  it('数据库再次白名单过滤与脱敏，不能只依赖浏览器', async () => {
    const r = await db.query<{ safe: any }>('select public.clean_public($1::jsonb) as safe', [
      JSON.stringify({
        raw_text: 'never public',
        title: '数学',
        address: '测试花园3栋502室',
        requirements: '微信：secretwx；电话：13800000000；姓名：测试名字',
      }),
    ])
    expect(r.rows[0].safe).not.toHaveProperty('raw_text')
    expect(JSON.stringify(r.rows[0].safe)).not.toMatch(/502|secretwx|13800000000|测试名字/)
  })
  it('有效管理员可以入库，重复逐条隔离且不覆盖', async () => {
    await as('authenticated', owner)
    expect(await rpcImport([payload(), payload(1235)])).toEqual({ imported: 2, exceptions: 0 })
    expect(await rpcImport([payload(), payload(1236)])).toEqual({ imported: 1, exceptions: 1 })
    expect(await rpcImport([payload(1240), payload(1240), payload(1241)])).toEqual({
      imported: 1,
      exceptions: 2,
    })
  })
  it('匿名访客不能读取完整地址、原文、申请及后台账号', async () => {
    await as('anon')
    const orders = await db.query('select * from public.orders')
    expect(orders.rows.length).toBe(4)
    expect(JSON.stringify(orders.rows)).not.toContain('private raw source')
    for (const table of ['order_private', 'applications', 'admin_accounts', 'import_exceptions'])
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
  })
  it('普通注册账号仍不能导入或读取私有资料', async () => {
    await as('authenticated', visitor)
    expect((await db.query('select * from public.order_private')).rows).toHaveLength(0)
    await expect(rpcImport([payload(9999)])).rejects.toThrow('需要有效管理员账号')
  })
  it('不能自升管理员，不能直接修改公开单', async () => {
    await as('authenticated', visitor)
    await expect(
      db.query(
        `insert into public.admin_accounts values('${visitor}','visitor@example.test','owner',true,now())`,
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query("update public.orders set status='已结束'")).rejects.toThrow(/permission denied/)
  })
  it('已接单仅主动搜索返回，待审核/结束/归档不会泄露', async () => {
    await as('authenticated', owner)
    for (const [id, status] of [
      [1234, '已接单'],
      [1235, '待审核'],
      [1236, '已结束'],
    ] as const) {
      await db.query('select public.save_order($1,$2::jsonb,$3::jsonb)', [
        id,
        JSON.stringify({ ...toPublicOrder({ ...c, id }), status }),
        JSON.stringify(payload(id)),
      ])
    }
    await as('anon')
    expect((await db.query('select * from public.orders')).rows).toHaveLength(1)
    expect((await db.query('select * from public.search_orders($1)', [''])).rows).toHaveLength(0)
    expect((await db.query('select * from public.search_orders($1)', ['数学'])).rows).toHaveLength(2)
  })
  it('收藏只属于本人，匿名不能收藏、不能直接写申请', async () => {
    await as('authenticated', visitor)
    await db.query('insert into favorites(user_id,order_number) values($1,1241)', [visitor])
    await as('authenticated', owner)
    expect((await db.query('select * from favorites')).rows).toHaveLength(0)
    await as('anon')
    await expect(
      db.query(
        "insert into applications(order_number,nickname,wechat,school,available_time) values(1241,'test','wx','school','周六')",
      ),
    ).rejects.toThrow(/permission denied/)
  })
  it('归档保留编号，管理员停用后旧JWT也失去权限', async () => {
    await as('authenticated', owner)
    await db.query('select public.save_order(1241,$1::jsonb,$2::jsonb)', [
      JSON.stringify({ ...toPublicOrder({ ...c, id: 1241 }), status: '已结束', archived: true }),
      JSON.stringify(payload(1241)),
    ])
    expect(await rpcImport([payload(1241)])).toEqual({ imported: 0, exceptions: 1 })
    await as('postgres')
    await db.query('update admin_accounts set enabled=false where user_id=$1', [adminId])
    await as('authenticated', adminId)
    expect((await db.query('select * from order_private')).rows).toHaveLength(0)
    await expect(rpcImport([payload(1250)])).rejects.toThrow('需要有效管理员账号')
  })
})
