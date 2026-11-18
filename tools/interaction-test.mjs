#!/usr/bin/env node
/**
 * interaction-test.mjs — smoke test for dashboard interactions & responsive drawer.
 * Usage: node tools/interaction-test.mjs [--url=http://127.0.0.1:5173/]
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
const urlArg = argv.find((a) => a.startsWith('--url='));
const URL_ = urlArg ? urlArg.slice('--url='.length) : 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
const check = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) process.exitCode = 1; };

await page.goto(URL_, { waitUntil: 'load' });
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
await page.waitForTimeout(250);

check('page loads with no console errors', errors.length === 0, errors.join(' | '));

/* time-range segmented control */
await page.getByRole('tab', { name: '近7天' }).click();
check('range switch -> 近7天 active', await page.getByRole('tab', { name: '近7天' }).getAttribute('aria-selected') === 'true');
check('range switch -> 今日 inactive', await page.getByRole('tab', { name: '今日' }).getAttribute('aria-selected') === 'false');
await page.getByRole('tab', { name: '今日' }).click();

/* chart hover updates tooltip */
const before = await page.locator('#chartTip .tip-time').textContent();
const box = await page.locator('#chartWrap').boundingBox();
await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
await page.waitForTimeout(120);
const after = await page.locator('#chartTip .tip-time').textContent();
check('chart hover updates tooltip time', before !== after, `${before} -> ${after}`);
await page.mouse.move(5, 500);
await page.waitForTimeout(80);

/* desktop sidebar collapse */
await page.locator('.hamburger').click();
check('desktop hamburger collapses sidebar', await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-collapsed')));
await page.waitForTimeout(260);
await page.locator('.hamburger').click();
check('desktop hamburger restores sidebar', !(await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-collapsed'))));

/* responsive drawer */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('mobile: no horizontal page overflow', overflowX <= 0, `delta=${overflowX}`);
check('mobile: drawer hidden by default', !(await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open'))));
await page.locator('.hamburger').click();
await page.waitForTimeout(320);
check('mobile: hamburger opens drawer', await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open')));
check('mobile: drawer visible', (await page.locator('.sidebar').boundingBox()).x >= -1);
check('mobile: backdrop active', await page.locator('.sidebar-backdrop').evaluate((el) => getComputedStyle(el).pointerEvents) === 'auto');
await page.screenshot({ path: path.join(PROJECT, 'tools/out/mobile-drawer.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(320);
check('mobile: Escape closes drawer', !(await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open'))));

/* drawer closes after nav selection */
await page.locator('.hamburger').click();
await page.waitForTimeout(280);
await page.locator('.nav .nav-item').nth(1).click();
await page.waitForTimeout(320);
check('mobile: nav selection closes drawer', !(await page.locator('.app').evaluate((el) => el.classList.contains('sidebar-open'))));
check('mobile: nav selection opens 用户管理', (await page.locator('.users-page h1').textContent())?.trim() === '用户管理');

/* 回到 Dashboard 检查表格滚动 */
await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(300);
check('back to dashboard route', (await page.locator('.page-heading h1').textContent())?.trim() === 'Dashboard');

/* table remains scrollable instead of squashing */
const tableScroll = await page.locator('.table-wrap').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
check('mobile: request table scrolls horizontally', tableScroll.scroll > tableScroll.client, JSON.stringify(tableScroll));

/* desktop screenshot restores */
await page.setViewportSize({ width: 1672, height: 941 });
await page.waitForTimeout(300);
check('no runtime errors after interactions', errors.length === 0, errors.join(' | '));

console.log(results.join('\n'));
await browser.close();
