#!/usr/bin/env node
/**
 * users-crud-test.mjs — 用户列表「增加 / 查询 / 编辑 / 删除」全流程测试（含 localStorage 持久化）。
 * Usage: node tools/users-crud-test.mjs [--url=http://127.0.0.1:5173/users.html]
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
const rowByText = (text) => page.locator('[data-testid="user-row"]', { hasText: text })
const totalText = () => page.locator('.pg-total').textContent()
const confirmDialog = () => page.locator('[data-testid="dialog-confirm"]')

async function reload() {
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(350)
}

await page.goto(URL_, { waitUntil: 'load' })
await page.evaluate(() => localStorage.removeItem('llm-dashboard.users.v1'))
await reload()

check('初始加载无报错', errors.length === 0, errors.join(' | '))
check('初始总数 48 条', (await totalText()).includes('共 48 条记录'))
check('第一页 10 条', (await rows().count()) === 10)

/* ==================== 增加 ==================== */
await page.locator('[data-testid="add-user"]').click()
await page.waitForTimeout(200)
check('新增弹窗打开', await page.locator('[data-testid="form-username"]').isVisible())
await page.locator('[data-testid="form-username"]').fill('cruduser')
await page.locator('[data-testid="form-email"]').fill('crud@example.com')
await page.locator('[data-testid="dialog-confirm"]').click()
await page.waitForTimeout(300)
check('新增后总数 49 条', (await totalText()).includes('共 49 条记录'))
check('新增用户出现在列表首行', (await rows().first().textContent()).includes('cruduser'))
check('新增用户邮箱正确', (await rows().first().textContent()).includes('crud@example.com'))
const createdRowText = await rows().first().textContent()
await reload()
check('刷新后新增数据仍在（localStorage）', (await rowByText('cruduser').count()) === 1)

/* ==================== 重复新增校验 ==================== */
await page.locator('[data-testid="add-user"]').click()
await page.waitForTimeout(150)
await page.locator('[data-testid="form-username"]').fill('cruduser')
await page.locator('[data-testid="dialog-confirm"]').click()
await page.waitForTimeout(250)
check('重复用户名被拦截', (await page.locator('[data-testid="form-username"]').isVisible()) && (await page.locator('.toast, [class*=toast]').first().textContent().catch(() => '')).includes('已存在'))
await page.locator('[data-testid="dialog-cancel"]').click()
await page.waitForTimeout(200)

/* ==================== 查询 ==================== */
await page.locator('[data-testid="search-input"]').fill('cruduser')
await page.locator('[data-testid="query-btn"]').click()
await page.waitForTimeout(200)
check('按用户名查询命中 1 条', (await rows().count()) === 1 && (await rows().first().textContent()).includes('cruduser'))
await page.locator('[data-testid="search-input"]').fill('10049')
await page.locator('[data-testid="query-btn"]').click()
await page.waitForTimeout(200)
check('按用户ID查询命中 1 条', (await rows().count()) === 1 && (await rows().first().textContent()).includes('cruduser'))
await page.locator('[data-testid="reset-btn"]').click()
await page.waitForTimeout(200)
check('重置后恢复 10 条', (await rows().count()) === 10)

/* ==================== 编辑 ==================== */
const target = rowByText('cruduser')
await target.locator('[data-testid="edit-user"]').click()
await page.waitForTimeout(200)
check('编辑弹窗回填用户名', await page.locator('[data-testid="form-username"]').inputValue() === 'cruduser')
await page.locator('[data-testid="form-email"]').fill('edited@example.com')
await page.locator('[data-testid="form-role"]').selectOption({ label: '开发者' })
await page.locator('[data-testid="form-status"]').selectOption({ label: '停用' })
await page.locator('[data-testid="dialog-confirm"]').click()
await page.waitForTimeout(300)
const edited = rowByText('cruduser')
check('编辑后邮箱更新', (await edited.textContent()).includes('edited@example.com'))
check('编辑后角色更新', (await edited.textContent()).includes('开发者'))
check('编辑后状态更新', (await edited.textContent()).includes('已停用'))
await reload()
check('刷新后编辑结果仍在', (await rowByText('cruduser').textContent()).includes('edited@example.com'))

/* ==================== 删除 ==================== */
const delTarget = rowByText('cruduser')
await delTarget.locator('[data-testid="delete-user"]').click()
await page.waitForTimeout(200)
check('删除确认弹窗出现', (await page.locator('.confirm-text').textContent()).includes('cruduser'))
await confirmDialog().click()
await page.waitForTimeout(300)
check('删除后记录消失', (await rowByText('cruduser').count()) === 0)
check('删除后总数恢复 48 条', (await totalText()).includes('共 48 条记录'))
await reload()
check('刷新后删除结果保持', (await rowByText('cruduser').count()) === 0)

check('全流程无运行时错误', errors.length === 0, errors.join(' | '))
console.log(results.join('\n'))
await browser.close()
;({
  created: createdRowText,
})
