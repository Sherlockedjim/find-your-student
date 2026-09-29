import { test, expect } from '@playwright/test'
test('公开页面、筛选、收藏、申请与隐私', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await expect(page.locator('.order-card')).toHaveCount(11)
  await expect(page.getByText('地图示意 · 测试资料，非真实订单')).toBeVisible()
  await page.getByRole('textbox', { name: '搜索订单' }).fill('8937')
  await expect(page.locator('.order-card')).toHaveCount(1)
  await expect(page.locator('.order-card')).toContainText('已接单')
  await expect(page.locator('.demo-pin')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索订单' }).fill('8944')
  await page.locator('.expand-button').click()
  await expect(page.getByRole('button', { name: /申请这个单子/ })).toBeEnabled()
  await page.getByRole('button', { name: '收藏单子', exact: true }).click()
  await page.getByRole('button', { name: '使用演示账号体验收藏（不注册）' }).click()
  await page.getByRole('button', { name: '收藏单子', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消收藏' })).toBeVisible()
  await page.getByRole('button', { name: /申请这个单子/ }).click()
  const fields = page
    .locator('.el-dialog')
    .filter({ hasText: '申请单子 #8944' })
    .locator('.el-form-item input')
  await fields.nth(0).fill('测试老师')
  await fields.nth(1).fill('demo_wechat')
  await fields.nth(2).fill('演示大学')
  await fields.nth(3).fill('周末下午')
  await page.getByRole('button', { name: '确认提交申请' }).click()
  await expect(page.getByText('演示申请已保存到本次会话后台，刷新后清除。')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('完整地址：')
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/visitor-desktop.png', fullPage: true })
})
test('后台上传预览、部分入库、重复隔离及Excel下载', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./#admin')
  await page.getByRole('button', { name: '体验演示后台' }).click()
  await page.getByRole('tab', { name: 'TXT 导入' }).click()
  const record = (id: number) =>
    `${id}\n四年级数学\n地址：天河区测试花园\n时间：周末待定\n课酬：200元/2小时\n要求：认真负责`
  await page.locator('input[type=file]').setInputFiles({
    name: 'sample.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(record(8944) + '\n\n' + record(9901)),
  })
  await expect(page.getByText('2 条解析结果')).toBeVisible()
  await page.getByRole('button', { name: '确认入库', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '确认入库' }).click()
  await expect(page.getByRole('tab', { name: '编号异常 (1)' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '学生单总表' }).click()
  await expect(page.getByRole('tabpanel', { name: '学生单总表' }).locator('.el-table__body')).toContainText(
    '9901',
  )
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Excel 总表' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/)
  await file.saveAs('test-results/admin-export.xlsx')
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile('test-results/admin-export.xlsx')
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(15)
  expect(sheet.getRow(1).values).toEqual(
    expect.arrayContaining(['完整地址', '原始文本', '来源文件', '解析异常']),
  )
  const ids = sheet.getColumn(1).values.slice(2)
  expect(new Set(ids).size).toBe(14)
  expect(ids).toContain(9901)
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})
test('移动端无横向溢出且可收起侧栏看地图', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('.order-card').first()).toBeVisible()
  await page.getByRole('button', { name: '收起侧栏' }).click()
  await expect(page.getByRole('button', { name: '展开单子列表' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/visitor-mobile.png', fullPage: true })
})
