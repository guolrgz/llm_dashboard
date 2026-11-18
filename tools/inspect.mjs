#!/usr/bin/env node
/**
 * inspect.mjs — DOM geometry/style audit of the rendered page (QA support tool).
 *
 * Usage:
 *   node tools/inspect.mjs [--url=file://...] [--width=1672] [--height=941]
 *                          [--out=tools/out/dom-audit.json]
 *                          [--selector=".sidebar"] [--top=60]
 *
 * Without --selector it dumps a JSON audit of every visible element (tag, id,
 * class, bounding box, font, colors, radius, padding) plus a compact console
 * tree of the main layout containers. With --selector it prints matching
 * elements' boxes and computed styles, which is what you want when comparing a
 * specific element against the reference screenshot coordinates.
 */
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
const opt = { url: null, width: 1672, height: 941, out: 'tools/out/dom-audit.json', selector: null, top: 60, settle: 400 };
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)(?:=(.*))?$/);
  if (!m) continue;
  const k = m[1], v = m[2];
  if (k === 'url') opt.url = v;
  else if (k === 'width') opt.width = parseInt(v, 10);
  else if (k === 'height') opt.height = parseInt(v, 10);
  else if (k === 'out') opt.out = v;
  else if (k === 'selector') opt.selector = v;
  else if (k === 'top') opt.top = parseInt(v, 10);
  else if (k === 'settle') opt.settle = parseInt(v, 10);
}
const URL_ = opt.url || 'file://' + path.join(PROJECT, 'index.html');
const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: opt.width, height: opt.height }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
await page.waitForTimeout(opt.settle);

if (opt.selector) {
  const rows = await page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({
        sel,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: (el.getAttribute('class') || '').trim() || null,
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
        font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(',')[0]}`,
        color: cs.color,
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        padding: cs.padding,
        margin: cs.margin,
        border: cs.border,
        shadow: cs.boxShadow,
        display: cs.display,
        gap: cs.gap,
      });
    }
    return out;
  }, opt.selector);
  console.log(JSON.stringify(rows, null, 2));
  await browser.close();
  process.exit(0);
}

const audit = await page.evaluate(() => {
  const els = [];
  const walk = (el, depth) => {
    if (depth > 40) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'head') return;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width >= 8 && r.height >= 4;
    if (visible) {
      const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      els.push({
        tag,
        id: el.id || undefined,
        cls: (el.getAttribute('class') || '').trim() || undefined,
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        text: ownText ? ownText.replace(/\s+/g, ' ').slice(0, 90) : undefined,
        font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`,
        color: cs.color,
        bg: cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? undefined : cs.backgroundColor,
        radius: cs.borderRadius !== '0px' ? cs.borderRadius : undefined,
        padding: cs.padding !== '0px' ? cs.padding : undefined,
        display: cs.display,
        gap: cs.gap !== 'normal' ? cs.gap : undefined,
      });
    }
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(document.body, 0);
  const de = document.documentElement;
  const containers = [];
  const collect = (el, depth) => {
    if (depth > 2 || !el) return;
    const r = el.getBoundingClientRect();
    containers.push({ depth, tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').trim(), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } });
    for (const c of el.children) collect(c, depth + 1);
  };
  collect(document.body, 0);
  return {
    title: document.title,
    scroll: { w: de.scrollWidth, h: de.scrollHeight, cw: de.clientWidth, ch: de.clientHeight },
    fonts: getComputedStyle(document.body).fontFamily,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    elements: els,
    containers,
  };
});
audit.errors = errors;
audit.url = URL_;
fs.mkdirSync(path.dirname(path.resolve(PROJECT, opt.out)), { recursive: true });
fs.writeFileSync(path.resolve(PROJECT, opt.out), JSON.stringify(audit, null, 1));
console.log(`elements: ${audit.elements.length}, containers: ${audit.containers.length}, page ${audit.scroll.w}x${audit.scroll.h}`);
console.log('top-level containers:');
for (const c of audit.containers) console.log('  '.repeat(c.depth) + `${c.tag}${c.cls ? '.' + c.cls.split(/\s+/).join('.') : ''} [${c.rect.x},${c.rect.y} ${c.rect.w}x${c.rect.h}]`);
if (errors.length) console.log('errors:', errors.slice(0, 5));
await browser.close();
