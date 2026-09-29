import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  classifyTypes,
  inferSlots,
  parsePrice,
  parseTXT,
  toPublicOrder,
  filterOrders,
  defaultFilters,
  commuteLabel,
  sortOrders,
  publicAddress,
  redactText,
} from '../shared/domain'
const fixture = (id = 1001, extra = '') =>
  `${id}\n四年级数学\n地址：天河区测试花园3栋502室\n时间：周末待定\n课酬：150元/2小时\n要求：认真负责。微信：testcontact。\n学生情况：基础较弱${extra}`
describe('类型、时间、价格与隐私', () => {
  it('空格手机号、微信缩写与不带室字的门牌也隐藏', () => {
    expect(redactText('138 0013 8000；VX: secretwx')).not.toMatch(/138|secretwx/)
    expect(publicAddress('测试花园3栋502')).toBe('测试花园')
    expect(publicAddress('测试花园A座1103')).toBe('测试花园')
  })
  it('仅根据课期分类并支持多类型', () => {
    expect(classifyTypes('暑假每周两次')).toEqual(['暑假单'])
    expect(classifyTypes('暑假上课，开学后每周继续')).toEqual(['暑假单', '长期单'])
    expect(classifyTypes('一周一次')).toEqual(['长期单'])
    expect(classifyTypes('时间协商')).toEqual([])
  })
  it('学生情况提及假期不改变分类', () =>
    expect(parseTXT(fixture(1001, '暑假数学成绩差'), 'test.txt')[0].types).toEqual(['长期单']))
  it('周末待定匹配六种时段，不跨到工作日', () => {
    const c = parseTXT(fixture(), 'test.txt')[0]
    for (const day of [6, 7])
      for (const period of ['上午', '下午', '晚上'])
        expect(filterOrders([c], { ...defaultFilters(), day, period })).toHaveLength(1)
    expect(filterOrders([c], { ...defaultFilters(), day: 1 })).toHaveLength(0)
  })
  it('分别保留不同日的时段', () => {
    const slots = inferSlots('周六上午；周日下午')
    expect(slots[0].days).toEqual([6])
    expect(slots[1].periods).toEqual(['下午'])
  })
  it('按每小时换算，明确面议和估算', () => {
    expect(parsePrice('150元/2小时').hourlyPrice).toBe(75)
    expect(parsePrice('360元/4h').hourlyPrice).toBe(90)
    expect(parsePrice('150元每小时').hourlyPrice).toBe(150)
    expect(parsePrice('200元/次').priceEstimated).toBe(true)
    expect(parsePrice('面议').hourlyPrice).toBeNull()
  })
  it('公开结构不包含原文、完整地址、来源与异常', () => {
    const c = parseTXT(fixture(), 'private.txt')[0],
      p = toPublicOrder(c)
    expect(Object.keys(p)).not.toEqual(
      expect.arrayContaining(['rawText', 'fullAddress', 'sourceFile', 'anomalies']),
    )
    expect(JSON.stringify(p)).not.toContain('502')
    expect(JSON.stringify(p)).not.toContain('testcontact')
    expect(publicAddress('天河测试花园3栋502室')).toBe('天河测试花园')
  })
  it('隐藏手机号、邮箱与明确姓名标签', () =>
    expect(redactText('姓名：测试学生；电话：13800000000；a@test.com')).not.toMatch(
      /测试学生|13800000000|a@test.com/,
    ))
})
describe('编号隔离、状态与排序', () => {
  it('保留源编号顺序，不按数组索引编号', () =>
    expect(parseTXT(fixture(1003) + '\n\n' + fixture(1001), 'test.txt').map((x) => x.id)).toEqual([
      1003, 1001,
    ]))
  it('批次内重复和历史编号逐条标记，其他不受影响', () => {
    const p = parseTXT(
      fixture(1002) + '\n' + fixture(1002) + '\n' + fixture(1003) + '\n' + fixture(1004),
      'test.txt',
      [1003],
    )
    expect(p.map((x) => x.duplicate)).toEqual([true, true, true, false])
  })
  it('无地址待审核', () =>
    expect(parseTXT(fixture().replace('天河区测试花园3栋502室', ''), 'test.txt')[0].status).toBe('待审核'))
  it('已接单仅搜索时出现，结束与归档一直不公开', () => {
    const c = parseTXT(fixture(), 'test.txt')[0]
    const rows = [
      { ...c, status: '已接单' as const },
      { ...c, id: 1002, status: '已结束' as const },
      { ...c, id: 1003, archived: true },
    ]
    expect(filterOrders(rows, defaultFilters())).toHaveLength(0)
    expect(filterOrders(rows, { ...defaultFilters(), query: '数学' })).toHaveLength(1)
  })
  it('展示向下取半小时，但筛选不允许超时单混入', () => {
    const c = parseTXT(fixture(), 'test.txt')[0]
    expect(commuteLabel(59)).toBe('约 59 分钟')
    expect(commuteLabel(89)).toBe('约 1 小时')
    expect(commuteLabel(91)).toBe('约 1.5 小时')
    expect(
      filterOrders([{ ...c, commuteMinutes: 89 }], { ...defaultFilters(), maxCommute: 60 }),
    ).toHaveLength(0)
  })
  it('价格排序面议优先，数字按时薪降序，最新按上架时间', () => {
    const c = parseTXT(fixture(), 'test.txt')[0]
    const rows = [
      { ...c, id: 1, hourlyPrice: 75 },
      { ...c, id: 2, hourlyPrice: null },
      { ...c, id: 3, hourlyPrice: 150 },
    ]
    expect(sortOrders(rows, 'price').map((x) => x.id)).toEqual([2, 3, 1])
    expect(
      sortOrders(
        [
          { ...c, id: 1, publishedAt: '2026-09-29T01:00:00Z' },
          { ...c, id: 2, publishedAt: '2026-09-28T01:00:00Z' },
        ],
        'latest',
      )[0].id,
    ).toBe(1)
  })
})
const local = new URL('../student1.txt', import.meta.url)
describe.skipIf(!existsSync(local))('本地私有样本 student1.txt（不纳入仓库）', () => {
  it('11条连续唯一编号及7条明确时薪、4条面议', () => {
    const p = parseTXT(readFileSync(local, 'utf8'), 'student1.txt')
    expect(p).toHaveLength(11)
    expect(p.map((x) => x.id)).toEqual(Array.from({ length: 11 }, (_, i) => 8944 - i))
    expect(new Set(p.map((x) => x.id)).size).toBe(11)
    expect(p.filter((x) => x.hourlyPrice === null)).toHaveLength(4)
    expect(p.filter((x) => x.hourlyPrice !== null)).toHaveLength(7)
    expect(p.find((x) => x.id === 8943)?.hourlyPrice).toBe(90)
    expect(p.find((x) => x.id === 8934)?.hourlyPrice).toBe(80)
  })
})
