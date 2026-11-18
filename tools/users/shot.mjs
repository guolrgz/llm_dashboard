#!/usr/bin/env node
/**
 * users/shot.mjs — deterministic screenshot of the 用户管理 page at the reference scale:
 * viewport 1376×768 CSS, deviceScaleFactor 2 → 2752×1536 px, directly diffable vs users.jpg.
 *
 * Usage (from repo root or tools/):
 *   node tools/users/shot.mjs [--out=tools/out/users.png] [--width=1376] [--height=768]
 *                             [--dsf=2] [--url=http://127.0.0.1:5173/users.html] [--settle=400]
 *                             [--fullpage] [--wait=<selector>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOLS = path.resolve(HERE, '..')
const PROJECT = path.resolve(TOOLS, '..')

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(TOOLS, 'browsers')
const libDirs = [
  path.join(TOOLS, 'libs/usr/lib/x86_64-linux-gnu'),
  path.join(TOOLS, 'libs/lib/x86_64-linux-gnu'),
].filter((d) => fs.existsSync(d))
process.env.LD_LIBRARY_PATH = [...libDirs, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':')

const { chromium } = await import('playwright')

const opt = { out: 'tools/out/users.png', width: 1376, height: 768, dsf: 2, url: 'http://127.0.0.1:5173/users.html', settle: 400, fullpage: false, wait: null }
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([A-Za-z-]+)(?:=(.*))?$/)
  if (!m) continue
  const [, k, v] = m
  if (k === 'out') opt.out = v
  else if (k === 'width') opt.width = parseInt(v, 10)
  else if (k === 'height') opt.height = parseInt(v, 10)
  else if (k === 'dsf') opt.dsf = parseFloat(v)
  else if (k === 'url') opt.url = v
  else if (k === 'settle') opt.settle = parseInt(v, 10)
  else if (k === 'wait') opt.wait = v
  else if (k === 'fullpage') opt.fullpage = true
}

const OUT = path.resolve(PROJECT, opt.out)
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
})
const context = await browser.newContext({
  viewport: { width: opt.width, height: opt.height },
  deviceScaleFactor: opt.dsf,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  locale: 'zh-CN',
})
const page = await context.newPage()
const consoleErrors = []
const pageErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))

const meta = { url: opt.url, width: opt.width, height: opt.height, dsf: opt.dsf, ok: false }
try {
  const resp = await page.goto(opt.url, { waitUntil: 'load', timeout: 30000 })
  meta.status = resp ? resp.status() : null
  await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready })
  if (opt.wait) await page.waitForSelector(opt.wait, { timeout: 10000 }).catch(() => {})
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }) } catch {}
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;caret-color:transparent !important}html{scroll-behavior:auto !important}',
  })
  if (opt.settle > 0) await page.waitForTimeout(opt.settle)
  const metrics = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
    scrollHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
    fonts: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
    bodyFont: getComputedStyle(document.body).fontFamily,
  }))
  Object.assign(meta, metrics)
  meta.ok = true
  await page.screenshot({
    path: OUT,
    clip: { x: 0, y: 0, width: opt.width, height: opt.height },
    animations: 'disabled',
    caret: 'hide',
  })
  if (opt.fullpage) {
    await page.screenshot({ path: OUT.replace(/\.png$/i, '-full.png'), fullPage: true, animations: 'disabled', caret: 'hide' })
  }
} catch (err) {
  meta.error = String(err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : err)
}
meta.consoleErrors = consoleErrors
meta.pageErrors = pageErrors
meta.out = path.relative(PROJECT, OUT)
meta.timestamp = new Date().toISOString()
fs.writeFileSync(OUT.replace(/\.png$/i, '-meta.json'), JSON.stringify(meta, null, 2))
await browser.close()
console.log(JSON.stringify(meta, null, 2))
if (!meta.ok) process.exit(1)
