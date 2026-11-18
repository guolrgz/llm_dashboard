#!/usr/bin/env node
/**
 * tools/e2e/recon.mjs — 调试辅助：登录后逐路由抓取 DOM 摘要（导航项 / 按钮 / 输入框 / 文本），
 * 用于在实现尚未稳定时快速对齐 E2E 选择器。不参与验收结论。
 *
 * Usage: node tools/e2e/recon.mjs [--frontend=...] [--backend=...] [--routes=/,/users,/roles,/permissions,/traffic,/models,/settings]
 * Output: tools/out/e2e/recon.json + recon-<route>.png
 */
import {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  bodyText,
  launchBrowser,
  loginApi,
  newInstrumentedPage,
  parseArgs,
  resolveUrls,
  settle,
  waitForAny,
} from './lib.mjs'

const args = parseArgs({
  frontend: DEFAULT_FRONTEND,
  backend: DEFAULT_BACKEND,
  routes: '/,/users,/roles,/permissions,/traffic,/models,/settings',
})
const { frontend, backend } = resolveUrls(args)
const routes = String(args.routes).split(',').map((r) => r.trim()).filter(Boolean)

const login = await loginApi(frontend)
const browser = await launchBrowser()
const out = { frontend, backend, routes: [] }
try {
  const { context, page } = await newInstrumentedPage(browser, { token: login.token, viewport: { width: 1672, height: 941 } })
  for (const route of routes) {
    const hash = route === '/' ? '#/' : `#${route}`
    try {
      await page.goto(`${frontend}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await waitForAny(async () => /总请求量|用户管理|角色管理|权限管理|流量监控|系统设置|模型管理|登录/.test(await bodyText(page)), {
        timeout: 15000,
      }).catch(() => {})
      await settle(page, { ms: 500 })
      const dom = await page.evaluate(() => {
        const describe = (el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          testid: el.getAttribute('data-testid'),
          cls: String(el.className || '').slice(0, 120),
          placeholder: el.getAttribute('placeholder'),
          type: el.getAttribute('type'),
          aria: el.getAttribute('aria-label'),
        })
        return {
          url: location.href,
          title: document.title,
          navs: [...document.querySelectorAll('.sidebar a, aside a, .nav-item, [role="navigation"] a')].map(describe),
          buttons: [...document.querySelectorAll('button, .act-link, [role="button"]')].slice(0, 60).map(describe),
          inputs: [...document.querySelectorAll('input, select, textarea')].slice(0, 40).map(describe),
          testids: [...document.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid')).slice(0, 80),
          headings: [...document.querySelectorAll('h1,h2,h3')].map((el) => (el.textContent || '').trim()),
        }
      })
      const text = await bodyText(page)
      const shot = `tools/out/e2e/recon-${route.replace(/[^a-z0-9]/gi, '') || 'root'}.png`
      await page.screenshot({ path: shot, animations: 'disabled' }).catch(() => {})
      out.routes.push({ route, ...dom, bodyText: text.slice(0, 1500), shot })
      console.log(`[recon] ${route} → ${dom.url} (${dom.testids.length} testids, ${text.length} chars)`)
    } catch (err) {
      out.routes.push({ route, error: String(err.message || err) })
      console.error(`[recon] ${route} FAILED: ${err.message}`)
    }
  }
} finally {
  await browser.close().catch(() => {})
}
const fs = await import('node:fs')
fs.writeFileSync('tools/out/e2e/recon.json', JSON.stringify(out, null, 2))
console.log('recon.json written')
