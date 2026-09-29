import { createClient } from 'npm:@supabase/supabase-js@2'
export function secret(name: string) { const value = Deno.env.get(name); if (!value) throw new Error(`后台缺少配置 ${name}`); return value }
export const db = () => createClient(secret('SUPABASE_URL'), secret('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
export function cors(req: Request): Record<string,string> {
  const origin = req.headers.get('origin') || ''
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://sherlockedjim.github.io,http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim())
  if (origin && !allowed.includes(origin)) throw new Error('访问来源不允许')
  return { 'Access-Control-Allow-Origin': origin || allowed[0], 'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', Vary: 'Origin' }
}
export function json(req: Request, value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) }
export function handler(fn: (req: Request) => Promise<Response>) {
  Deno.serve(async req => {
    try {
      cors(req); if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) })
      if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)
      return await fn(req)
    } catch(e) {
      // Never log source text, addresses, visitor contacts, tokens or upstream URLs.
      const message = e instanceof Error ? e.message : '请求失败'
      try { return json(req, { error: message }, /权限|登录|来源/.test(message) ? 403 : /频繁/.test(message) ? 429 : 400) }
      catch { return new Response('Forbidden', { status: 403 }) }
    }
  })
}
export async function body(req: Request, max = 1_100_000): Promise<any> {
  const stream = req.body?.getReader(); if (!stream) throw new Error('请求内容为空')
  const chunks: Uint8Array[] = []; let size = 0
  while (true) { const { value, done } = await stream.read(); if (done) break; size += value.byteLength; if (size > max) { await stream.cancel(); throw new Error('请求内容过大') }; chunks.push(value) }
  const result = new Uint8Array(size); let offset=0; chunks.forEach(c => { result.set(c,offset); offset+=c.length })
  return JSON.parse(new TextDecoder().decode(result))
}
export async function admin(req: Request, owner = false) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')
  if (!token) throw new Error('需要管理员登录')
  const client = db(); const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Error('登录已失效')
  const { data: account } = await client.from('admin_accounts').select('role,enabled').eq('user_id',data.user.id).maybeSingle()
  if (!account?.enabled || (owner && account.role !== 'owner')) throw new Error('管理员权限不足或已停用')
  return { client, user: data.user, account }
}
export async function limit(req: Request, action: string, maximum: number, seconds: number, identity = '') {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown'
  const bytes = new TextEncoder().encode(`${secret('SUPABASE_SERVICE_ROLE_KEY')}:${identity || ip}`)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')
  const { data, error } = await db().rpc('rate_limit',{ p_bucket: `${action}:${hash}`,p_max: maximum,p_seconds: seconds })
  if (error) throw new Error('请求限流服务不可用'); if (!data) throw new Error('请求过于频繁，请稍后再试')
}
export async function amap(path: string, params: Record<string,string>) {
  const url = new URL(`https://restapi.amap.com${path}`); url.search = new URLSearchParams({ ...params,key: secret('AMAP_WEB_SERVICE_KEY') }).toString()
  const r = await fetch(url,{signal: AbortSignal.timeout(15000)}); if (!r.ok) throw new Error('高德服务暂时不可用')
  const data = await r.json(); if (data.status !== '1') throw new Error(`高德查询失败（${data.infocode || '未知'}），请核对后台 Key 与配额`)
  return data
}
export function point(v: any): string {
  if (!Array.isArray(v) || v.length !== 2 || v.some(x => typeof x !== 'number' || !Number.isFinite(x)) || v[0] < 112.7 || v[0] > 114.1 || v[1] < 22.4 || v[1] > 24.2) throw new Error('只支持广州及邻近区域内的坐标')
  return v.map(x=>x.toFixed(6)).join(',')
}
