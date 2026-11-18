#!/usr/bin/env node
/**
 * tools/e2e/lib.mjs — shared helpers for the LLM Token 流量管理系统 QA E2E suite.
 *
 * Responsibilities:
 *  - configure the Chromium runtime env (PLAYWRIGHT_BROWSERS_PATH + LD_LIBRARY_PATH)
 *    *before* playwright is imported, so `node tools/e2e/<script>.mjs` runs anywhere;
 *  - browser/context/page helpers, deterministic screenshots, error collectors;
 *  - HTTP helpers (native fetch) for the backend / Vite proxy;
 *  - readiness probes (/health on :8000, HTML on :5173);
 *  - a tiny PASS/FAIL report collector that writes tools/out/e2e/<script>.json.
 *
 * Only files under tools/out/** are written by this library.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const TOOLS = path.resolve(HERE, '..')
export const PROJECT = path.resolve(TOOLS, '..')

// ---- chromium runtime env (must be set before `import('playwright')`) ------
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(TOOLS, 'browsers')
const libDirs = [
  path.join(TOOLS, 'libs/usr/lib/x86_64-linux-gnu'),
  path.join(TOOLS, 'libs/lib/x86_64-linux-gnu'),
].filter((d) => fs.existsSync(d))
process.env.LD_LIBRARY_PATH = [...libDirs, process.env.LD_LIBRARY_PATH || '']
  .filter(Boolean)
  .join(':')

// ---- constants -------------------------------------------------------------
export const OUT_DIR = path.resolve(PROJECT, process.env.E2E_OUT_DIR || 'tools/out/e2e')
export const DEFAULT_FRONTEND = (process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '')
export const DEFAULT_BACKEND = (process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
export const DEMO = {
  username: 'admin',
  password: 'admin123',
  adminKey: 'sk-demo-admin-2026',
  quotaKey: 'sk-demo-user123-2026',
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const rel = (p) => path.relative(PROJECT, p)
export const mkdirp = (dir) => fs.mkdirSync(dir, { recursive: true })
mkdirp(OUT_DIR)
mkdirp(path.join(OUT_DIR, 'logs'))

// ---- args ------------------------------------------------------------------
/** Parse `--key=value` / `--flag` CLI args merged over defaults (camelCased). */
export function parseArgs(defaults = {}) {
  const out = { ...defaults }
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([A-Za-z0-9-]+)(?:=(.*))?$/)
    if (!m) continue
    const [, rawKey, rawValue] = m
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (!(key in out)) {
      out[key] = rawValue === undefined ? true : rawValue
      continue
    }
    const current = out[key]
    if (typeof current === 'number') out[key] = Number(rawValue)
    else if (typeof current === 'boolean') out[key] = rawValue === undefined ? true : rawValue !== 'false' && rawValue !== '0'
    else out[key] = rawValue === undefined ? true : rawValue
  }
  return out
}

export function resolveUrls(args = {}) {
  return {
    frontend: String(args.frontend || DEFAULT_FRONTEND).replace(/\/+$/, ''),
    backend: String(args.backend || DEFAULT_BACKEND).replace(/\/+$/, ''),
  }
}

// ---- HTTP helpers (native fetch) ------------------------------------------
/**
 * Call a JSON HTTP endpoint.
 * @returns {Promise<{status:number, ok:boolean, headers:Headers, json:any, text:string, url:string}>}
 */
export async function apiCall(origin, pathname, { method = 'GET', token, body, timeoutMs = 30000 } = {}) {
  const base = String(origin).replace(/\/+$/, '')
  const url = base + (pathname.startsWith('/') ? pathname : `/${pathname}`)
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        /* non-JSON payload (SSE, 204, static) */
      }
    }
    return { status: res.status, ok: res.ok, headers: res.headers, json, text, url }
  } finally {
    clearTimeout(timer)
  }
}

export async function loginApi(origin, { username = DEMO.username, password = DEMO.password } = {}) {
  const res = await apiCall(origin, '/api/auth/login', { method: 'POST', body: { username, password } })
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`login failed at ${origin}: HTTP ${res.status} ${res.text.slice(0, 300)}`)
  }
  return { token: res.json.token, user: res.json.user, expiresAt: res.json.expiresAt }
}

/** Poll `${base}/health` until `{status:"ok"}`. Throws after timeout. */
export async function waitForBackend(base, { timeoutMs = 180000, intervalMs = 1000, log = () => {}, label = 'backend' } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = 'no attempt'
  let ticks = 0
  while (Date.now() < deadline) {
    try {
      const res = await apiCall(base, '/health', { timeoutMs: 3000 })
      if (res.status === 200 && res.json && res.json.status === 'ok') {
        log(`[ready] ${label} ${base}/health ok (version ${res.json.version ?? '?'})`)
        return res.json
      }
      last = `HTTP ${res.status} ${res.text.slice(0, 120)}`
    } catch (err) {
      last = err.message
    }
    if (++ticks % 10 === 0) log(`[wait] ${label} ${base}/health not ready yet (${last})`)
    await sleep(intervalMs)
  }
  throw new Error(`${label} ${base}/health not ready after ${Math.round(timeoutMs / 1000)}s: ${last}`)
}

/** Poll `${base}/` until the Vite dev server HTML is served. */
export async function waitForFrontend(base, { timeoutMs = 120000, intervalMs = 500, log = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = 'no attempt'
  let ticks = 0
  while (Date.now() < deadline) {
    try {
      const res = await apiCall(base, '/', { timeoutMs: 3000 })
      if (res.status === 200 && /id=["']app["']/.test(res.text)) {
        log(`[ready] frontend ${base}/ ok`)
        return true
      }
      last = `HTTP ${res.status}`
    } catch (err) {
      last = err.message
    }
    if (++ticks % 10 === 0) log(`[wait] frontend ${base}/ not ready yet (${last})`)
    await sleep(intervalMs)
  }
  throw new Error(`frontend ${base}/ not ready after ${Math.round(timeoutMs / 1000)}s: ${last}`)
}

// ---- playwright helpers ----------------------------------------------------
export async function launchBrowser({ args = [] } = {}) {
  const { chromium } = await import('playwright')
  return chromium.launch({
    args: [
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--disable-lcd-text',
      '--font-render-hinting=none',
      '--disable-gpu',
      '--no-sandbox',
      ...args,
    ],
  })
}

/** Persist a bearer token into localStorage under the contract key (llm_token). */
export async function primeToken(context, token) {
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem('llm_token', value)
    } catch {
      /* storage unavailable */
    }
  }, token)
}

export function attachErrorCollectors(page) {
  const collected = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on('console', (msg) => {
    if (msg.type() === 'error') collected.consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => collected.pageErrors.push(String(err)))
  page.on('requestfailed', (req) => {
    const failure = req.failure()
    if (!failure || failure.errorText.includes('ERR_ABORTED')) return
    const url = req.url()
    if (/favicon\.ico$/.test(url)) return
    collected.failedRequests.push(`${url} :: ${failure.errorText}`)
  })
  return collected
}

/**
 * Create a context + page with deterministic rendering defaults.
 * @returns {Promise<{context:import('playwright').BrowserContext,page:import('playwright').Page,errors:object}>}
 */
export async function newInstrumentedPage(browser, { token, viewport = { width: 1672, height: 941 }, dsf = 1, extraContext = {} } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'zh-CN',
    ...extraContext,
  })
  if (token) await primeToken(context, token)
  const page = await context.newPage()
  const errors = attachErrorCollectors(page)
  return { context, page, errors }
}

/** Best-effort deterministic screenshot setup (fonts + animations). */
export async function settle(page, { ms = 300, networkIdle = 2500 } = {}) {
  try {
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready
    })
  } catch {
    /* navigation raced */
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: networkIdle })
  } catch {
    /* best effort */
  }
  try {
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;' +
        'transition-duration:0s !important;transition-delay:0s !important;caret-color:transparent !important}' +
        'html{scroll-behavior:auto !important}',
    })
  } catch {
    /* best effort */
  }
  if (ms > 0) await sleep(ms)
}

/** Screenshot into tools/out/e2e/, returns the project-relative path. */
export async function screenshot(page, name, { fullPage = false, clip } = {}) {
  const file = path.join(OUT_DIR, name.endsWith('.png') ? name : `${name}.png`)
  await page.screenshot({ path: file, fullPage, animations: 'disabled', caret: 'hide', ...(clip ? { clip } : {}) })
  return rel(file)
}

export async function bodyText(page) {
  return page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '')
}

// ---- selector helpers ------------------------------------------------------
/** Return the first visible locator among `selectors` (scoped to `scope`). */
export async function findVisible(scope, selectors, { timeout = 0, poll = 100 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    for (const selector of selectors) {
      try {
        const locator = scope.locator(selector)
        const count = await locator.count()
        const limit = Math.min(count, 8)
        for (let i = 0; i < limit; i += 1) {
          const candidate = scope.locator(selector).nth(i)
          if (await candidate.isVisible().catch(() => false)) return { selector, locator: candidate }
        }
      } catch {
        /* invalid selector for this scope — try the next one */
      }
    }
    if (Date.now() >= deadline) return null
    await sleep(poll)
  }
}

export async function hasVisible(scope, selectors, opts = {}) {
  return Boolean(await findVisible(scope, selectors, opts))
}

export async function fillFirst(scope, selectors, value, { timeout = 12000 } = {}) {
  const found = await findVisible(scope, selectors, { timeout })
  if (!found) throw new Error(`input not found: ${selectors.join(' | ')}`)
  await found.locator.scrollIntoViewIfNeeded().catch(() => {})
  await found.locator.fill(String(value))
  return found.selector
}

export async function clickFirst(scope, selectors, { timeout = 12000, force = false } = {}) {
  const found = await findVisible(scope, selectors, { timeout })
  if (!found) throw new Error(`clickable not found: ${selectors.join(' | ')}`)
  await found.locator.scrollIntoViewIfNeeded().catch(() => {})
  await found.locator.click({ timeout: 8000, force })
  return found.selector
}

/** Select an <option> by label/value/index, or fall back to a custom dropdown. */
export async function selectByLabel(scope, selectors, labels, { timeout = 8000 } = {}) {
  const wanted = (Array.isArray(labels) ? labels : [labels]).filter(Boolean)
  const found = await findVisible(scope, selectors, { timeout })
  if (found) {
    const options = await found.locator.evaluate((el) =>
      el && el.tagName === 'SELECT' ? [...el.options].map((o) => ({ label: o.textContent.trim(), value: o.value })) : []
    )
    const match = options.find((o) => wanted.includes(o.label))
    if (match) {
      await found.locator.selectOption({ label: match.label })
      return { selector: found.selector, picked: match.label }
    }
    if (options.length) {
      await found.locator.selectOption({ index: 0 })
      return { selector: found.selector, picked: options[0].label, fallback: true }
    }
  }
  // custom dropdown fallback: click the trigger then the wanted text
  const trigger = await findVisible(scope, selectors, { timeout: 1000 })
  if (trigger) await trigger.locator.click().catch(() => {})
  for (const label of wanted) {
    const option = await findVisible(scope, [`text="${label}"`, `[role="option"]:has-text("${label}")`], { timeout: 800 })
    if (option) {
      await option.locator.click()
      return { selector: option.selector, picked: label }
    }
  }
  return null
}

export async function waitForBodyText(page, needles, { timeout = 20000, poll = 150 } = {}) {
  const list = Array.isArray(needles) ? needles : [needles]
  const deadline = Date.now() + timeout
  let last = ''
  while (Date.now() < deadline) {
    last = await bodyText(page)
    if (list.every((n) => (typeof n === 'string' ? last.includes(n) : n.test(last)))) return last
    await sleep(poll)
  }
  throw new Error(`body text missing ${list.map(String).join(' / ')}; body starts: ${last.slice(0, 240).replace(/\s+/g, ' ')}`)
}

export async function waitForAny(stateFn, { timeout = 20000, poll = 150 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await stateFn()) return true
    await sleep(poll)
  }
  return false
}

// ---- login helpers ---------------------------------------------------------
export const LOGIN_SELECTORS = {
  username: [
    '[data-testid="login-username"]',
    'input[name="username"]',
    'input#username',
    'input[autocomplete="username"]',
    'input[placeholder*="用户名"]',
    'input[placeholder*="账号"]',
    '.login-card input[type="text"]',
    'form input[type="text"]',
  ],
  password: [
    '[data-testid="login-password"]',
    'input[name="password"]',
    'input#password',
    'input[autocomplete="current-password"]',
    'input[type="password"]',
  ],
  submit: [
    '[data-testid="login-submit"]',
    'form button[type="submit"]',
    'button[type="submit"]',
    'button:has-text("登录")',
    'button:has-text("登 录")',
    '.login-btn',
  ],
}

export async function hasLoginForm(page) {
  const username = await findVisible(page, LOGIN_SELECTORS.username, { timeout: 800 })
  const password = await findVisible(page, LOGIN_SELECTORS.password, { timeout: 800 })
  return Boolean(username && password)
}

/**
 * Fill + submit the login form. Returns the selectors actually used.
 * Does NOT assert the post-login route (callers decide what to wait for).
 */
export async function uiLogin(page, { username = DEMO.username, password = DEMO.password, timeout = 25000 } = {}) {
  const usernameField = await findVisible(page, LOGIN_SELECTORS.username, { timeout })
  if (!usernameField) throw new Error('login form: username input not found')
  await usernameField.locator.fill(username)
  const passwordField = await findVisible(page, LOGIN_SELECTORS.password, { timeout: 5000 })
  if (!passwordField) throw new Error('login form: password input not found')
  await passwordField.locator.fill(password)
  let submitSelector = null
  const submit = await findVisible(page, LOGIN_SELECTORS.submit, { timeout: 4000 })
  if (submit) {
    submitSelector = submit.selector
    await submit.locator.click({ timeout: 8000 })
  } else {
    await passwordField.locator.press('Enter')
    submitSelector = 'Enter'
  }
  return { usernameSelector: usernameField.selector, passwordSelector: passwordField.selector, submitSelector }
}

export async function waitForConsoleReady(page, { timeout = 25000 } = {}) {
  const ok = await waitForAny(async () => {
    if (await hasLoginForm(page)) return false
    const text = await bodyText(page)
    return /总请求量|Dashboard/.test(text) && /用户管理/.test(text)
  }, { timeout })
  if (!ok) throw new Error(`console did not reach a logged-in shell within ${timeout}ms (url: ${page.url()})`)
}

// ---- sidebar navigation ----------------------------------------------------
export const NAV_LABELS = ['Dashboard', '用户管理', '角色管理', '权限管理', '流量监控', '系统设置']

/** Page markers used to prove a nav click actually switched the view. */
export const NAV_MARKERS = {
  Dashboard: [/总请求量/, /Token 使用量/, /成功率/],
  用户管理: [/用户管理/, /新增用户|用户列表|全部用户|共\s*\d+\s*条/],
  角色管理: [/角色管理/, /角色|权限/],
  权限管理: [/权限管理/, /权限|目录/],
  流量监控: [/流量监控/, /请求日志|限流|配额|流量/],
  系统设置: [/系统设置/, /配额|告警|运行时长|设置/],
}

export const NAV_HASH = {
  Dashboard: ['#/', ''],
  用户管理: ['#/users'],
  角色管理: ['#/roles'],
  权限管理: ['#/permissions'],
  流量监控: ['#/traffic'],
  系统设置: ['#/settings'],
}

export async function clickSidebarNav(page, label, { timeout = 12000 } = {}) {
  const selectors = [
    `.sidebar .nav-item:has-text("${label}")`,
    `.nav .nav-item:has-text("${label}")`,
    `aside .nav-item:has-text("${label}")`,
    `.sidebar a:has-text("${label}")`,
    `aside a:has-text("${label}")`,
  ]
  const found = await findVisible(page, selectors, { timeout })
  if (!found) throw new Error(`sidebar nav item not found: ${label}`)
  await found.locator.click()
  await sleep(400)
  return found.selector
}

/** Click a sidebar entry and wait until its page marker(s) show up. */
export async function gotoNav(page, label, { timeout = 20000 } = {}) {
  const selector = await clickSidebarNav(page, label, { timeout })
  const markers = NAV_MARKERS[label] || [new RegExp(label)]
  const deadline = Date.now() + timeout
  let last = ''
  while (Date.now() < deadline) {
    last = await bodyText(page)
    const hit = markers.filter((m) => m.test(last)).length
    // require both the page title token and a page-specific token
    if (hit >= Math.min(2, markers.length)) {
      return { selector, url: page.url(), text: last.slice(0, 200) }
    }
    await sleep(150)
  }
  throw new Error(`nav ${label}: page did not render (url ${page.url()}); body: ${last.slice(0, 240).replace(/\s+/g, ' ')}`)
}

export function hashOf(url) {
  try {
    return new URL(url).hash || '#/'
  } catch {
    return url
  }
}

// ---- misc ------------------------------------------------------------------
export function saveJson(name, data) {
  const file = path.join(OUT_DIR, name.endsWith('.json') ? name : `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return rel(file)
}

export function readJson(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(PROJECT, relPath), 'utf8'))
  } catch {
    return null
  }
}

export function parseSummaryFromPytest(text) {
  const summary = { passed: 0, failed: 0, errors: 0, skipped: 0, total: 0, raw: '' }
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].replace(/=+$/, '').replace(/^=+/, '').trim()
    if (!/\d+ (passed|failed|error)/.test(line)) continue
    summary.raw = line
    const grab = (word) => {
      const m = line.match(new RegExp(`(\\d+) ${word}`))
      return m ? Number(m[1]) : 0
    }
    summary.passed = grab('passed')
    summary.failed = grab('failed')
    summary.errors = grab('error') || grab('errors')
    summary.skipped = grab('skipped')
    summary.total = summary.passed + summary.failed + summary.errors + summary.skipped
    return summary
  }
  return summary
}

/**
 * PASS/FAIL collector. Each step is printed immediately and persisted to
 * tools/out/e2e/<script>.json at the end.
 */
export class Report {
  constructor(script, { outDir = OUT_DIR } = {}) {
    this.script = script
    this.outDir = outDir
    mkdirp(outDir)
    this.steps = []
    this.infos = []
    this.screenshots = []
    this.data = {}
    this.env = {}
    this.startedAt = new Date().toISOString()
    this.t0 = Date.now()
  }

  pass(name, detail = '') {
    this.steps.push({ name, ok: true, detail: String(detail), at: new Date().toISOString() })
    console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`)
    return true
  }

  fail(name, detail = '') {
    this.steps.push({ name, ok: false, detail: String(detail), at: new Date().toISOString() })
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`)
    return false
  }

  /** Boolean check that records PASS/FAIL and returns the condition. */
  check(name, condition, detail = '') {
    return condition ? this.pass(name, detail) : this.fail(name, detail)
  }

  info(name, detail = '') {
    this.infos.push({ name, detail: String(detail), at: new Date().toISOString() })
    console.log(`INFO  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  /** Run a step; a thrown error becomes a FAIL (and re-throws when required). */
  async step(name, fn, { required = false } = {}) {
    try {
      const detail = await fn()
      return this.pass(name, typeof detail === 'string' ? detail : detail == null ? '' : JSON.stringify(detail))
    } catch (err) {
      this.fail(name, err && err.message ? err.message : String(err))
      if (required) throw err
      return false
    }
  }

  async shot(page, name, opts = {}) {
    try {
      const file = await screenshot(page, `${this.script}-${name}`, opts)
      this.screenshots.push(file)
      return file
    } catch (err) {
      this.info('screenshot-failed', `${name}: ${err.message}`)
      return null
    }
  }

  get ok() {
    return this.steps.every((s) => s.ok)
  }

  counts() {
    const passed = this.steps.filter((s) => s.ok).length
    return { total: this.steps.length, passed, failed: this.steps.length - passed }
  }

  finish(extra = {}) {
    const finishedAt = new Date().toISOString()
    const payload = {
      script: this.script,
      ok: this.ok,
      startedAt: this.startedAt,
      finishedAt,
      durationMs: Date.now() - this.t0,
      counts: this.counts(),
      env: this.env,
      steps: this.steps,
      infos: this.infos,
      screenshots: this.screenshots,
      data: { ...this.data, ...extra },
    }
    const file = path.join(this.outDir, `${this.script}.json`)
    fs.writeFileSync(file, JSON.stringify(payload, null, 2))
    console.log(`\n[${this.script}] ${this.ok ? 'PASS' : 'FAIL'} — ${payload.counts.passed}/${payload.counts.total} checks passed (${payload.durationMs}ms)`)
    console.log(`[${this.script}] result: ${rel(file)}`)
    return payload
  }
}

/** Wrap a script body: runs `fn`, always writes the report, sets exit code. */
export async function runScript(scriptName, fn) {
  const report = new Report(scriptName)
  let fatal = null
  try {
    await fn(report)
  } catch (err) {
    fatal = err
    const message = err && err.message ? err.message : String(err)
    const last = report.steps[report.steps.length - 1]
    if (!last || last.ok || !String(last.detail || '').includes(message)) {
      report.fail('script-crashed', err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err))
    }
  }
  const payload = report.finish({ fatal: fatal ? String(fatal.message || fatal) : null })
  process.exitCode = payload.ok ? 0 : 1
  return payload
}

export default {
  HERE,
  TOOLS,
  PROJECT,
  OUT_DIR,
  DEFAULT_FRONTEND,
  DEFAULT_BACKEND,
  DEMO,
  sleep,
  rel,
  mkdirp,
  parseArgs,
  resolveUrls,
  apiCall,
  loginApi,
  waitForBackend,
  waitForFrontend,
  launchBrowser,
  primeToken,
  attachErrorCollectors,
  newInstrumentedPage,
  settle,
  screenshot,
  bodyText,
  findVisible,
  hasVisible,
  fillFirst,
  clickFirst,
  selectByLabel,
  waitForBodyText,
  waitForAny,
  LOGIN_SELECTORS,
  hasLoginForm,
  uiLogin,
  waitForConsoleReady,
  NAV_LABELS,
  NAV_MARKERS,
  NAV_HASH,
  clickSidebarNav,
  gotoNav,
  hashOf,
  saveJson,
  readJson,
  parseSummaryFromPytest,
  Report,
  runScript,
}
