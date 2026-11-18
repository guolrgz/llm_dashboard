#!/usr/bin/env node
/**
 * users-ui-test.mjs — 用户管理页交互与响应式冒烟测试。
 * Usage: node tools/users-ui-test.mjs [--url=http://127.0.0.1:5173/]
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
const BASE = (urlArg ? urlArg.slice('--url='.length) : 'http://127.0.0.1:5173/').replace(/#.*$/, '')
const USERS = `${BASE}#/users`

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'zh-CN' })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
const results = []
const check = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!cond) process.exitCode = 1
}

await page.goto(USERS, { waitUntil: 'load' })
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })
await page.waitForTimeout(250)

check('users page loads, no console errors', errors.length === 0, errors.join(' | '))
check('h1 is 用户管理', (await page.locator('.users-page h1').textContent())?.trim() === '用户管理')
const rows = () => page.locator('.users-table tbody tr')
check('initial 4 rows', (await rows().count()) === 4)

/* 搜索 + 查询 */
await page.locator('.users-search input').fill('alice')
await page.getByRole('button', { name: '查询', exact: true }).click()
await page.waitForTimeout(120)
check('search filters to alice', (await rows().count()) === 1 && (await rows().first().textContent()).includes('alice'))
await page.getByRole('button', { name: '重置', exact: true }).click()
await page.waitForTimeout(120)
check('reset restores 4 rows', (await rows().count()) === 4)

/* 状态筛选 */
await page.locator('.users-field').first().getByRole('button', { name: '停用', exact: true }).click()
await page.waitForTimeout(120)
check('status filter 停用 shows bob only', (await rows().count()) === 1 && (await rows().first().textContent()).includes('bob'))
await page.getByRole('button', { name: '重置', exact: true }).click()
await page.waitForTimeout(120)

/* 角色筛选 */
await page.locator('.users-field').nth(1).getByRole('button', { name: '管理员', exact: true }).click()
await page.waitForTimeout(120)
check('role filter 管理员 shows admin only', (await rows().count()) === 1 && (await rows().first().textContent()).includes('admin'))
await page.getByRole('button', { name: '重置', exact: true }).click()
await page.waitForTimeout(120)

/* 行内停用 / 启用 */
const firstRow = rows().first()
check('row1 badge is 已启用', (await firstRow.locator('.u-badge').textContent())?.trim() === '已启用')
await firstRow.getByRole('button', { name: '停用', exact: true }).click()
check('row1 toggled to 已停用', (await firstRow.locator('.u-badge').textContent())?.trim() === '已停用')
await firstRow.getByRole('button', { name: '启用', exact: true }).click()
check('row1 toggled back to 已启用', (await firstRow.locator('.u-badge').textContent())?.trim() === '已启用')

/* 全选 + 批量按钮可用性 */
const batchToggle = page.getByRole('button', { name: /批量启用\/停用/ })
check('batch toggle disabled initially', await batchToggle.isDisabled())
await page.locator('.users-table thead .u-checkbox').check()
check('select-all checks all rows', (await page.locator('.users-table tbody .u-checkbox:checked').count()) === 4)
check('batch toggle enabled after selection', !(await batchToggle.isDisabled()))
await page.locator('.users-table thead .u-checkbox').uncheck()
check('select-all cleared', (await page.locator('.users-table tbody .u-checkbox:checked').count()) === 0)

/* 分页 */
await page.locator('.u-page-btn', { hasText: '2' }).click()
await page.waitForTimeout(120)
check('pagination page 2 active', await page.locator('.u-page-btn.is-active').textContent() === '2')
check('page 2 shows empty hint', (await page.locator('.u-empty').count()) === 1)
await page.locator('.u-page-btn', { hasText: '1' }).click()
await page.waitForTimeout(120)
check('back to page 1 shows 4 rows', (await rows().count()) === 4)

/* 新增用户弹窗 */
await page.getByRole('button', { name: /新增用户/ }).click()
await page.waitForTimeout(150)
check('create dialog opens', await page.locator('.u-modal').isVisible())
await page.locator('.u-modal .u-form-row').nth(0).locator('input').fill('charlie')
await page.locator('.u-modal .u-form-row').nth(1).locator('input').fill('10005')
await page.locator('.u-modal .u-form-row').nth(3).locator('input').fill('charlie@example.com')
await page.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(150)
check('new user added to table', (await rows().count()) === 5 && (await rows().last().textContent()).includes('charlie'))

/* 从 Dashboard 进入用户管理 */
await page.goto(`${BASE}#/`, { waitUntil: 'load' })
await page.waitForTimeout(250)
check('dashboard renders after route change', (await page.locator('.page-heading h1').textContent())?.trim() === 'Dashboard')
await page.locator('.nav .nav-item').nth(1).click()
await page.waitForTimeout(300)
check('sidebar 用户管理 navigates to users page', (await page.locator('.users-page h1').textContent())?.trim() === '用户管理')
check('users nav item is active', await page.locator('.nav .nav-item.is-active').textContent().then((t) => t.includes('用户管理')))

/* 移动端抽屉 */
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(300)
check('mobile: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) === 0)
check('mobile: drawer hidden', !(await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open'))))
await page.locator('.hamburger').click()
await page.waitForTimeout(300)
check('mobile: drawer opens', await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open')))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('mobile: Escape closes drawer', !(await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open'))))
check('mobile: table scrolls horizontally', await page.locator('.users-table-wrap').evaluate((el) => el.scrollWidth > el.clientWidth))

check('no runtime errors', errors.length === 0, errors.join(' | '))
console.log(results.join('\n'))
await browser.close()
