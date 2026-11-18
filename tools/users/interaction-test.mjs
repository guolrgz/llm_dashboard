#!/usr/bin/env node
/**
 * users/interaction-test.mjs — Playwright interaction + responsive verification
 * for the 用户管理 page (http://127.0.0.1:5173/users.html).
 *
 * Usage (from repo root):
 *   node tools/users/interaction-test.mjs [--url=...] [--no-merge]
 *
 * Coverage
 *   1. load @1376×768: no page scroll (scrollHeight=768), no horizontal overflow,
 *      zero console/page errors, fonts loaded
 *   2. 查询 / 空状态 / 重置
 *   3. 状态、角色筛选
 *   4. 新增用户（弹窗、表单、提交、toast、记录数）
 *   5. 编辑（预填、保存）、停用/启用徽章切换、删除确认
 *   6. 批量选择：勾选启用批量按钮、批量删除、批量启停、全选、无选中禁用/提示
 *   7. 分页：下一页/页码/上一页、文案与 active 状态
 *   8. 响应式 1024×768 / 768×1024 / 390×844：无横向溢出；≤1100 汉堡开抽屉，
 *      Esc / 遮罩可关闭
 *
 * Outputs
 *   tools/out/users-interaction.json   machine-readable results (merged into
 *                                      docs/users-qa-report.md by diff.mjs)
 *   tools/out/users-mobile-390.png     drawer screenshot evidence
 *   tools/out/users-1024.png           responsive screenshot evidence
 *
 * After the checks it re-runs shot.mjs + diff.mjs so docs/users-qa-report.md
 * contains fresh pixel stats AND the interaction table (use --no-merge to skip).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('--url='));
const URL_ = urlArg ? urlArg.slice('--url='.length) : 'http://127.0.0.1:5173/users.html';
const MERGE = !argv.includes('--no-merge');
const OUT_JSON = P('tools/out/users-interaction.json');

const DESKTOP = { width: 1376, height: 768 };

// ---------------------------------------------------------------------------
// check bookkeeping
// ---------------------------------------------------------------------------
const checks = [];
function check(group, name, pass, detail = '', owner = '') {
  checks.push({ group, name, pass: !!pass, detail: String(detail || '').slice(0, 400), owner });
}
async function group(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(name, '分组执行未崩溃', false, `脚本异常: ${String(err && err.message ? err.message : err).slice(0, 300)}`);
  }
}

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu', '--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { ...DESKTOP },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  locale: 'zh-CN',
});
const page = await context.newPage();
page.setDefaultTimeout(3000);
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const nativeDialogs = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!/favicon|\.map(\?|$)|hmr|@vite/.test(u)) failedRequests.push(`${r.failure()?.errorText || 'failed'} ${u}`);
});
page.on('dialog', async (d) => {
  nativeDialogs.push({ type: d.type(), message: d.message() });
  await d.accept().catch(() => {});
});

const settle = (ms = 350) => page.waitForTimeout(ms);

// ---------------------------------------------------------------------------
// generic locator helpers (text-first so they survive class renames)
// ---------------------------------------------------------------------------
async function collectVisible(loc) {
  const out = [];
  let n = 0;
  try { n = await loc.count(); } catch { return out; }
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) out.push(el);
  }
  return out;
}
async function clickButtonText(text, scope = page) {
  const locs = [
    scope.getByRole('button', { name: text, exact: false }),
    scope.locator('button, [role="button"], a.btn, .btn').filter({ hasText: text }),
  ];
  for (const loc of locs) {
    const els = await collectVisible(loc);
    if (els.length) {
      await els[0].click({ timeout: 2500 }).catch(() => {});
      return true;
    }
  }
  return false;
}
async function findButton(text, scope = page) {
  const locs = [
    scope.getByRole('button', { name: text, exact: false }),
    scope.locator('button, [role="button"], a.btn, .btn').filter({ hasText: text }),
  ];
  for (const loc of locs) {
    const els = await collectVisible(loc);
    if (els.length) return els[0];
  }
  return null;
}
async function clickTestId(testid, scope = page) {
  const els = await collectVisible(scope.locator(`[data-testid="${testid}"]`));
  if (!els.length) return false;
  await els[0].click({ timeout: 2500 }).catch(() => {});
  return true;
}
const OPT_LABELS = {
  status: { all: '全部', enabled: '启用', disabled: '停用' },
  role: { all: '全部', admin: '管理员', normal: '普通用户' },
};
async function clickSelectOption(variant, value) {
  if (await clickTestId(`opt-${variant}-${value}`)) return true;
  return clickInlineOption(variant === 'status' ? '状态:' : '角色:', OPT_LABELS[variant][value]);
}
async function textEls(text) {
  const loc = page.getByText(text, { exact: true });
  const out = [];
  let n = 0;
  try { n = await loc.count(); } catch { return out; }
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const b = await el.boundingBox().catch(() => null);
    if (b && b.width > 0 && b.height > 0) out.push({ el, b });
  }
  return out;
}
async function clickTextInBox(text, box) {
  const els = await textEls(text);
  const hit = els.find(
    (e) =>
      e.b.x + e.b.width / 2 >= box.x0 &&
      e.b.x + e.b.width / 2 <= box.x1 &&
      e.b.y + e.b.height / 2 >= box.y0 &&
      e.b.y + e.b.height / 2 <= box.y1
  );
  if (!hit) return false;
  await hit.el.click({ timeout: 2500 }).catch(() => {});
  return true;
}
/**
 * Click an inline option of a custom select: find the "状态:" / "角色:" label,
 * then the nearest exact-text option to its right, same row (±45px).
 */
async function clickInlineOption(labelText, optionText) {
  const labels = [...(await textEls(labelText)), ...(await textEls(labelText.replace(':', '：')))];
  if (!labels.length) return false;
  const label = labels[0];
  const ly = label.b.y + label.b.height / 2;
  const lx = label.b.x + label.b.width;
  const opts = await textEls(optionText);
  const hit = opts
    .filter((o) => Math.abs(o.b.y + o.b.height / 2 - ly) <= 45 && o.b.x >= lx - 20 && o.b.x <= lx + 500)
    .sort((a, b) => a.b.x - b.b.x)[0];
  if (!hit) return false;
  await hit.el.click({ timeout: 2500 }).catch(() => {});
  return true;
}

// table rows -----------------------------------------------------------------
async function rowLocator() {
  for (const sel of ['tbody tr', '[data-testid="user-row"]', '.user-row', '.table-body .row', '.table-rows .row']) {
    const loc = page.locator(sel);
    const n = await loc.count().catch(() => 0);
    if (n) return loc;
  }
  return page.locator('tbody tr');
}
async function tableInfo() {
  return page.evaluate(() => {
    let rows = [...document.querySelectorAll('tbody tr')];
    if (!rows.length) rows = [...document.querySelectorAll('[data-testid="user-row"], .user-row, .table-body .row')];
    rows = rows.filter((el) => el.getClientRects().length > 0);
    const txt = (el) => ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim());
    let emptyState = false;
    {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/暂无数据/.test(node.textContent || '')) {
          const el = node.parentElement;
          if (el && el.getClientRects().length) { emptyState = true; break; }
        }
      }
    }
    if (!rows.length) return { count: 0, visible: 0, texts: [], visibleTexts: [], emptyState };
    let container = rows[0].parentElement;
    while (container && container !== document.body) {
      const cs = getComputedStyle(container);
      if (/(auto|scroll)/.test(cs.overflowY) && container.scrollHeight > container.clientHeight + 1) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) {
      container =
        rows[0].closest('[data-testid="table-body"], .ut-body, .table-body') ||
        rows[0].closest('table') ||
        rows[0].parentElement;
    }
    const cr = container.getBoundingClientRect();
    const visibleTexts = [];
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top >= cr.top - 2 && r.bottom <= cr.bottom + 2) visibleTexts.push(txt(el));
    }
    return {
      count: rows.length,
      visible: visibleTexts.length,
      texts: rows.map(txt),
      visibleTexts,
      emptyState,
      container: { top: Math.round(cr.top), bottom: Math.round(cr.bottom), scrollHeight: container.scrollHeight, clientHeight: container.clientHeight },
    };
  });
}
async function findRow(text) {
  const rows = await rowLocator();
  const n = await rows.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    if (!(await r.isVisible().catch(() => false))) continue;
    const t = await r.innerText().catch(() => '');
    if (t.includes(text)) return r;
  }
  return null;
}
async function clickRowTestId(row, testid) {
  if (!row) return false;
  const els = await collectVisible(row.locator(`[data-testid="${testid}"]`));
  if (!els.length) return false;
  await els[0].click({ timeout: 2500 }).catch(() => {});
  return true;
}
async function clickRowAction(row, text) {
  if (!row) return false;
  const cands = [
    row.locator('button, a, [role="button"]').filter({ hasText: text }),
    row.getByText(text, { exact: true }),
  ];
  for (const loc of cands) {
    const els = await collectVisible(loc);
    if (els.length) {
      await els[0].click({ timeout: 2500 }).catch(() => {});
      return true;
    }
  }
  return false;
}

// dialogs / toasts / numbers --------------------------------------------------
async function visibleDialog() {
  for (const sel of ['[role="dialog"]', '.dialog', '.modal', '.el-dialog', '.user-dialog', '.dialog-card']) {
    const els = await collectVisible(page.locator(sel));
    if (els.length) return els[0];
  }
  return null;
}
async function waitDialog(timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const d = await visibleDialog();
    if (d) return d;
    await page.waitForTimeout(100);
  }
  return null;
}
async function waitToast(re, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of ['.toast', '[role="status"]', '.toast-item', '.message']) {
      const els = await collectVisible(page.locator(sel));
      for (const el of els) {
        const t = await el.innerText().catch(() => '');
        if (re.test(t)) return t;
      }
    }
    const body = await page.locator('body').innerText().catch(() => '');
    if (re.test(body)) return 'body-text';
    await page.waitForTimeout(150);
  }
  return null;
}
async function bodyText() {
  return page.locator('body').innerText().catch(() => '');
}
async function totalRecords() {
  const t = await bodyText();
  const m = t.match(/共\s*([\d,]+)\s*条/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}
async function confirmIfAny() {
  const d = await waitDialog(1200);
  if (!d) return false;
  const precise = await collectVisible(d.locator('[data-testid="dialog-confirm"]'));
  if (precise.length) {
    await precise[0].click({ timeout: 2500 }).catch(() => {});
    return true;
  }
  const btns = [
    d.getByRole('button', { name: /确定|确认|删除|是/ }),
    d.locator('button, [role="button"]').filter({ hasText: /确定|确认|删除|是/ }),
  ];
  for (const loc of btns) {
    const els = await collectVisible(loc);
    if (els.length) {
      await els[0].click({ timeout: 2500 }).catch(() => {});
      return true;
    }
  }
  return false;
}
async function searchInput() {
  for (const sel of ['[data-testid="search-input"]', 'input[placeholder*="用户名"]', 'input[placeholder*="用户"]', 'input[type="search"]', 'input[type="text"]']) {
    const els = await collectVisible(page.locator(sel));
    if (els.length) return els[0];
  }
  return null;
}
async function goto(url = URL_) {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; }).catch(() => {});
  await settle(450);
}
async function reload() {
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; }).catch(() => {});
  await settle(500);
}

// ---------------------------------------------------------------------------
// 1. load + layout @1376×768
// ---------------------------------------------------------------------------
await group('加载/布局', async () => {
  const resp = await page.goto(URL_, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; }).catch(() => {});
  await settle(600);
  check('加载/布局', '页面可访问（HTTP 200 + Vue 挂载）', !!resp && resp.status() === 200 && (await page.locator('#app').innerHTML().catch(() => '')).length > 30, `status=${resp ? resp.status() : 'no-response'}`);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    const sb = document.querySelector('.sidebar');
    const tb = document.querySelector('.topbar');
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const s = r(sb), t = r(tb);
    return {
      scrollWidth: de.scrollWidth,
      scrollHeight: de.scrollHeight,
      clientWidth: de.clientWidth,
      clientHeight: de.clientHeight,
      sidebar: s ? { x: Math.round(s.x), w: Math.round(s.width), h: Math.round(s.height) } : null,
      topbar: t ? { h: Math.round(t.height), w: Math.round(t.width) } : null,
      fonts: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
      bodyFont: getComputedStyle(document.body).fontFamily,
      h1: [...document.querySelectorAll('h1')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()),
      title: document.title,
    };
  });

  check('加载/布局', '1376×768 页面无纵向滚动（scrollHeight=768）', Math.abs(metrics.scrollHeight - 768) <= 1, `scrollHeight=${metrics.scrollHeight}`);
  check('加载/布局', '无横向溢出（scrollWidth ≤ clientWidth）', metrics.scrollWidth <= metrics.clientWidth + 1, `scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`);
  check('加载/布局', 'console/page error 为 0', consoleErrors.length === 0 && pageErrors.length === 0, `console=${consoleErrors.length}${consoleErrors.length ? ' ' + consoleErrors.slice(0, 2).join(' | ').slice(0, 150) : ''} page=${pageErrors.length}${pageErrors.length ? ' ' + pageErrors.slice(0, 2).join(' | ').slice(0, 150) : ''}`);
  const loadedFonts = metrics.fonts.filter((f) => / loaded$/.test(f));
  check('加载/布局', '字体已加载（Inter / Noto Sans SC）', loadedFonts.length > 0 && /Inter/.test(metrics.bodyFont), `loaded=${loadedFonts.length} bodyFont=${metrics.bodyFont.slice(0, 80)}`);
  check('加载/布局', 'H1 为「用户管理」', metrics.h1.some((h) => /用户管理/.test(h)), `h1=${JSON.stringify(metrics.h1)}`);
  check('加载/布局', '侧边栏宽度 ≈215px 且贴左', !!metrics.sidebar && Math.abs(metrics.sidebar.x) <= 1 && Math.abs(metrics.sidebar.w - 215) <= 2, metrics.sidebar ? JSON.stringify(metrics.sidebar) : '未找到 .sidebar', 'shell-dev');
  check('加载/布局', '顶栏高度 ≈53px', !!metrics.topbar && Math.abs(metrics.topbar.h - 53) <= 2, metrics.topbar ? JSON.stringify(metrics.topbar) : '未找到 .topbar', 'shell-dev');
  const info = await tableInfo();
  check('加载/布局', '默认第 1 页可见 4 行（设计稿）', info.visible === 4, `rows=${info.count} visible=${info.visible} container=${info.container ? `${info.container.clientHeight}/${info.container.scrollHeight}` : 'n/a'}`, 'content-dev');
  check('加载/布局', '默认记录数文案「共 48 条记录，每页 10 条」', /共\s*48\s*条记录/.test(await bodyText()) && /每页\s*10\s*条/.test(await bodyText()), '', 'content-dev');
});

// ---------------------------------------------------------------------------
// 2. 查询 / 空状态 / 重置
// ---------------------------------------------------------------------------
await group('查询', async () => {
  await reload();
  const input = await searchInput();
  if (!input) { check('查询', '存在搜索输入框', false, '未找到 input（placeholder 含“用户名”）', 'content-dev'); return; }
  check('查询', '存在搜索输入框', true);

  await input.fill('user');
  const clicked = await clickButtonText('查询');
  await settle(450);
  const info = await tableInfo();
  const allUser = info.visibleTexts.length > 0 && info.visibleTexts.every((t) => /user/i.test(t));
  check('查询', '输入 user 查询 → 仅保留匹配行', clicked && allUser, `visible=${info.visible} texts=${JSON.stringify(info.visibleTexts.slice(0, 4)).slice(0, 200)}`);
  check('查询', '输入 user 查询 → 行数减少', info.visible > 0 && info.visible < 4, `visible=${info.visible}`);

  const input2 = (await searchInput()) || input;
  await input2.fill('zzz_no_such_user_qa');
  await clickButtonText('查询');
  await settle(450);
  const empty = await tableInfo();
  check('查询', '不存在值 → 显示空状态「暂无数据」', empty.emptyState || empty.visible === 0, `emptyState=${empty.emptyState} visible=${empty.visible}`);

  await clickButtonText('重置');
  await settle(450);
  const resetInfo = await tableInfo();
  const input3 = (await searchInput()) || input;
  const val = await input3.inputValue().catch(() => '?');
  check('查询', '重置 → 清空输入并恢复 4 行', val === '' && resetInfo.visible === 4, `value=${JSON.stringify(val)} visible=${resetInfo.visible}`);
});

// ---------------------------------------------------------------------------
// 3. 状态 / 角色筛选
// ---------------------------------------------------------------------------
await group('筛选', async () => {
  await reload();
  const hasFilter = (await textEls('状态:')) || (await textEls('状态：'));
  if (!hasFilter.length) { check('筛选', '存在状态/角色筛选控件', false, '未找到「状态:」标签', 'content-dev'); return; }
  check('筛选', '存在状态/角色筛选控件', true);

  let clicked = await clickSelectOption('status', 'enabled');
  if (!clicked) {
    const selects = await collectVisible(page.locator('select'));
    if (selects.length) { await selects[0].selectOption({ label: '启用' }).catch(() => {}); clicked = true; }
  }
  await clickButtonText('查询');
  await settle(450);
  let info = await tableInfo();
  const allEnabled = info.visibleTexts.length > 0 && info.visibleTexts.every((t) => /已启用/.test(t) && !/已停用/.test(t));
  check('筛选', '状态=启用 → 只剩已启用行', clicked && allEnabled, `clicked=${clicked} visible=${info.visible}`);

  await clickButtonText('重置');
  await settle(300);
  let clicked2 = await clickSelectOption('status', 'disabled');
  if (!clicked2) {
    const selects = await collectVisible(page.locator('select'));
    if (selects.length) { await selects[0].selectOption({ label: '停用' }).catch(() => {}); clicked2 = true; }
  }
  await clickButtonText('查询');
  await settle(450);
  info = await tableInfo();
  const allDisabled = info.visibleTexts.length > 0 && info.visibleTexts.every((t) => /已停用/.test(t));
  check('筛选', '状态=停用 → 只剩已停用行', clicked2 && allDisabled, `clicked=${clicked2} visible=${info.visible}`);

  await clickButtonText('重置');
  await settle(300);
  let clicked3 = await clickSelectOption('role', 'admin');
  if (!clicked3) {
    const selects = await collectVisible(page.locator('select'));
    if (selects.length > 1) { await selects[1].selectOption({ label: '管理员' }).catch(() => {}); clicked3 = true; }
  }
  await clickButtonText('查询');
  await settle(450);
  info = await tableInfo();
  const roleOk = info.visibleTexts.length > 0 && info.visibleTexts.every((t) => /管理员/.test(t));
  check('筛选', '角色=管理员 → 只剩管理员行（含超级管理员）', clicked3 && roleOk, `clicked=${clicked3} visible=${info.visible} texts=${JSON.stringify(info.visibleTexts.slice(0, 3)).slice(0, 160)}`);

  await clickButtonText('重置');
  await settle(350);
  const back = await tableInfo();
  check('筛选', '重置后恢复默认 4 行', back.visible === 4, `visible=${back.visible}`);
});

// ---------------------------------------------------------------------------
// 4. 新增用户
// ---------------------------------------------------------------------------
await group('新增', async () => {
  await reload();
  const before = await totalRecords();
  const opened = await clickButtonText('新增用户');
  const dialog = await waitDialog(2500);
  check('新增', '点击「新增用户」打开弹窗', opened && !!dialog, `clicked=${opened} dialog=${!!dialog}`, 'content-dev');
  if (!dialog) return;

  const inputs = await collectVisible(dialog.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="file"])'));
  check('新增', '弹窗包含表单输入（用户名/邮箱）', inputs.length >= 2, `inputs=${inputs.length}`);
  if (inputs.length >= 2) {
    await inputs[0].fill('qa_user');
    await inputs[1].fill('qa_user@example.com');
  } else if (inputs.length === 1) {
    await inputs[0].fill('qa_user');
  }
  // role / status (native select or inline option), best effort
  const selects = await collectVisible(dialog.locator('select'));
  for (const s of selects) {
    const optCount = await s.locator('option').count().catch(() => 0);
    if (optCount > 1) await s.selectOption({ index: 1 }).catch(() => {});
  }
  if (!selects.length) {
    for (const t of ['普通用户', '已启用']) {
      const els = await collectVisible(dialog.getByText(t, { exact: true }));
      if (els.length) await els[0].click({ timeout: 1500 }).catch(() => {});
    }
  }
  const submitted = await clickTestId('dialog-confirm', dialog) || await clickButtonText('确定', dialog) || await clickButtonText('保存', dialog) || await clickButtonText('提交', dialog) || await clickButtonText('新增', dialog);
  await settle(700);
  const stillOpen = !!(await visibleDialog());
  const toast = await waitToast(/新增成功|添加成功|成功/);
  const after = await totalRecords();
  const body = await bodyText();
  check('新增', '提交后弹窗关闭并出现 toast', submitted && !stillOpen && !!toast, `submitted=${submitted} stillOpen=${stillOpen} toast=${JSON.stringify(toast)}`);
  check('新增', '新增后记录数 +1 且列表出现新用户', (before != null && after === before + 1) || /qa_user/.test(body), `before=${before} after=${after} hasRow=${/qa_user/.test(body)}`);
});

// ---------------------------------------------------------------------------
// 5. 编辑 / 停用启用 / 删除
// ---------------------------------------------------------------------------
await group('编辑/启停', async () => {
  await reload();
  const row = await findRow('admin');
  check('编辑/启停', '找到第 1 行（admin）', !!row, '', 'content-dev');
  if (!row) return;
  const rowTextBefore = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('编辑/启停', '停用/启用前状态为已启用', /已启用/.test(rowTextBefore), rowTextBefore.slice(0, 120));

  const opened = (await clickRowTestId(row, 'edit-user')) || (await clickRowAction(row, '编辑'));
  const dialog = await waitDialog(2500);
  check('编辑/启停', '点击「编辑」打开预填弹窗', opened && !!dialog, `clicked=${opened} dialog=${!!dialog}`);
  if (dialog) {
    const vals = await dialog.locator('input').evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
    const prefilled = vals.some((v) => /admin/i.test(v)) || (await dialog.innerText().catch(() => '')).includes('admin');
    check('编辑/启停', '编辑弹窗预填用户名/邮箱', prefilled, `values=${JSON.stringify(vals).slice(0, 160)}`);
    const inputs = await collectVisible(dialog.locator('input:not([type="checkbox"]):not([type="radio"])'));
    if (inputs.length) await inputs[0].fill('admin_qa');
    await clickTestId('dialog-confirm', dialog) || await clickButtonText('确定', dialog) || await clickButtonText('保存', dialog) || await clickButtonText('提交', dialog);
    await settle(700);
    const body = await bodyText();
    const toast = await waitToast(/保存成功|修改成功|成功|已保存/);
    check('编辑/启停', '保存后弹窗关闭、出现 toast 且行内容更新', !(await visibleDialog()) && !!toast && /admin_qa/.test(body), `toast=${JSON.stringify(toast)} updated=${/admin_qa/.test(body)}`);
  }

  // toggle status on row 2 (admin_qa is row 1 after edit; use row text)
  await reload();
  const row2 = await findRow('admin');
  const didToggle = (await clickRowTestId(row2, 'toggle-status')) || (await clickRowAction(row2, '停用'));
  await settle(650);
  const afterDisable = row2 ? (await row2.innerText().catch(() => '')).replace(/\s+/g, ' ') : '';
  check('编辑/启停', '点击「停用」→ 徽章变已停用', didToggle && /已停用/.test(afterDisable), `clicked=${didToggle} row=${afterDisable.slice(0, 120)}`);
  const didEnable = (await clickRowTestId(row2, 'toggle-status')) || (await clickRowAction(row2, '启用'));
  await settle(650);
  const afterEnable = row2 ? (await row2.innerText().catch(() => '')).replace(/\s+/g, ' ') : '';
  check('编辑/启停', '点击「启用」→ 徽章恢复已启用', didEnable && /已启用/.test(afterEnable), `clicked=${didEnable} row=${afterEnable.slice(0, 120)}`);
});

await group('删除', async () => {
  await reload();
  const before = await totalRecords();
  const row = await findRow('bob');
  check('删除', '找到 bob 行', !!row, '', 'content-dev');
  if (!row) return;
  const clicked = (await clickRowTestId(row, 'delete-user')) || (await clickRowAction(row, '删除'));
  const hadConfirm = await confirmIfAny();
  await settle(700);
  const body = await bodyText();
  const after = await totalRecords();
  check('删除', '删除需确认（有确认弹窗）', clicked && (hadConfirm || nativeDialogs.length > 0), `clicked=${clicked} confirm=${hadConfirm} native=${nativeDialogs.length}`);
  check('删除', '确认后行被移除且记录数 -1', !/bob@example\.com/.test(body) && before != null && after === before - 1, `before=${before} after=${after} stillHasBob=${/bob@example\.com/.test(body)}`);
  const toast = await waitToast(/删除成功|已删除|成功/);
  check('删除', '删除后出现 toast 提示', !!toast, `toast=${JSON.stringify(toast)}`);
});

// ---------------------------------------------------------------------------
// 6. 批量选择 / 全选
// ---------------------------------------------------------------------------
await group('批量', async () => {
  const batchToggleLoc = () => page.locator('[data-testid="batch-toggle"]');
  const batchDeleteLoc = () => page.locator('[data-testid="batch-delete"]');
  const btnInfo = async (loc) => {
    const els = await collectVisible(loc);
    if (!els.length) return { found: false };
    const info = await els[0].evaluate((node) => ({
      disabled: node.disabled === true,
      aria: node.getAttribute('aria-disabled'),
      cls: typeof node.className === 'string' ? node.className : '',
      pointer: getComputedStyle(node).pointerEvents,
      opacity: getComputedStyle(node).opacity,
    }));
    return {
      found: true,
      el: els[0],
      info,
      isDisabled:
        info.disabled ||
        info.aria === 'true' ||
        /disabled|is-disabled/.test(info.cls) ||
        info.pointer === 'none' ||
        Number(info.opacity) < 0.7,
    };
  };

  // --- no selection: disabled look OR hint toast, and no dialog
  await reload();
  const rest = await btnInfo(batchToggleLoc());
  let hint = null;
  if (rest.found) {
    await rest.el.click({ timeout: 2000 }).catch(() => {});
    await settle(400);
    hint = await waitToast(/请先选择|请选择|至少选择/, 1600);
  }
  const noSelDialog = await visibleDialog();
  const visualDisabled = rest.found && (rest.isDisabled || /gray|tb-gray|is-disabled/.test(rest.info.cls));
  check(
    '批量',
    '无选中时批量启用/停用禁用或给出提示',
    rest.found && (visualDisabled || !!hint) && !noSelDialog,
    `visualDisabled=${visualDisabled} hint=${JSON.stringify(hint)} dialog=${!!noSelDialog}`
  );
  const restDel = await btnInfo(batchDeleteLoc());
  check('批量', '存在批量删除/批量启用停用按钮', rest.found && restDel.found, `toggle=${rest.found} delete=${restDel.found}`);

  // --- select two rows -> button active + confirm dialog + status change
  await reload();
  const rows = await rowLocator();
  const rowCount = await rows.count().catch(() => 0);
  const boxes = [];
  for (let i = 0; i < Math.min(rowCount, 2); i++) {
    const cb = rows.nth(i).locator('[data-testid="row-checkbox"], input[type="checkbox"]').first();
    if (await cb.count().catch(() => 0)) boxes.push(cb);
  }
  check('批量', '表格行有复选框', boxes.length >= 2, `found=${boxes.length}/${Math.min(rowCount, 2)}`);
  for (const b of boxes) await b.check({ force: true }).catch(() => {});
  await settle(400);
  const afterSelect = await btnInfo(batchToggleLoc());
  const activeLook =
    afterSelect.found &&
    !afterSelect.isDisabled &&
    (/is-active|tb-blue|tb-red/.test(afterSelect.info.cls) || afterSelect.info.pointer !== 'none');
  if (afterSelect.found) await afterSelect.el.click({ timeout: 2500 }).catch(() => {});
  await settle(500);
  const toggleDialog = await waitDialog(1500);
  await confirmIfAny();
  await settle(650);
  const adminRow = await findRow('admin');
  const adminText = adminRow ? (await adminRow.innerText().catch(() => '')).replace(/\s+/g, ' ') : '';
  const toggled = /已停用/.test(adminText) || /已启用/.test(adminText);
  check(
    '批量',
    '勾选行后批量启用/停用可用（确认后切换状态）',
    !!afterSelect.found && (activeLook || !!toggleDialog) && toggled,
    `activeLook=${activeLook} dialog=${!!toggleDialog} row=${adminText.slice(0, 100)}`
  );

  // --- select all
  await reload();
  const headCb =
    (await collectVisible(page.locator('[data-testid="select-all"]')))[0] ||
    (await collectVisible(page.locator('.ut-head input[type="checkbox"], thead input[type="checkbox"]')))[0] ||
    (await collectVisible(page.locator('table input[type="checkbox"]')))[0];
  if (headCb) {
    await headCb.check({ force: true }).catch(() => {});
    await settle(350);
    const checked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-testid="row-checkbox"], tbody tr input[type="checkbox"]')];
      return { total: els.length, checked: els.filter((e) => e.checked).length };
    });
    check('批量', '表头全选勾选当前页所有行', checked.total > 0 && checked.checked === checked.total, JSON.stringify(checked));
  } else {
    check('批量', '存在表头全选复选框', false, '未找到全选 checkbox');
  }

  // --- batch delete
  await reload();
  const before = await totalRecords();
  const rows3 = await rowLocator();
  for (let i = 0; i < 2; i++) {
    const cb = rows3.nth(i).locator('[data-testid="row-checkbox"], input[type="checkbox"]').first();
    if (await cb.count().catch(() => 0)) await cb.check({ force: true }).catch(() => {});
  }
  await settle(300);
  const delBtn = await btnInfo(batchDeleteLoc());
  let delClicked = false;
  if (delBtn.found) {
    await delBtn.el.click({ timeout: 2500 }).catch(() => {});
    delClicked = true;
  }
  const delDialog = await waitDialog(1500);
  await confirmIfAny();
  await settle(700);
  const after = await totalRecords();
  const delToast = await waitToast(/删除成功|已删除/);
  check(
    '批量',
    '批量删除选中行（确认后记录数 -2）',
    delClicked && !!delDialog && before != null && after === before - 2 && !!delToast,
    `before=${before} after=${after} dialog=${!!delDialog} toast=${JSON.stringify(delToast)}`
  );
});

// ---------------------------------------------------------------------------
// 7. 分页
// ---------------------------------------------------------------------------
await group('分页', async () => {
  await reload();
  const t = await bodyText();
  check('分页', '分页文案「共 48 条记录，每页 10 条」', /共\s*48\s*条记录/.test(t) && /每页\s*10\s*条/.test(t));
  const pageState = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="pagination"]') || document.querySelector('.pagination');
      const scope = root || document;
      const nums = [...scope.querySelectorAll('button')].filter((el) => /^\d+$/.test((el.innerText || '').trim()));
      const pages = nums.map((el) => {
        const cs = getComputedStyle(el);
        return {
          text: (el.innerText || '').trim(),
          testid: el.getAttribute('data-testid'),
          active:
            el.classList.contains('is-current') ||
            el.classList.contains('active') ||
            el.classList.contains('current') ||
            el.getAttribute('aria-current') === 'page' ||
            cs.backgroundColor === 'rgb(32, 119, 237)' ||
            cs.backgroundColor === 'rgb(31, 123, 242)',
        };
      });
      const prev = scope.querySelector('[data-testid="prev-page"]');
      const next = scope.querySelector('[data-testid="next-page"]');
      return {
        pages,
        prevDisabled: prev ? prev.getAttribute('aria-disabled') === 'true' || prev.disabled : null,
        nextDisabled: next ? next.getAttribute('aria-disabled') === 'true' || next.disabled : null,
        ellipsis: /…|\.\.\./.test(scope.innerText || ''),
      };
    });
  const st0 = await pageState();
  check('分页', '初始第 1 页为 active 且上一页禁用', st0.pages.some((p) => p.text === '1' && p.active) && st0.prevDisabled === true, JSON.stringify(st0.pages).slice(0, 220));
  check('分页', '页码样式为 1/2/3/…/5（含省略号）', st0.pages.map((p) => p.text).join(',').includes('1') && st0.pages.some((p) => p.text === '5') && st0.ellipsis, `pages=${st0.pages.map((p) => p.text).join(',')} ellipsis=${st0.ellipsis}`);

  const firstRowBefore = (await tableInfo()).visibleTexts[0] || '';
  const nextClicked = (await clickTestId('next-page')) || (await clickButtonText('下一页'));
  await settle(500);
  const st1 = await pageState();
  const firstRowAfter = (await tableInfo()).visibleTexts[0] || '';
  check('分页', '下一页 → 第 2 页 active', nextClicked && st1.pages.some((p) => p.text === '2' && p.active), JSON.stringify(st1.pages).slice(0, 220));
  check('分页', '翻页后列表内容变化', firstRowBefore !== firstRowAfter, `${firstRowBefore.slice(0, 40)} → ${firstRowAfter.slice(0, 40)}`);

  const page3 = (await clickTestId('page-btn-3')) || (await clickButtonText('3'));
  await settle(450);
  const st2 = await pageState();
  check('分页', '点击页码 3 → 第 3 页 active', page3 && st2.pages.some((p) => p.text === '3' && p.active), JSON.stringify(st2.pages).slice(0, 220));

  const prevClicked = (await clickTestId('prev-page')) || (await clickButtonText('上一页'));
  await settle(450);
  const st3 = await pageState();
  check('分页', '上一页 → 回到第 2 页 active', prevClicked && st3.pages.some((p) => p.text === '2' && p.active), JSON.stringify(st3.pages).slice(0, 220));
});

// ---------------------------------------------------------------------------
// 8. responsive
// ---------------------------------------------------------------------------
async function overflowInfo() {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { delta: de.scrollWidth - de.clientWidth, sw: de.scrollWidth, cw: de.clientWidth };
  });
}
async function sidebarState() {
  return page.evaluate(() => {
    const sb = document.querySelector('.sidebar');
    const app = document.querySelector('.app');
    const hb = document.querySelector('.hamburger, [aria-label*="菜单"], button[aria-label*="sidebar"]');
    if (!sb) return { exists: false, onScreen: false, openClass: false };
    const r = sb.getBoundingClientRect();
    const cs = getComputedStyle(sb);
    const vw = innerWidth;
    const onScreen =
      r.width > 40 &&
      r.x < vw - 20 &&
      r.x + r.width > 20 &&
      cs.visibility !== 'hidden' &&
      cs.display !== 'none' &&
      Number(cs.opacity) > 0.05;
    return {
      exists: true,
      onScreen,
      openClass: !!(app && app.classList.contains('sidebar-open')),
      expanded: hb ? hb.getAttribute('aria-expanded') : null,
      x: Math.round(r.x),
      w: Math.round(r.width),
      visibility: cs.visibility,
      display: cs.display,
    };
  });
}
async function closeDrawer(w) {
  const bd = await collectVisible(page.locator('.sidebar-backdrop, .drawer-backdrop, .overlay-mask'));
  if (bd.length) {
    const box = await bd[0].boundingBox().catch(() => null);
    if (box && box.width > 100) {
      await bd[0].click({ position: { x: Math.max(20, box.width - 30), y: Math.min(120, box.height / 2) }, timeout: 2000 }).catch(() => {});
    } else {
      await page.mouse.click(Math.max(20, w - 30), 300).catch(() => {});
    }
  } else {
    await page.mouse.click(Math.max(20, w - 30), 300).catch(() => {});
  }
  await settle(500);
}

async function responsiveCase(w, h, label, closeBy) {
  await page.setViewportSize({ width: w, height: h });
  await settle(600);
  const ov = await overflowInfo();
  check('响应式', `${label}: 无横向溢出`, ov.delta <= 1, `scrollWidth=${ov.sw} clientWidth=${ov.cw}`);
  const hamburger = await collectVisible(page.locator('.hamburger'));
  check('响应式', `${label}: 汉堡按钮可见`, hamburger.length > 0, '', 'shell-dev');
  if (!hamburger.length) return;
  const closed = await sidebarState();
  check('响应式', `${label}: 抽屉默认关闭`, !closed.onScreen && !closed.openClass, JSON.stringify(closed).slice(0, 200), 'shell-dev');
  await hamburger[0].click({ timeout: 2500 }).catch(() => {});
  await settle(550);
  const opened = await sidebarState();
  check('响应式', `${label}: 汉堡打开抽屉（.sidebar-open/侧栏可见）`, opened.onScreen || opened.openClass || opened.expanded === 'true', JSON.stringify(opened).slice(0, 200), 'shell-dev');
  if (w <= 400) await page.screenshot({ path: P('tools/out/users-mobile-390.png'), clip: { x: 0, y: 0, width: w, height: h } }).catch(() => {});
  if (label === '1024×768') await page.screenshot({ path: P('tools/out/users-1024.png'), clip: { x: 0, y: 0, width: w, height: h } }).catch(() => {});
  if (closeBy === 'esc') await page.keyboard.press('Escape').catch(() => {});
  else await closeDrawer(w);
  await settle(550);
  const reclosed = await sidebarState();
  check('响应式', `${label}: ${closeBy === 'esc' ? 'Esc' : '遮罩'}关闭抽屉`, !reclosed.onScreen && !reclosed.openClass, JSON.stringify(reclosed).slice(0, 200), 'shell-dev');
}

await group('响应式', async () => {
  // desktop sanity: sidebar visible at 1376
  await page.setViewportSize({ ...DESKTOP });
  await settle(600);
  const desk = await sidebarState();
  check('响应式', '1376×768: 桌面侧栏常驻可见', desk.exists && desk.onScreen && !desk.openClass, JSON.stringify(desk).slice(0, 200), 'shell-dev');
  await responsiveCase(1024, 768, '1024×768', 'esc');
  await responsiveCase(768, 1024, '768×1024', 'backdrop');
  await responsiveCase(390, 844, '390×844', 'esc');
  await page.setViewportSize({ ...DESKTOP });
  await settle(500);
});

// ---------------------------------------------------------------------------
// 9. final error check
// ---------------------------------------------------------------------------
await group('汇总', async () => {
  await settle(300);
  check('汇总', '全程 console/page error 为 0', consoleErrors.length === 0 && pageErrors.length === 0, `console=${consoleErrors.length} page=${pageErrors.length}${consoleErrors.length ? ' ' + consoleErrors.slice(0, 3).join(' | ').slice(0, 220) : ''}`);
  if (failedRequests.length) {
    check('汇总', '无失败的网络请求', false, failedRequests.slice(0, 3).join(' | ').slice(0, 250));
  } else {
    check('汇总', '无失败的网络请求', true);
  }
});

await browser.close();

// ---------------------------------------------------------------------------
// write results + merge into report
// ---------------------------------------------------------------------------
const pass = checks.filter((c) => c.pass).length;
const fail = checks.length - pass;
const payload = {
  timestamp: new Date().toISOString(),
  url: URL_,
  viewport: '1376×768 (desktop) + 1024×768 / 768×1024 / 390×844 (responsive)',
  totals: { pass, fail, total: checks.length },
  checks,
  notes: [
    '自动化识别「切换后是否生效」以可见行文本/记录数/active class 为准，不依赖具体 DOM 类名（优先文本定位）。',
    ...(fail ? ['失败项明细见 checks[].detail 与 docs/users-qa-report.md 交互章节。'] : []),
  ],
  consoleErrors,
  pageErrors,
  failedRequests,
  nativeDialogs,
};
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

console.log(checks.map((c, i) => `${String(i + 1).padStart(2, '0')} ${c.pass ? 'PASS' : 'FAIL'}  [${c.group}] ${c.name}${c.detail ? '  — ' + c.detail.slice(0, 160) : ''}`).join('\n'));
console.log(`\n${pass} pass / ${fail} fail / ${checks.length} total`);
console.log(`results: ${path.relative(PROJECT, OUT_JSON)}`);
if (failedRequests.length) console.log('failed requests: ' + failedRequests.slice(0, 5).join(' | '));

if (MERGE) {
  console.log('\n[merge] re-shooting + regenerating docs/users-qa-report.md ...');
  try {
    execFileSync(process.execPath, [path.join(HERE, 'shot.mjs')], { cwd: PROJECT, stdio: 'ignore', timeout: 90000 });
    execFileSync(process.execPath, [path.join(HERE, 'diff.mjs')], { cwd: PROJECT, stdio: 'inherit', timeout: 120000 });
  } catch (err) {
    console.error('warning: merge into docs/users-qa-report.md failed: ' + String(err && err.message ? err.message : err));
  }
}

if (fail) process.exitCode = 1;
