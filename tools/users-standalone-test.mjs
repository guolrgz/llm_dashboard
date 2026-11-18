#!/usr/bin/env node
/**
 * users-standalone-test.mjs — 用户管理独立页面（users.html）交互冒烟测试。
 * Usage: node tools/users-standalone-test.mjs [--url=http://127.0.0.1:5173/users.html]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..')
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(HERE, 'browsers')
const libDirs = [
  path.join(HERE, 'libs/usr/lib/x86_64-linux-gnu'),
  path.join(HERE, 'libs/lib/x86_64-linux-gnu'),
].filter((d) => fs.existsSync(d))
process.env.LD_LIBRARY_PATH = [...libDirs, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':')

const { chromium } = await import('playwright')
const argv = process.argv.slice(2)
const urlArg = argv.find((a) => a.startsWith('--url='))
const URL_ = urlArg ? urlArg.slice('--url='.length) : 'http://127.0.0.1:5173/users.html'

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'zh-CN' })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
const results = []
const check = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!cond) process.exitCode = 1
}
const rows = () => page.locator('[data-testid="user-row"]')

await page.goto(URL_, { waitUntil: 'load' })
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })
await page.waitForTimeout(350)

check('page loads, no console errors', errors.length === 0, errors.join(' | '))
check('h1 is 用户管理', (await page.locator('.users-page h1').textContent())?.trim() === '用户管理')
check('page size 10 rows', (await rows().count()) === 10)

/* 搜索 */
await page.locator('[data-testid="search-input"]').fill('alice')
await page.locator('[data-testid="query-btn"]').click()
await page.waitForTimeout(150)
check('search filters to alice', (await rows().count()) === 1 && (await rows().first().textContent()).includes('alice'))
await page.locator('[data-testid="reset-btn"]').click()
await page.waitForTimeout(150)

/* 状态筛选 */
await page.locator('[data-testid="opt-status-disabled"]').click()
await page.waitForTimeout(150)
const disabledTexts = await rows().allTextContents()
check('status filter 停用 works', disabledTexts.length > 0 && disabledTexts.every((t) => t.includes('已停用')))
await page.locator('[data-testid="reset-btn"]').click()
await page.waitForTimeout(150)

/* 分页 */
await page.locator('[data-testid="page-btn-2"]').click()
await page.waitForTimeout(200)
check('page 2 shows 11th user ivy', (await rows().first().textContent()).includes('ivy'))
await page.locator('[data-testid="page-btn-1"]').click()
await page.waitForTimeout(150)

/* 行内启停 */
const firstRow = rows().first()
const badgeBefore = (await firstRow.locator('.status-badge, [class*=badge]').first().textContent()).trim()
await firstRow.locator('[data-testid="toggle-status"]').click()
await page.waitForTimeout(150)
const badgeAfter = (await firstRow.locator('.status-badge, [class*=badge]').first().textContent()).trim()
check('row status toggles', badgeBefore !== badgeAfter, `${badgeBefore} -> ${badgeAfter}`)

/* 新增弹窗 */
await page.locator('[data-testid="add-user"]').click()
await page.waitForTimeout(200)
check('create dialog opens', await page.locator('[data-testid="form-username"]').isVisible())
await page.locator('[data-testid="form-username"]').fill('testuser')
await page.locator('[data-testid="form-email"]').fill('test@example.com')
await page.getByRole('button', { name: '确定', exact: true }).click()
await page.waitForTimeout(250)
check('new user added', (await page.locator('body').textContent()).includes('testuser'))

/* 移动端 */
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(300)
check('mobile: no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) === 0)
check('no runtime errors', errors.length === 0, errors.join(' | '))

console.log(results.join('\n'))
await browser.close()
