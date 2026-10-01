import { cors, secret, limit } from '../_shared/http.ts'
// AMap's official serviceHost adapter. Only the SDK's documented endpoints are forwarded.
Deno.serve(async req=>{
  try {
    const headers=cors(req); if(req.method==='OPTIONS') return new Response(null,{headers})
    if(req.method!=='GET') return new Response('Method not allowed',{status:405,headers})
    const incoming=new URL(req.url), suffix=incoming.pathname.split('/_AMapService/')[1]
    if(!suffix) return new Response('Not found',{status:404,headers})
    const targets:Record<string,string>={ 'v4/map/styles':'https://webapi.amap.com', 'v4/map/styles/style':'https://webapi.amap.com', 'v3/vectormap':'https://fmap01.amap.com', 'v3/vector/road':'https://fmap01.amap.com', 'v4/map/sdk':'https://restapi.amap.com', 'v4/map/config':'https://restapi.amap.com', 'v3/ip':'https://restapi.amap.com', 'v3/log/init':'https://restapi.amap.com' }
    const host=targets[suffix]; if(!host) return new Response('Unsupported map endpoint',{status:404,headers})
    const referer=req.headers.get('referer') || ''
    const allowed=(Deno.env.get('ALLOWED_ORIGINS') || 'https://sherlockedjim.github.io,http://localhost:5173,http://127.0.0.1:5173').split(',').map(x=>x.trim())
    let trustedReferer=''
    try { if (allowed.includes(new URL(referer).origin)) trustedReferer=referer } catch { /* No usable browser referrer. */ }
    if ((suffix==='v3/ip' || suffix==='v3/log/init') && !trustedReferer) return new Response('Forbidden',{status:403,headers})
    await limit(req,'amap-sdk',1200,3600)
    const params=new URLSearchParams(incoming.search); params.delete('jscode'); params.set('jscode',secret('AMAP_SECURITY_JS_CODE'))
    if(params.toString().length>6000) return new Response('Too large',{status:400,headers})
    const upstream=await fetch(`${host}/${suffix}?${params}`,{headers:trustedReferer ? {Referer:trustedReferer} : {},signal:AbortSignal.timeout(15000)})
    const callback=params.get('callback')
    if (callback && (suffix==='v3/log/init' || suffix==='v3/ip')) {
      if (!/^[A-Za-z_$][\w.$]{0,127}$/.test(callback)) return new Response('Invalid callback',{status:400,headers})
      const script=await upstream.text()
      if (!upstream.ok || !script.trimStart().startsWith(`${callback}(`)) return new Response('Invalid map response',{status:502,headers})
      return new Response(script,{headers:{...headers,'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})
    }
    return new Response(upstream.body,{status:upstream.status,headers:{...headers,'Content-Type':upstream.headers.get('content-type') || 'application/octet-stream','Cache-Control':'public,max-age=300'}})
  }catch {return new Response('Map proxy unavailable',{status:503})}
})
