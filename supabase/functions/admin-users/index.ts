import { handler, body, json, admin, limit, secret } from '../_shared/http.ts'
handler(async req=>{
  const {client,user}=await admin(req,true),p=await body(req,10000); await limit(req,'admin-users',20,3600,user.id)
  if(p.action==='invite') {
    const email=String(p.email || '').trim().toLowerCase(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length>160) throw new Error('邮箱无效')
    const redirectTo=secret('SITE_URL')+'#reset'
    const {data,error}=await client.auth.admin.inviteUserByEmail(email,{redirectTo}); if(error || !data.user) throw new Error('邀请失败，请检查邮箱、重复账号与邮件服务配置')
    const {error:save}=await client.from('admin_accounts').insert({user_id:data.user.id,email,role:'admin',enabled:true}); if(save) throw new Error('邀请已发送但权限写入失败，请主管理员在后台核对该账号')
  } else if(p.action==='enable' || p.action==='disable') {
    const {data:target}=await client.from('admin_accounts').select('role,user_id').eq('user_id',p.userId).maybeSingle()
    if(!target || target.role==='owner' || target.user_id===user.id) throw new Error('不能停用主管理员或自身')
    const {error}=await client.from('admin_accounts').update({enabled:p.action==='enable'}).eq('user_id',p.userId); if(error) throw new Error('账号更新失败')
  } else throw new Error('不支持的账号操作')
  return json(req,{ok:true})
})
