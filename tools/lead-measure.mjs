#!/usr/bin/env node
// Lead's quick pixel measurement tool for the reference image (uses playwright chromium).
// Usage:
//   node tools/lead-measure.mjs --at=100,100 --runs=y:200 --runsv=x:500 --rect=280,180,1400,180
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(HERE, 'browsers');
const libDirs = [
  path.join(HERE, 'libs/usr/lib/x86_64-linux-gnu'),
  path.join(HERE, 'libs/lib/x86_64-linux-gnu'),
].filter((d) => fs.existsSync(d));
process.env.LD_LIBRARY_PATH = [...libDirs, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
const { chromium } = await import('playwright');

const argv = process.argv.slice(2);
const opts = { file: 'index.png', runs: [], runsv: [], at: [], rect: null, tol: 8, crops: [] };
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)(?:=(.*))?$/);
  if (!m) continue;
  const [, k, v] = m;
  if (k === 'file') opts.file = v;
  else if (k === 'tol') opts.tol = parseInt(v, 10);
  else if (k === 'at') opts.at.push(v.split(',').map(Number));
  else if (k === 'runs') opts.runs.push(parseInt(v, 10));
  else if (k === 'runsv') opts.runsv.push(parseInt(v, 10));
  else if (k === 'rect') opts.rect = v.split(',').map(Number);
  else if (k === 'crop') opts.crops.push(v.split(',').map(Number));
}

const abs = path.resolve(PROJECT, opts.file);
const b64 = fs.readFileSync(abs).toString('base64');
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
const res = await page.evaluate(async ({ b64, opts }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const W = img.width, H = img.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const hex = (x, y) => '#' + px(x, y).map((v) => v.toString(16).padStart(2, '0')).join('');
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const out = { size: `${W}x${H}`, at: [], runs: [], runsv: [], rect: null };
  for (const [x, y] of opts.at) out.at.push(`at(${x},${y}) = ${hex(x, y)}`);
  for (const y of opts.runs) {
    const parts = []; let start = 0; let prev = px(0, y);
    for (let x = 1; x < W; x++) {
      const cur = px(x, y);
      if (dist(cur, prev) > opts.tol) { parts.push(`[${start}-${x - 1}] ${hex(start, y)}`); start = x; prev = cur; }
    }
    parts.push(`[${start}-${W - 1}] ${hex(start, y)}`);
    out.runs.push(`H-runs y=${y}: ` + parts.join('  '));
  }
  for (const x of opts.runsv) {
    const parts = []; let start = 0; let prev = px(x, 0);
    for (let y = 1; y < H; y++) {
      const cur = px(x, y);
      if (dist(cur, prev) > opts.tol) { parts.push(`[${start}-${y - 1}] ${hex(x, start)}`); start = y; prev = cur; }
    }
    parts.push(`[${start}-${H - 1}] ${hex(x, start)}`);
    out.runsv.push(`V-runs x=${x}: ` + parts.join('  '));
  }
  if (opts.rect) {
    const [rx, ry, rw, rh] = opts.rect;
    const counts = new Map();
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const k = hex(x, y); counts.set(k, (counts.get(k) || 0) + 1);
    }
    out.rect = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v}`);
  }
  return out;
}, { b64, opts });
if (opts.crops.length) {
  const pg = await browser.newPage();
  await pg.goto('file://' + abs);
  await pg.waitForTimeout(200);
  let i = 0;
  for (const [x, y, w, h] of opts.crops) {
    const out = path.join(PROJECT, 'tools', 'out', `crop-${i++}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await pg.screenshot({ path: out, clip: { x, y, width: w, height: h } });
    console.log('crop ->', path.relative(PROJECT, out));
  }
}
await browser.close();
console.log(res.size);
for (const l of res.at) console.log(l);
for (const l of res.runs) console.log(l);
for (const l of res.runsv) console.log(l);
if (res.rect) { console.log('rect top colors:'); for (const l of res.rect) console.log('  ' + l); }
