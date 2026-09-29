import { cors, secret, limit } from '../_shared/http.ts'
// AMap's official serviceHost adapter. Only the SDK's documented endpoints are forwarded.
Deno.serve(async req=>{
  try {
    const headers=cors(req); if(req.method==='OPTIONS') return new Response(null,{headers})
    if(req.method!=='GET') return new Response('Method not allowed',{status:405,headers})
    const incoming=new URL(req.url), suffix=incoming.pathname.split('/_AMapService/')[1]
    if(!suffix) return new Response('Not found',{status:404,headers})
    const targets:Record<string,string>={ 'v4/map/styles':'https://webapi.amap.com', 'v4/map/styles/style':'https://webapi.amap.com', 'v3/vectormap':'https://fmap01.amap.com', 'v3/vector/road':'https://fmap01.amap.com', 'v4/map/sdk':'https://restapi.amap.com', 'v4/map/config':'https://restapi.amap.com', 'v3/ip':'https://restapi.amap.com' }
    const host=targets[suffix]; if(!host) return new Response('Unsupported map endpoint',{status:404,headers})
    await limit(req,'amap-sdk',1200,3600)
    const params=new URLSearchParams(incoming.search); params.delete('jscode'); params.set('jscode',secret('AMAP_SECURITY_JS_CODE'))
    if(params.toString().length>6000) return new Response('Too large',{status:400,headers})
    const upstream=await fetch(`${host}/${suffix}?${params}`,{signal:AbortSignal.timeout(15000)})
    return new Response(upstream.body,{status:upstream.status,headers:{...headers,'Content-Type':upstream.headers.get('content-type') || 'application/octet-stream','Cache-Control':'public,max-age=300'}})
  }catch {return new Response('Map proxy unavailable',{status:503})}
})
