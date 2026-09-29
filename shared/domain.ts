export type OrderType = '暑假单' | '寒假单' | '长期单'
export type Status = '待审核' | '已上架' | '已接单' | '已结束'
export type Period = '上午' | '下午' | '晚上'
export interface Slot {
  days: number[]
  periods: Period[]
  flexible: boolean
}
export interface Order {
  id: number
  title: string
  grade: string
  subjects: string[]
  types: OrderType[]
  district: string
  address: string
  scheduleText: string
  slots: Slot[]
  teacherGender: string
  requirements: string
  studentInfo: string
  hourlyPrice: number | null
  hourlyMax: number | null
  priceEstimated: boolean
  negotiable: boolean
  status: Status
  archived: boolean
  publishedAt: string
  lng: number | null
  lat: number | null
  locationQuality: '近似位置' | '区域中心' | '待定位'
  commuteMinutes?: number | null
}
export interface Candidate extends Order {
  rawText: string
  fullAddress: string
  sourceFile: string
  anomalies: string[]
  duplicate: boolean
}
export const TYPES: OrderType[] = ['暑假单', '寒假单', '长期单']
export const STATUSES: Status[] = ['待审核', '已上架', '已接单', '已结束']
export const PERIODS: Period[] = ['上午', '下午', '晚上']
export const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
export const DISTRICTS = [
  '天河区',
  '海珠区',
  '越秀区',
  '荔湾区',
  '白云区',
  '番禺区',
  '黄埔区',
  '花都区',
  '南沙区',
  '增城区',
  '从化区',
]

// Only public projections may enter visitor responses. Raw source and exact addresses
// must remain in the separately protected private record.
export function redactText(value: string): string {
  return String(value ?? '')
    .replace(/(?:\+?86[-\s]?)?1[3-9](?:[-\s]?\d){9}/g, '[手机号已隐藏]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱已隐藏]')
    .replace(
      /(?:微信(?:号)?|手机号|电话|联系方式|联系人|学生姓名|姓名|vx(?:号)?|wx(?:号)?|v信)\s*[:：]?\s*[^，,；;。\n]+/gi,
      '[隐私信息已隐藏]',
    )
    .replace(/(?:\d{3,4}[- ]?)\d{7,8}/g, '[电话已隐藏]')
    .replace(
      /(?:[A-Za-z]\s*)?\d+(?:[-之]\d+)?\s*(?:号楼|号院|号|栋|幢|座|单元|楼|层|室|房)(?:\s*[-—]?\s*\d{2,5}(?:室|房)?(?=$|[，,。；;\s]))?/g,
      '',
    )
    .replace(/(?:门牌|房号)\s*[:：]?\s*[A-Za-z\d-]+/g, '')
    .replace(
      /(?:[A-Za-z]|[一二三四五六七八九十百]+)\s*(?:栋|幢|座|号楼|单元|楼|层)(?:\s*\d{2,5}(?:室|房)?)?/g,
      '',
    )
    .replace(/^[A-Za-z][A-Za-z0-9_-]*\s*(?=[一二三四五六七八九\d]+年级)/, '')
    .replace(/，\s*，/g, '，')
    .trim()
}
export function publicAddress(address: string): string {
  const result = redactText(address)
    .replace(/^(?:地址\s*[:：]?|我(?:们)?(?:在|住在))\s*/, '')
    .trim()
  return result || '位置待确认'
}
export function classifyTypes(schedule: string): OrderType[] {
  const result: OrderType[] = []
  const summer = /暑假|暑期/.test(schedule),
    winter = /寒假|寒期/.test(schedule)
  if (summer) result.push('暑假单')
  if (winter) result.push('寒假单')
  const weekly = /(?:一|每)周|工作日|周[一二三四五六日天末]|星期/.test(schedule)
  const continuation = /长期|常年|(?:开学|假期结束|暑假后|寒假后|假期后).*?(?:继续|每周|一周|上课)/.test(
    schedule,
  )
  if (continuation || (!summer && !winter && weekly)) result.push('长期单')
  return result
}
function daysIn(text: string): number[] {
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  const found = new Set<number>()
  if (/周末|双休/.test(text)) {
    found.add(6)
    found.add(7)
  }
  if (/工作日/.test(text)) [1, 2, 3, 4, 5].forEach((x) => found.add(x))
  for (const m of text.matchAll(
    /(?:周|星期)([一二三四五六日天])\s*(?:到|至|[-—~])\s*(?:(?:周|星期))?([一二三四五六日天])/g,
  )) {
    for (let n = map[m[1]]; n <= map[m[2]]; n++) found.add(n)
  }
  for (const m of text.matchAll(/(?:周|星期)([一二三四五六日天])/g)) found.add(map[m[1]])
  return [...found].sort()
}
export function inferSlots(schedule: string): Slot[] {
  if (!schedule.trim()) return [{ days: [1, 2, 3, 4, 5, 6, 7], periods: [...PERIODS], flexible: true }]
  const pieces: string[] = []
  for (const fragment of schedule.split(/[；;\n]/).filter(Boolean)) {
    const commas = fragment.split(/[，,](?=(?:周|星期|工作日))/)
    let current = commas[0]
    for (const next of commas.slice(1)) {
      if (/上午|早上|下午|中午|晚上|晚间|\d[:：]\d/.test(current)) {
        pieces.push(current)
        current = next
      } else current += '，' + next
    }
    pieces.push(current)
  }
  return pieces.map((text) => {
    const days = daysIn(text),
      periods: Period[] = []
    if (/上午|早上|早晨/.test(text)) periods.push('上午')
    if (/下午|中午/.test(text)) periods.push('下午')
    if (/晚上|晚间|夜间/.test(text)) periods.push('晚上')
    if (!periods.length) {
      const m = text.match(/(?:^|[^\d])(1[2-9]|2[0-3])[:：]\d{2}/)
      if (m) periods.push(Number(m[1]) < 18 ? '下午' : '晚上')
    }
    return {
      days: days.length ? days : [1, 2, 3, 4, 5, 6, 7],
      periods: periods.length ? periods : [...PERIODS],
      flexible: !days.length || !periods.length || /协商|待定|另议/.test(text),
    }
  })
}
export function parsePrice(text: string, schedule = '') {
  const amount = text.match(/(\d+(?:\.\d+)?)\s*(?:[-~—至]\s*(\d+(?:\.\d+)?))?/)
  if (!amount || Number(amount[1]) <= 0)
    return { hourlyPrice: null, hourlyMax: null, priceEstimated: false, negotiable: true }
  const num: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
  let hours = 1,
    priceEstimated = false
  if (!/每小时|\/\s*(?:h|小时)|元\s*(?:每|\/)小时|每\s*1\s*(?:h|小时)/i.test(text)) {
    const duration =
      text.match(/([一二两三四五六\d.]+)\s*(?:个)?\s*(?:小时|h)/i) ||
      schedule.match(/(?:一次课|每次|每节课)\s*([一二两三四五六\d.]+)\s*(?:个)?\s*(?:小时|h)/i)
    hours = duration ? num[duration[1]] || Number(duration[1]) : 2
    if (!duration) priceEstimated = true
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    hours = 2
    priceEstimated = true
  }
  return {
    hourlyPrice: Math.round((Number(amount[1]) / hours) * 100) / 100,
    hourlyMax: Math.round((Number(amount[2] || amount[1]) / hours) * 100) / 100,
    priceEstimated,
    negotiable: /协商|面议|报价/.test(text),
  }
}
const labels: Record<string, string> = {
  地址: 'address',
  地点: 'address',
  家教时间: 'schedule',
  时间: 'schedule',
  课期: 'schedule',
  课酬: 'price',
  薪资: 'price',
  价格: 'price',
  学生情况: 'studentInfo',
  要求: 'requirements',
}
export function parseTXT(text: string, sourceFile: string, existingIds: number[] = []): Candidate[] {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .trim()
  if (!normalized) return []
  const heads = [...normalized.matchAll(/^\s*(\d{3,10})(?:[（(][^\n）)]*[）)])?\s*$/gm)]
  const blocks: { id: number; raw: string }[] = []
  if (!heads.length) blocks.push({ id: 0, raw: normalized })
  else {
    if (normalized.slice(0, heads[0].index).trim())
      blocks.push({ id: 0, raw: normalized.slice(0, heads[0].index).trim() })
    heads.forEach((m, index) =>
      blocks.push({
        id: Number(m[1]),
        raw: normalized.slice(m.index, heads[index + 1]?.index ?? normalized.length).trim(),
      }),
    )
  }
  const counts = new Map<number, number>()
  blocks.forEach((b) => counts.set(b.id, (counts.get(b.id) || 0) + 1))
  return blocks.map(({ id, raw }) => {
    const fields: Record<string, string> = {},
      titles: string[] = []
    let current = ''
    const lines = raw.split('\n').filter((x) => x.trim())
    for (const line of lines.slice(id ? 1 : 0)) {
      const match = line
        .trim()
        .match(/^(家教时间|学生情况|地址|地点|时间|课期|课酬|薪资|价格|要求)\s*[:：]?\s*(.*)$/)
      if (match) {
        current = labels[match[1]]
        fields[current] = (fields[current] ? fields[current] + '\n' : '') + match[2]
      } else if (current) fields[current] += '\n' + line.trim()
      else titles.push(line.trim())
    }
    const title = titles.join('，') || '学生单子',
      schedule = fields.schedule || ''
    const fullAddress = fields.address || '',
      types = classifyTypes(schedule),
      price = parsePrice(fields.price || '', schedule)
    const duplicate = existingIds.includes(id) || (counts.get(id) || 0) > 1
    const anomalies: string[] = []
    if (!id) anomalies.push('缺少有效编号')
    if (duplicate) anomalies.push('编号重复，待人工核对')
    if (!fullAddress) anomalies.push('无地址，必须待审核')
    if (price.priceEstimated) anomalies.push('未注明课时，按每次2小时估算')
    if (!types.length) anomalies.push('类型待分类')
    const slots = inferSlots(schedule)
    if (slots.some((s) => s.flexible)) anomalies.push('部分授课时间待确认')
    const district =
      DISTRICTS.find((d) => fullAddress.includes(d) || fullAddress.includes(d.slice(0, -1))) || ''
    return {
      id,
      title: redactText(title),
      grade: title.match(/(?:[一二三四五六七八九\d]+年级|初[一二三]|高[一二三])/)?.[0] || '年级待确认',
      subjects: ['数学', '语文', '英语', '物理', '化学', '日语', '奥数', '全科'].filter(
        (s) => title.includes(s) || (s === '全科' && /各科|辅导作业/.test(title)),
      ),
      types,
      district,
      address: publicAddress(fullAddress),
      scheduleText: redactText(schedule),
      slots,
      teacherGender: /女生|女老师|大一女生/.test(fields.requirements || '')
        ? '女老师'
        : /男生|男老师/.test(fields.requirements || '')
          ? '男老师'
          : '不限',
      requirements: redactText(fields.requirements || ''),
      studentInfo: redactText(fields.studentInfo || ''),
      ...price,
      status: !id || !fullAddress || duplicate ? '待审核' : '已上架',
      archived: false,
      publishedAt: new Date().toISOString(),
      lng: null,
      lat: null,
      locationQuality: '待定位',
      rawText: raw,
      fullAddress,
      sourceFile,
      anomalies,
      duplicate,
    }
  })
}
export function toPublicOrder(order: Order): Order {
  return {
    id: order.id,
    title: redactText(order.title),
    grade: redactText(order.grade),
    subjects: [...order.subjects],
    types: [...order.types],
    district: redactText(order.district),
    address: publicAddress(order.address),
    scheduleText: redactText(order.scheduleText),
    slots: order.slots,
    teacherGender: order.teacherGender,
    requirements: redactText(order.requirements),
    studentInfo: redactText(order.studentInfo),
    hourlyPrice: order.hourlyPrice,
    hourlyMax: order.hourlyMax,
    priceEstimated: order.priceEstimated,
    negotiable: order.negotiable,
    status: order.status,
    archived: order.archived,
    publishedAt: order.publishedAt,
    lng: order.lng,
    lat: order.lat,
    locationQuality: order.locationQuality,
  }
}
export interface Filters {
  query: string
  types: string[]
  subjects: string[]
  district: string
  day: number | null
  period: string
  gender: string
  price: 'all' | 'negotiable' | 'numeric'
  minPrice: number | null
  maxCommute: number | null
  favoritesOnly: boolean
}
export function defaultFilters(): Filters {
  return {
    query: '',
    types: [],
    subjects: [],
    district: '',
    day: null,
    period: '',
    gender: '',
    price: 'all',
    minPrice: null,
    maxCommute: null,
    favoritesOnly: false,
  }
}
export function filterOrders(orders: Order[], f: Filters, favorites: number[] = []): Order[] {
  const query = f.query.trim().toLowerCase()
  return orders
    .filter((o) => !o.archived && (o.status === '已上架' || (o.status === '已接单' && !!query)))
    .filter(
      (o) =>
        !query ||
        [o.id, o.title, o.address, o.district, o.subjects.join(' '), o.requirements, o.studentInfo]
          .join(' ')
          .toLowerCase()
          .includes(query),
    )
    .filter((o) => !f.types.length || f.types.some((t) => o.types.includes(t as OrderType)))
    .filter((o) => !f.subjects.length || f.subjects.some((s) => o.subjects.includes(s)))
    .filter((o) => !f.district || o.district === f.district)
    .filter((o) => !f.gender || o.teacherGender === f.gender || o.teacherGender === '不限')
    .filter(
      (o) =>
        (!f.day && !f.period) ||
        o.slots.some(
          (s) => (!f.day || s.days.includes(f.day)) && (!f.period || s.periods.includes(f.period as Period)),
        ),
    )
    .filter(
      (o) =>
        f.price === 'all' || (f.price === 'negotiable' ? o.hourlyPrice === null : o.hourlyPrice !== null),
    )
    .filter((o) => f.minPrice === null || (o.hourlyPrice !== null && o.hourlyPrice >= f.minPrice))
    .filter((o) => f.maxCommute === null || (o.commuteMinutes != null && o.commuteMinutes <= f.maxCommute))
    .filter((o) => !f.favoritesOnly || favorites.includes(o.id))
}
export function sortOrders(orders: Order[], mode: string): Order[] {
  return [...orders].sort((a, b) => {
    if (mode === 'commute')
      return (a.commuteMinutes ?? Infinity) - (b.commuteMinutes ?? Infinity) || b.id - a.id
    if (mode === 'price') {
      if (a.hourlyPrice === null && b.hourlyPrice !== null) return -1
      if (b.hourlyPrice === null && a.hourlyPrice !== null) return 1
      return (b.hourlyPrice ?? 0) - (a.hourlyPrice ?? 0) || b.id - a.id
    }
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.id - a.id
  })
}
export function commuteLabel(minutes?: number | null): string {
  if (minutes == null) return '通勤待计算'
  return minutes < 60 ? `约 ${Math.ceil(minutes)} 分钟` : `约 ${Math.floor(minutes / 30) / 2} 小时`
}
export function priceLabel(order: Order): string {
  if (order.hourlyPrice === null) return '价格面议'
  const range = order.hourlyMax !== null && order.hourlyMax !== order.hourlyPrice ? `–${order.hourlyMax}` : ''
  return `${order.priceEstimated ? '约 ' : ''}${order.hourlyPrice}${range} 元/小时`
}
export function nextDaytime(): { date: string; time: string } {
  const chinaNow = new Date(Date.now() + 8 * 3600_000)
  if (chinaNow.getUTCHours() >= 10) chinaNow.setUTCDate(chinaNow.getUTCDate() + 1)
  return { date: chinaNow.toISOString().slice(0, 10), time: '10:00' }
}
