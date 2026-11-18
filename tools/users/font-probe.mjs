#!/usr/bin/env node
/**
 * users/font-probe.mjs — QA experiment: inject candidate typography overrides
 * (without touching src/**) and measure the pixel mismatch vs users.jpg.
 *
 * Usage: node tools/users/font-probe.mjs
 * Output: tools/out/users-probe-<variant>.png + console table of mismatch %
 *         (overall + the 7 design regions)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';

const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..');
const PROJECT = path.resolve(TOOLS, '..');
const P = (p) => path.resolve(PROJECT, p);

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(TOOLS, 'browsers');
const libDirs = [
  path.join(TOOLS, 'libs/usr/lib/x86_64-linux-gnu'),
  path.join(TOOLS, 'libs/lib/x86_64-linux-gnu'),
].filter((d) => fs.existsSync(d));
process.env.LD_LIBRARY_PATH = [...libDirs, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
const { chromium } = await import('playwright');

const VARIANTS = [
  { name: 'control', css: '' },
  { name: 'head-w500', css: '.ut-th{font-weight:500 !important}' },
  { name: 'head-w600', css: '.ut-th{font-weight:600 !important}' },
  { name: 'head-ink', css: '.ut-th{color:#111827 !important}' },
  { name: 'head-w500-ink', css: '.ut-th{font-weight:500 !important;color:#0b1220 !important}' },
  { name: 'cells-w500', css: '.ut-row .ut-cell{font-weight:500 !important}' },
  { name: 'cells-w600', css: '.ut-row .ut-cell{font-weight:600 !important}' },
  { name: 'pg-w500', css: '.pg-total,.pg-btn,.pg-ellipsis{font-weight:500 !important}' },
  { name: 'all-w500', css: '.ut-th,.ut-row .ut-cell,.pg-total,.pg-btn,.pg-ellipsis{font-weight:500 !important}' },
];

const base = PNG.sync.read(fs.readFileSync(P('tools/out/users-baseline.png')));
const BW = base.width, BH = base.height;
const REGIONS = [
  ['sidebar', 0, 0, 430, 1536],
  ['topbar', 430, 0, 2322, 106],
  ['pagehead', 431, 106, 2321, 200],
  ['filter', 479, 306, 2237, 156],
  ['toolbar', 479, 491, 2237, 145],
  ['table', 479, 637, 2237, 595],
  ['pagination', 479, 1232, 2237, 138],
];
function measure(cur) {
  const W = Math.min(BW, cur.width), H = Math.min(BH, cur.height);
  const mask = new Uint8Array(W * H);
  let bad = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * BW + x) * 4, j = (y * cur.width + x) * 4;
      const d = Math.max(
        Math.abs(base.data[i] - cur.data[j]),
        Math.abs(base.data[i + 1] - cur.data[j + 1]),
        Math.abs(base.data[i + 2] - cur.data[j + 2])
      );
      if (d > 24) { mask[y * W + x] = 1; bad++; }
    }
  }
  const out = { overall: (100 * bad) / (BW * BH) };
  for (const [name, x0, y0, w, h] of REGIONS) {
    let rb = 0;
    for (let y = y0; y < Math.min(y0 + h, H); y++) {
      for (let x = x0; x < Math.min(x0 + w, W); x++) if (mask[y * W + x]) rb++;
    }
    out[name] = (100 * rb) / (w * h);
  }
  return out;
}

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1376, height: 768 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce', locale: 'zh-CN',
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173/users.html', { waitUntil: 'load', timeout: 30000 });
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready });
await page.waitForTimeout(700);
await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;transition-duration:0s !important}' });

const rows = [];
for (const v of VARIANTS) {
  let handle = null;
  if (v.css) handle = await page.addStyleTag({ content: v.css });
  await page.waitForTimeout(150);
  const file = P(`tools/out/users-probe-${v.name}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1376, height: 768 }, animations: 'disabled', caret: 'hide' });
  if (handle) await handle.evaluate((n) => n.remove());
  const m = measure(PNG.sync.read(fs.readFileSync(file)));
  rows.push({ variant: v.name, ...m });
  console.log(v.name.padEnd(15), `overall ${m.overall.toFixed(2)}%  ` + REGIONS.map(([n]) => `${n}=${m[n].toFixed(2)}`).join('  '));
}
await browser.close();
fs.writeFileSync(P('tools/out/users-probe.json'), JSON.stringify(rows, null, 2));
console.log('\nsaved tools/out/users-probe.json');
