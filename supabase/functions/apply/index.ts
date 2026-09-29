import { handler, body, db, json, limit } from '../_shared/http.ts'
handler(async req => {
  const p = await body(req,10000)
  if (p.website) throw new Error('申请校验失败')
  const limits: Record<string,number> = { nickname:40,wechat:80,school:100,available_time:400,note:1500 }
  const form: Record<string,string> = {}
  for (const [key,max] of Object.entries(limits)) { if (p[key] !== undefined && typeof p[key] !== 'string') throw new Error('申请格式错误'); form[key] = (p[key] || '').trim(); if (form[key].length>max || (key!=='note' && !form[key])) throw new Error('请填写昵称、微信、学校与可授课时间，并控制内容长度') }
  const id = Number(p.orderNumber); if (!Number.isSafeInteger(id) || id<=0) throw new Error('编号无效')
  await limit(req,'apply',6,3600)
  const client=db(), { data: order } = await client.from('orders').select('status,archived').eq('order_number',id).maybeSingle()
  if (!order || order.archived || order.status!=='已上架') throw new Error('该单已不可申请')
  const { error } = await client.from('applications').insert({ order_number:id,...form }); if (error) throw new Error('申请保存失败，请稍后重试')
  return json(req,{ok:true})
})
