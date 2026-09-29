import { handler, body, json, admin, limit, amap, point } from '../_shared/http.ts'
handler(async req => {
  const p=await body(req,10000)
  if (p.action==='transit') {
    await limit(req,'transit',300,3600)
    const origin=point(p.origin),destination=point(p.destination)
    // Never accept nighttime departures or arbitrary client-supplied API paths.
    const china=new Date(Date.now()+8*3600_000); if(china.getUTCHours()>=10) china.setUTCDate(china.getUTCDate()+1)
    const date=china.toISOString().slice(0,10)
    const r=await amap('/v5/direction/transit/integrated',{origin,destination,city1:'020',city2:'020',strategy:'8',date,time:'10-00',nightflag:'0',show_fields:'cost',AlternativeRoute:'10'})
    const durations=(r.route?.transits || []).map((t:any)=>Number(t.cost?.duration || t.duration)).filter((n:number)=>Number.isFinite(n) && n>0)
    return json(req,{minutes:durations.length ? Math.min(...durations)/60 : null,date,time:'10:00'})
  }
  if (p.action==='geocode') {
    const address=String(p.address || '').trim(); if(!address || address.length>160) throw new Error('请输入广州小区、街道或区域')
    await limit(req,'geocode',80,3600)
    const district=typeof p.district==='string' && p.district.length<=20 ? p.district : ''
    const place=address.includes('广州') ? address : `广州市${district && !address.includes(district) ? district : ''}${address}`
    const r=await amap('/v3/geocode/geo',{address:place,city:'广州'})
    const locations=(r.geocodes || []).filter((x:any)=>String(x.city).includes('广州')).map((x:any)=>{const [lng,lat]=x.location.split(',').map(Number);return {lng,lat,district:x.district,level:x.level,label:x.formatted_address}})
    return json(req,{locations})
  }
  if(p.action==='convert') {
    await limit(req,'convert',30,3600)
    const r=await amap('/v3/assistant/coordinate/convert',{locations:point(p.location),coordsys:'gps'})
    return json(req,{location:r.locations.split(';')[0].split(',').map(Number)})
  }
  throw new Error('不支持的地图操作')
})
