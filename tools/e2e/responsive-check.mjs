#!/usr/bin/env node
/**
 * tools/e2e/responsive-check.mjs — 响应式验收。
 *
 *  - 1672 / 1440 / 1024 / 768 / 390 五档宽度检查横向溢出（Dashboard）；
 *  - 1024 / 768 / 390 额外检查 用户管理/角色/权限/流量监控/系统设置 页面；
 *  - 390 移动端：汉堡按钮打开侧栏抽屉、背景遮罩/Esc 关闭。
 *
 * Usage: node tools/e2e/responsive-check.mjs [--frontend=...] [--backend=...]
 * Output: tools/out/e2e/responsive-check.json + responsive-*.png
 */
import {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  bodyText,
  clickFirst,
  findVisible,
  launchBrowser,
  loginApi,
  newInstrumentedPage,
  parseArgs,
  resolveUrls,
  runScript,
  settle,
  sleep,
  waitForAny,
  waitForBackend,
  waitForBodyText,
  waitForFrontend,
} from './lib.mjs'

const args = parseArgs({
  frontend: DEFAULT_FRONTEND,
  backend: DEFAULT_BACKEND,
  waitTimeout: 60000,
})
const { frontend, backend } = resolveUrls(args)

const WIDTHS = [
  { width: 1672, height: 941, label: '1672 (设计基线)' },
  { width: 1440, height: 900, label: '1440 (笔记本)' },
  { width: 1024, height: 768, label: '1024 (平板横屏)' },
  { width: 768, height: 1024, label: '768 (平板)' },
  { width: 390, height: 844, label: '390 (手机)' },
]
const EXTRA_ROUTES = [
  { hash: '#/users', name: '用户管理', marker: '用户管理' },
  { hash: '#/roles', name: '角色管理', marker: '角色管理' },
  { hash: '#/permissions', name: '权限管理', marker: '权限管理' },
  { hash: '#/traffic', name: '流量监控', marker: '流量监控' },
  { hash: '#/settings', name: '系统设置', marker: '系统设置' },
]
const EXTRA_WIDTHS = [1024, 768, 390]

const HAMBURGER_SELECTORS = [
  '.hamburger',
  '.topbar button[aria-label*="菜单"]',
  '[data-testid="hamburger"]',
  'button[aria-controls="sidebar"]',
  '.icon-btn.hamburger',
]

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const body = document.body
    return {
      scrollWidth: Math.max(de.scrollWidth, body ? body.scrollWidth : 0),
      clientWidth: de.clientWidth,
      innerWidth: window.innerWidth,
      scrollHeight: Math.max(de.scrollHeight, body ? body.scrollHeight : 0),
      hash: location.hash || '#/',
    }
  })
}

async function appClass(page) {
  return page.evaluate(() => document.querySelector('.app')?.className || document.querySelector('#app')?.className || '')
}

async function sidebarBox(page) {
  const sidebar = await findVisible(page, ['.sidebar', 'aside.sidebar', '[data-testid="sidebar"]'], { timeout: 1200 })
  if (!sidebar) return null
  try {
    return await sidebar.locator.boundingBox()
  } catch {
    return null
  }
}

await runScript('responsive-check', async (report) => {
  report.env = { frontend, backend, node: process.version, startedAt: new Date().toISOString() }
  await waitForBackend(backend, { timeoutMs: Number(args.waitTimeout) })
  await waitForFrontend(frontend, { timeoutMs: Number(args.waitTimeout) })
  const login = await loginApi(frontend)
  report.info('登录方式', `API 登录后注入 localStorage.llm_token（user=${login.user?.username}）`)

  const browser = await launchBrowser()
  const rows = []
  try {
    for (const spec of WIDTHS) {
      const { context, page, errors } = await newInstrumentedPage(browser, {
        token: login.token,
        viewport: { width: spec.width, height: spec.height },
        dsf: 1,
      })
      try {
        await page.goto(`${frontend}/#/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const loaded = await waitForAny(async () => {
          const text = await bodyText(page)
          return /总请求量|Dashboard/.test(text)
        }, { timeout: 25000 })
        await settle(page, { ms: 500, networkIdle: 3000 })
        const m = await measure(page)
        const overflow = m.scrollWidth > m.clientWidth + 1
        rows.push({ width: spec.width, route: '#/', scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, overflow })
        report.check(
          `宽度 ${spec.label}：Dashboard 无横向溢出`,
          loaded && !overflow,
          loaded ? `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}` : '页面未渲染（未出现 Dashboard 文案）'
        )
        if (errors.pageErrors.length) report.info(`宽度 ${spec.width} pageerror`, errors.pageErrors.slice(0, 2).join(' | '))
        await report.shot(page, `dashboard-${spec.width}`)

        // 每个宽度检查侧栏可见性（>=1024 应为常驻，<1024 应为抽屉）
        const app = await appClass(page)
        report.info(`宽度 ${spec.width} 侧栏状态`, `app.class="${app.replace(/\s+/g, ' ').trim()}"`)

        // ---- 移动端抽屉 ----
        if (spec.width < 1024) {
          await report.step(`宽度 ${spec.label}：汉堡按钮开关侧栏抽屉`, async () => {
            const hamburger = await findVisible(page, HAMBURGER_SELECTORS, { timeout: 4000 })
            if (!hamburger) throw new Error('找不到汉堡按钮')
            const beforeClass = await appClass(page)
            const beforeBox = await sidebarBox(page)
            await hamburger.locator.click()
            await sleep(500)
            const openClass = await appClass(page)
            const openBox = await sidebarBox(page)
            await report.shot(page, `drawer-open-${spec.width}`)
            const opened =
              /sidebar-open/.test(openClass) ||
              (openBox && openBox.x >= -1 && (!beforeBox || beforeBox.x < -20))
            if (!opened) {
              throw new Error(
                `点击汉堡后侧栏未展开（class="${openClass.replace(/\s+/g, ' ').trim()}" x=${openBox?.x ?? 'n/a'}）`
              )
            }
            // 关闭：优先点遮罩右侧（避免落在抽屉内部），其次 Esc
            const backdrop = await findVisible(page, ['.sidebar-backdrop', '.backdrop', '[data-testid="backdrop"]'], {
              timeout: 1200,
            })
            let closedBy = 'Escape'
            if (backdrop) {
              const box = await backdrop.locator.boundingBox().catch(() => null)
              const position = box && box.width > 300
                ? { x: Math.max(20, Math.round(box.width * 0.8)), y: Math.round(box.height / 2) }
                : undefined
              try {
                await backdrop.locator.click({ position, timeout: 3000 })
                closedBy = 'backdrop'
              } catch {
                await page.keyboard.press('Escape').catch(() => {})
              }
            } else {
              await page.keyboard.press('Escape').catch(() => {})
            }
            await sleep(500)
            const closedClass = await appClass(page)
            const closedBox = await sidebarBox(page)
            const closed =
              !/sidebar-open/.test(closedClass) && (!closedBox || closedBox.x < -20 || closedBox.width === 0)
            await report.shot(page, `drawer-closed-${spec.width}`)
            if (!closed) {
              throw new Error(
                `侧栏抽屉未关闭（class="${closedClass.replace(/\s+/g, ' ').trim()}" x=${closedBox?.x ?? 'n/a'}）`
              )
            }
            return `openClass="${openClass.trim()}" → close(${closedBy}) ok`
          })
        }
      } finally {
        await context.close().catch(() => {})
      }
    }

    // ---- 平板/手机宽度下的其余页面横向溢出 ----
    for (const width of EXTRA_WIDTHS) {
      const spec = WIDTHS.find((w) => w.width === width)
      const { context, page } = await newInstrumentedPage(browser, {
        token: login.token,
        viewport: { width: spec.width, height: spec.height },
        dsf: 1,
      })
      try {
        for (const route of EXTRA_ROUTES) {
          try {
            await page.goto(`${frontend}/${route.hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await waitForBodyText(page, [route.marker], { timeout: 20000 }).catch(() => {})
            await settle(page, { ms: 400, networkIdle: 2500 })
            const m = await measure(page)
            const overflow = m.scrollWidth > m.clientWidth + 1
            rows.push({ width, route: route.hash, scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, overflow })
            report.check(
              `宽度 ${width}：${route.name} 无横向溢出`,
              !overflow,
              `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} hash=${m.hash}`
            )
          } catch (err) {
            report.fail(`宽度 ${width}：${route.name} 页面检查`, err.message)
          }
        }
      } finally {
        await context.close().catch(() => {})
      }
    }
  } finally {
    await browser.close().catch(() => {})
  }

  report.data.responsive = rows
  const overflowRows = rows.filter((row) => row.overflow)
  report.info(
    '横向溢出汇总',
    overflowRows.length
      ? overflowRows.map((row) => `${row.width}px ${row.route}: ${row.scrollWidth}>${row.clientWidth}`).join('; ')
      : '所有被测宽度/页面均无横向溢出'
  )
})
