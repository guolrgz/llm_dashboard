#!/usr/bin/env node
/**
 * shot.mjs — deterministic screenshot of the dashboard page for pixel QA.
 *
 * Usage (from anywhere):
 *   node tools/shot.mjs [--out=tools/out/current.png] [--width=1672] [--height=941]
 *                       [--url=file:///.../index.html] [--settle=300] [--fullpage]
 *
 * Notes:
 *  - Playwright + chromium live under tools/ (browsers/, node_modules/).
 *  - Chromium's system libs are not installed on this box; they were extracted
 *    from .deb into tools/libs. This script prepends them to LD_LIBRARY_PATH so
 *    chromium can start without root.
 *  - Writes the viewport-sized screenshot to --out (this is the file that is
 *    diffed against index.png) and, when the document is taller/wider than the
 *    viewport, an extra *-full.png plus overflow info in the metadata JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');

// ---- chromium runtime env (must be set before launching) -------------------
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(HERE, 'browsers');
const libDirs = [
  path.join(HERE, 'libs/usr/lib/x86_64-linux-gnu'),
  path.join(HERE, 'libs/lib/x86_64-linux-gnu'),
].filter((d) => fs.existsSync(d));
process.env.LD_LIBRARY_PATH = [...libDirs, process.env.LD_LIBRARY_PATH || '']
  .filter(Boolean)
  .join(':');

const { chromium } = await import('playwright');

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = { out: null, width: 1672, height: 941, dpr: 1, url: 'http://127.0.0.1:5173/', settle: 300, fullpage: false, timeout: 30000 };
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)(?:=(.*))?$/);
  if (!m) continue;
  const [, k, v] = m;
  if (k === 'out') opt.out = v;
  else if (k === 'width') opt.width = parseInt(v, 10);
  else if (k === 'height') opt.height = parseInt(v, 10);
  else if (k === 'dpr') opt.dpr = parseFloat(v);
  else if (k === 'url') opt.url = v;
  else if (k === 'settle') opt.settle = parseInt(v, 10);
  else if (k === 'timeout') opt.timeout = parseInt(v, 10);
  else if (k === 'fullpage') opt.fullpage = true;
}

const OUT = path.resolve(PROJECT, opt.out || path.join('tools', 'out', 'current.png'));
const URL_ = opt.url;
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// ---- run ------------------------------------------------------------------
const browser = await chromium.launch({
  args: [
    '--force-color-profile=srgb',
    '--hide-scrollbars',
    '--disable-lcd-text',
    '--font-render-hinting=none',
    '--disable-gpu',
    '--no-sandbox',
  ],
});
const context = await browser.newContext({
  viewport: { width: opt.width, height: opt.height },
  deviceScaleFactor: opt.dpr,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  locale: 'zh-CN',
});
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('requestfailed', (req) => {
  const f = req.failure();
  if (f && !f.errorText.includes('ERR_ABORTED')) failedRequests.push(`${req.url()} :: ${f.errorText}`);
});

let meta = { url: URL_, ok: false, width: opt.width, height: opt.height };
try {
  const resp = await page.goto(URL_, { waitUntil: 'load', timeout: opt.timeout });
  meta.status = resp ? resp.status() : null;
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    /* network idle is best-effort (file:// pages usually resolve instantly) */
  }
  // Disable CSS animations/transitions so the screenshot is deterministic.
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;' +
      'transition-duration:0s !important;transition-delay:0s !important;caret-color:transparent !important}' +
      'html{scroll-behavior:auto !important}',
  });
  // Give JS charts (Chart.js etc.) time to finish their intro animation.
  if (opt.settle > 0) await page.waitForTimeout(opt.settle);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(de.scrollWidth, body ? body.scrollWidth : 0),
      scrollHeight: Math.max(de.scrollHeight, body ? body.scrollHeight : 0),
      clientWidth: de.clientWidth,
      clientHeight: de.clientHeight,
      title: document.title,
      canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height })),
      fontFamilies: getComputedStyle(body || de).fontFamily,
      bodyBg: getComputedStyle(body || de).backgroundColor,
    };
  });
  meta = { ...meta, ...metrics, ok: true };

  // Always capture the exact viewport (comparable with index.png 1672x941).
  await page.screenshot({
    path: OUT,
    clip: { x: 0, y: 0, width: opt.width, height: opt.height },
    animations: 'disabled',
    caret: 'hide',
  });

  const overflow =
    metrics.scrollHeight > opt.height + 1 ||
    metrics.scrollWidth > opt.width + 1 ||
    false;
  meta.overflow = overflow;
  meta.fullPageSaved = false;
  if (opt.fullpage || overflow) {
    const full = OUT.replace(/\.png$/i, '-full.png');
    await page.screenshot({ path: full, fullPage: true, animations: 'disabled', caret: 'hide' });
    meta.fullPageSaved = true;
    meta.fullPagePath = path.relative(PROJECT, full);
  }

  // Also save a full-page shot when the doc is exactly the viewport height:
  // index.png is a viewport shot, so current.png stays viewport-sized; the
  // full-page mirror is only kept when --fullpage is passed.
} catch (err) {
  meta.error = String(err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : err);
}
meta.consoleErrors = consoleErrors;
meta.pageErrors = pageErrors;
meta.failedRequests = failedRequests;
meta.timestamp = new Date().toISOString();
meta.out = path.relative(PROJECT, OUT);

fs.writeFileSync(OUT.replace(/\.png$/i, '-meta.json'), JSON.stringify(meta, null, 2));

await browser.close();

console.log(JSON.stringify(meta, null, 2));
if (!meta.ok) {
  console.error('shot.mjs: page load/screenshot failed');
  process.exit(1);
}
