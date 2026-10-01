import { reactive } from 'vue'
import { createClient, type Session } from '@supabase/supabase-js'
import { demoCandidates } from './demo'
import {
  parseTXT,
  toPublicOrder,
  nextDaytime,
  type Candidate,
  type Order,
  type Status,
} from '../shared/domain'

export const DEMO = import.meta.env.VITE_DATA_MODE !== 'live'
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const passwordFlow = /type=(?:recovery|invite)/.test(location.hash) || location.hash.startsWith('#reset')
export const supabase = url && key ? createClient(url, key) : null
export const store = reactive({
  orders: [] as Order[],
  privateOrders: [] as Candidate[],
  exceptions: [] as any[],
  applications: [] as any[],
  session: null as Session | null,
  demoUser: false,
  demoAdmin: false,
  role: '',
  favorites: [] as number[],
  loading: false,
  error: '',
  passwordSetup: false,
})
export function isLoggedIn() {
  return !!store.session || (DEMO && store.demoUser)
}
export function isAdmin() {
  return DEMO ? store.demoAdmin : !!store.role
}
export function isOwner() {
  return !DEMO && store.role === 'owner'
}
export function siteURL() {
  return new URL(import.meta.env.BASE_URL, location.origin).href
}
function unwrap<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message || '请求失败')
  return r.data
}
function clearAdminMemory() {
  if (!DEMO) {
    store.privateOrders = []
    store.exceptions = []
    store.applications = []
  }
}
export async function invokeFunction(name: string, body: Record<string, unknown>): Promise<any> {
  if (!supabase) throw new Error('后台尚未配置')
  const result = await supabase.functions.invoke(name, { body })
  if (result.error) {
    let detail = ''
    if (result.error.context instanceof Response) {
      const payload = await result.error.context.json().catch(() => null)
      detail = payload?.error || ''
    }
    throw new Error(detail || result.error.message || '后台请求失败')
  }
  return result.data
}
function fromDB(row: any): Order {
  return {
    ...row.public_data,
    id: Number(row.order_number),
    status: row.status,
    archived: row.archived,
    publishedAt: row.published_at,
  }
}
export async function init() {
  if (DEMO) {
    store.privateOrders = demoCandidates()
    store.orders = store.privateOrders.map(toPublicOrder)
    return
  }
  if (!supabase) {
    store.error = '缺少 Supabase 前端配置'
    return
  }
  const sessionResult = await supabase.auth.getSession()
  if (sessionResult.error) throw sessionResult.error
  store.session = sessionResult.data.session
  await refreshRole()
  supabase.auth.onAuthStateChange((event, session) => {
    store.session = session
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && location.hash.includes('reset')))
      store.passwordSetup = true
    queueMicrotask(() => void refreshRole())
  })
  if (store.session && passwordFlow) store.passwordSetup = true
  await loadOrders()
}
export async function refreshRole() {
  store.role = ''
  store.favorites = []
  if (!supabase || !store.session) {
    clearAdminMemory()
    return
  }
  const userId = store.session.user.id
  const role = await supabase
    .from('admin_accounts')
    .select('role,enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (store.session?.user.id !== userId) return
  if (role.data?.enabled) store.role = role.data.role
  if (!store.role) clearAdminMemory()
  const fav = await supabase.from('favorites').select('order_number').eq('user_id', store.session.user.id)
  if (fav.data) store.favorites = fav.data.map((x) => Number(x.order_number))
}
let orderRequest = 0
export async function loadOrders(query = '') {
  if (DEMO) {
    store.orders = store.privateOrders.map(toPublicOrder)
    return
  }
  if (!supabase) return
  const token = ++orderRequest
  store.loading = true
  store.error = ''
  try {
    const r = query.trim()
      ? await supabase.rpc('search_orders', { p_query: query.trim() })
      : await supabase
          .from('orders')
          .select('*')
          .eq('archived', false)
          .eq('status', '已上架')
          .order('published_at', { ascending: false })
    const rows = (unwrap(r) || []).map(fromDB)
    if (token === orderRequest) store.orders = rows
  } catch (e) {
    if (token === orderRequest) store.error = e instanceof Error ? e.message : '加载失败'
  } finally {
    if (token === orderRequest) store.loading = false
  }
}
export async function loadAdmin() {
  if (!isAdmin()) throw new Error('需要有效管理员账号')
  if (DEMO) return
  const userId = store.session?.user.id
  const [orderResult, privateResult, exceptionResult, applicationResult, accountResult] = await Promise.all([
    supabase!.from('orders').select('*').order('order_number', { ascending: false }),
    supabase!.from('order_private').select('*'),
    supabase!
      .from('import_exceptions')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false }),
    supabase!.from('applications').select('*').order('created_at', { ascending: false }),
    supabase!.from('admin_accounts').select('enabled').eq('user_id', userId!).maybeSingle(),
  ])
  if (!userId || store.session?.user.id !== userId) {
    clearAdminMemory()
    return
  }
  if (!accountResult.data?.enabled) {
    store.role = ''
    clearAdminMemory()
    throw new Error('管理员已停用或权限失效')
  }
  const records = unwrap(orderResult) || []
  const priv = unwrap(privateResult) || []
  store.privateOrders = records.map((row) => {
    const p = priv.find((x) => x.order_number === row.order_number)
    return {
      ...fromDB(row),
      rawText: p?.raw_text || '',
      fullAddress: p?.full_address || '',
      sourceFile: p?.source_file || '',
      anomalies: p?.anomalies || [],
      duplicate: false,
    }
  })
  store.exceptions = unwrap(exceptionResult) || []
  store.applications = unwrap(applicationResult) || []
}
export async function parseUpload(text: string, filename: string, ai: boolean): Promise<Candidate[]> {
  if (!isAdmin()) throw new Error('需要管理员权限')
  const ids = store.privateOrders.map((o) => o.id)
  const basic = parseTXT(text, filename, ids)
  const candidates =
    ai && !DEMO
      ? ((await invokeFunction('parse-orders', { text, filename })).candidates as Candidate[])
      : basic
  if (!DEMO) {
    let index = 0
    await Promise.all(
      [1, 2].map(async () => {
        while (index < candidates.length) {
          const c = candidates[index++]
          if (!c.fullAddress || c.duplicate) continue
          try {
            await geocodeCandidate(c)
          } catch {
            c.anomalies.push('自动定位未完成，请核对公开地址后重新定位')
          }
        }
      }),
    )
  }
  return candidates
}
function importPayload(c: Candidate) {
  return {
    id: c.id,
    public_data: toPublicOrder(c),
    raw_text: c.rawText,
    full_address: c.fullAddress,
    source_file: c.sourceFile,
    anomalies: c.anomalies,
  }
}
export async function confirmImport(candidates: Candidate[]) {
  if (!isAdmin()) throw new Error('需要管理员权限')
  if (!DEMO) {
    const result = unwrap(
      await supabase!.rpc('import_orders', { p_candidates: candidates.map(importPayload) }),
    )
    await loadAdmin()
    await loadOrders()
    return result
  }
  let imported = 0,
    exceptions = 0
  const counts = new Map<number, number>()
  candidates.forEach((c) => counts.set(c.id, (counts.get(c.id) || 0) + 1))
  for (const source of candidates) {
    const c = {
      ...source,
      slots: source.slots.map((x) => ({ ...x, days: [...x.days], periods: [...x.periods] })),
    }
    if (!c.id || counts.get(c.id)! > 1 || store.privateOrders.some((x) => x.id === c.id)) {
      store.exceptions.push({
        id: crypto.randomUUID(),
        candidate: c,
        order_number: c.id,
        reason: '编号重复或无效，必须核对后修正编号',
        resolved: false,
      })
      exceptions++
      continue
    }
    c.status = c.fullAddress.trim() ? '已上架' : '待审核'
    c.duplicate = false
    store.privateOrders.push(c)
    imported++
  }
  await loadOrders()
  return { imported, exceptions }
}
export async function saveOrder(c: Candidate) {
  if (!isAdmin()) throw new Error('需要管理员权限')
  if (c.status === '已上架' && !c.fullAddress.trim()) throw new Error('无地址异常单不能上架')
  if (DEMO) {
    const index = store.privateOrders.findIndex((x) => x.id === c.id)
    if (index >= 0) {
      if (c.status === '已上架' && store.privateOrders[index].status !== '已上架')
        c.publishedAt = new Date().toISOString()
      store.privateOrders[index] = { ...c }
    }
  } else
    unwrap(
      await supabase!.rpc('save_order', {
        p_id: c.id,
        p_public: toPublicOrder(c),
        p_private: importPayload(c),
      }),
    )
  await loadAdmin()
  await loadOrders()
}
export async function archiveOrder(c: Candidate) {
  await saveOrder({ ...c, archived: true, status: '已结束' })
}
export async function resolveException(id: string) {
  if (DEMO) store.exceptions = store.exceptions.filter((x) => x.id !== id)
  else unwrap(await supabase!.from('import_exceptions').update({ resolved: true }).eq('id', id))
}
export async function toggleFavorite(id: number) {
  if (!isLoggedIn()) throw new Error('请先登录后收藏')
  const has = store.favorites.includes(id)
  if (!DEMO)
    unwrap(
      has
        ? await supabase!
            .from('favorites')
            .delete()
            .eq('user_id', store.session!.user.id)
            .eq('order_number', id)
        : await supabase!.from('favorites').insert({ user_id: store.session!.user.id, order_number: id }),
    )
  store.favorites = has ? store.favorites.filter((x) => x !== id) : [...store.favorites, id]
}
export async function submitApplication(order: Order, form: Record<string, string>) {
  if (order.status !== '已上架') throw new Error('该单已不可申请')
  if (!DEMO) await invokeFunction('apply', { orderNumber: order.id, ...form })
  else
    store.applications.unshift({
      id: crypto.randomUUID(),
      order_number: order.id,
      ...form,
      created_at: new Date().toISOString(),
      status: '新申请',
    })
}
export async function mapRequest(body: any) {
  if (!supabase)
    throw new Error('高德服务未配置：请检查 Supabase URL、publishable key、云函数部署及高德 Web 服务 Key。')
  return invokeFunction('map-service', body)
}
export async function geocodeCandidate(c: Candidate) {
  const res = await mapRequest({ action: 'geocode', address: c.address, district: c.district })
  if (!res.locations?.length) throw new Error('未找到地点，请手动选择地图点')
  const best = res.locations[0]
  c.lng = best.lng
  c.lat = best.lat
  c.district = best.district || c.district
  c.locationQuality = best.level === '区县' ? '区域中心' : '近似位置'
  if (res.locations.length > 1) c.anomalies = [...new Set([...c.anomalies, '多个定位候选，请人工核对'])]
}
export async function transit(origin: [number, number], destination: [number, number]) {
  const r = await mapRequest({ action: 'transit', origin, destination, ...nextDaytime() })
  return r.minutes as number | null
}
export async function logout() {
  if (store.session && supabase) await supabase.auth.signOut()
  store.session = null
  store.role = ''
  store.demoUser = false
  store.demoAdmin = false
  store.passwordSetup = false
  store.favorites = []
  clearAdminMemory()
}
export async function exportExcel() {
  if (!isAdmin()) throw new Error('只有管理员可下载完整总表')
  await loadAdmin()
  const { Workbook } = await import('exceljs')
  const wb = new Workbook(),
    sheet = wb.addWorksheet('学生单总表')
  const columns = [
    '编号',
    '类型',
    '状态',
    '已归档',
    '标题',
    '年级',
    '科目',
    '公开位置',
    '完整地址',
    '每小时时薪',
    '最高时薪',
    '价格面议',
    '课时估算',
    '授课时间',
    '老师要求',
    '学生情况',
    '来源文件',
    '解析异常',
    '原始文本',
    '上架时间',
  ]
  sheet.addRow(columns)
  for (const c of [...store.privateOrders].sort((a, b) => b.id - a.id)) {
    const safe = (s: string) => (/^[=+@-]/.test(s) ? "'" + s : s)
    sheet.addRow([
      c.id,
      c.types.join('、'),
      c.status,
      c.archived ? '是' : '否',
      safe(c.title),
      c.grade,
      c.subjects.join('、'),
      safe(c.address),
      safe(c.fullAddress),
      c.hourlyPrice,
      c.hourlyMax,
      c.hourlyPrice === null ? '是' : '否',
      c.priceEstimated ? '按2h估算' : '否',
      safe(c.scheduleText),
      safe(c.requirements),
      safe(c.studentInfo),
      safe(c.sourceFile),
      safe(c.anomalies.join('；')),
      safe(c.rawText),
      c.publishedAt,
    ])
  }
  sheet.autoFilter = { from: 'A1', to: 'T1' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1870ED' } }
  sheet.columns.forEach((c, i) => {
    c.width = [8, 12, 13, 18].includes(i) ? 42 : 18
  })
  const buffer = await wb.xlsx.writeBuffer(),
    blob = new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `广州家教总表-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
