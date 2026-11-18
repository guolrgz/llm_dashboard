#!/usr/bin/env node
/**
 * users/diff.mjs — pixel-diff QA for the 用户管理 page restoration.
 *
 * Compares the JPEG design reference (users.jpg, 2752×1536 = 1376×768 CSS @2x)
 * against a screenshot produced by tools/users/shot.mjs (same pixel size).
 *
 * Usage (from repo root):
 *   node tools/users/diff.mjs [--base=users.jpg] [--current=tools/out/users.png]
 *                             [--report=docs/users-qa-report.md]
 *                             [--image=docs/users-diff.png]
 *                             [--crops=docs/users-crops]
 *                             [--stats=tools/out/users-diff-stats.json]
 *                             [--threshold=24] [--top=10]
 *                             [--refresh-baseline] [--allow-size-mismatch]
 *                             [--no-interaction]
 *
 * Outputs:
 *   docs/users-qa-report.md              metrics + regions + grid + hotspots + interaction results
 *   docs/users-diff.png                  baseline | current | diff-heatmap (50% scale, 3 panels)
 *   docs/users-crops/hotspot-N.png       per-hotspot baseline | current close-ups (2× nearest)
 *   tools/out/users-baseline.png         cached lossless decode of users.jpg
 *   tools/out/users-diff-stats.json      machine-readable stats (also per-dev hotspot buckets)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';

const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url)); // tools/users
const TOOLS = path.resolve(HERE, '..'); // tools
const PROJECT = path.resolve(TOOLS, '..'); // repo root

// ---------- geometry constants (image px = CSS px × 2) ----------------------
const EXP_W = 2752;
const EXP_H = 1536;

// ---------- args ------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = {
  base: 'users.jpg',
  current: 'tools/out/users.png',
  baselinePng: 'tools/out/users-baseline.png',
  report: 'docs/users-qa-report.md',
  image: 'docs/users-diff.png',
  crops: 'docs/users-crops',
  stats: 'tools/out/users-diff-stats.json',
  interaction: 'tools/out/users-interaction.json',
  meta: 'tools/out/users-meta.json',
  threshold: 24,
  top: 10,
  refreshBaseline: false,
  allowSizeMismatch: false,
  interactionSection: true,
};
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)(?:=(.*))?$/);
  if (!m) continue;
  const k = m[1];
  const v = m[2];
  if (k === 'refresh-baseline') { opt.refreshBaseline = true; continue; }
  if (k === 'allow-size-mismatch') { opt.allowSizeMismatch = true; continue; }
  if (k === 'no-interaction') { opt.interactionSection = false; continue; }
  if (!(k in opt)) continue;
  opt[k] = typeof opt[k] === 'number' ? parseInt(v, 10) : v;
}
const P = (p) => path.resolve(PROJECT, p);

// ---------- baseline JPEG -> PNG (cached) -----------------------------------
function ensureBaselinePng() {
  const src = P(opt.base);
  const dst = P(opt.baselinePng);
  if (!fs.existsSync(src)) {
    console.error(`diff.mjs: baseline not found: ${src}`);
    process.exit(2);
  }
  let need = opt.refreshBaseline || !fs.existsSync(dst);
  if (!need) need = fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs;
  if (need) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const pyPath = `${path.join(TOOLS, '.pylibs')}${process.env.PYTHONPATH ? ':' + process.env.PYTHONPATH : ''}`;
    try {
      execFileSync('python3', [path.join(HERE, 'decode-baseline.py'), src, dst], {
        env: { ...process.env, PYTHONPATH: pyPath },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (err) {
      console.error('diff.mjs: failed to decode baseline JPEG with Python/PIL.');
      console.error(String(err && err.stderr ? err.stderr : err).slice(0, 800));
      console.error('hint: PYTHONPATH=tools/.pylibs python3 tools/users/decode-baseline.py users.jpg tools/out/users-baseline.png');
      process.exit(2);
    }
  }
  return dst;
}

if (!fs.existsSync(P(opt.current))) {
  console.error(`diff.mjs: current screenshot not found: ${P(opt.current)}\nRun: node tools/users/shot.mjs`);
  process.exit(2);
}
const baselinePng = ensureBaselinePng();
const base = PNG.sync.read(fs.readFileSync(baselinePng));
const cur = PNG.sync.read(fs.readFileSync(P(opt.current)));
const BW = base.width, BH = base.height;
const CW = cur.width, CH = cur.height;

// ---------- assert dimensions ----------------------------------------------
if (!opt.allowSizeMismatch) {
  const problems = [];
  if (BW !== EXP_W || BH !== EXP_H) problems.push(`baseline users.jpg decoded to ${BW}×${BH}, expected ${EXP_W}×${EXP_H}`);
  if (CW !== BW || CH !== BH) problems.push(`screenshot ${opt.current} is ${CW}×${CH}, expected ${BW}×${BH} (run shot.mjs with --width=1376 --height=768 --dsf=2)`);
  if (problems.length) {
    console.error('diff.mjs: SIZE ASSERTION FAILED');
    for (const p of problems) console.error('  - ' + p);
    process.exit(2);
  }
}
const W = Math.min(BW, CW), H = Math.min(BH, CH);

// ---------- helpers ---------------------------------------------------------
const at = (img, x, y) => (y * img.width + x) * 4;
function rgb(img, x, y) {
  const i = at(img, x, y);
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
const hex = (c) =>
  '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const pct = (n, d) => (d ? (100 * n) / d : 0);
const fmt = (n, dp = 2) => Number(n).toFixed(dp);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- per-pixel diff ---------------------------------------------------
const delta = new Uint8Array(W * H);
const mask = new Uint8Array(W * H);
const bd = base.data, cd = cur.data;
let mismatchPixels = 0;
let sumAbs = 0;
for (let y = 0; y < H; y++) {
  const row = y * W;
  const bo = row * 4;
  for (let x = 0; x < W; x++) {
    const i = bo + x * 4;
    const d0 = Math.abs(bd[i] - cd[i]);
    const d1 = Math.abs(bd[i + 1] - cd[i + 1]);
    const d2 = Math.abs(bd[i + 2] - cd[i + 2]);
    const m = Math.max(d0, d1, d2);
    const k = row + x;
    delta[k] = m;
    sumAbs += d0 + d1 + d2;
    if (m > opt.threshold) {
      mask[k] = 1;
      mismatchPixels++;
    }
  }
}
const totalPixels = BW * BH;
const missingPixels = Math.max(0, totalPixels - W * H);
mismatchPixels += missingPixels;
const meanAbs = sumAbs / (Math.max(1, W * H) * 3);

// ---------- named regions (image px; CSS px = /2) --------------------------
// Boxes from docs/users-design-spec.md §1 / §6 / §7.
const REGIONS = [
  { name: '侧边栏 Sidebar', x: 0, y: 0, w: 430, h: 1536, owner: 'shell-dev' },
  { name: '顶栏 Topbar', x: 430, y: 0, w: 2322, h: 106, owner: 'shell-dev' },
  { name: '页头 Page header', x: 431, y: 106, w: 2321, h: 200, owner: 'content-dev' },
  { name: '筛选卡 Filter card', x: 479, y: 306, w: 2237, h: 156, owner: 'content-dev' },
  { name: '工具栏 Toolbar', x: 479, y: 491, w: 2237, h: 145, owner: 'content-dev' },
  { name: '表头+数据行 Table header + rows', x: 479, y: 637, w: 2237, h: 595, owner: 'content-dev' },
  { name: '分页 Pagination', x: 479, y: 1232, w: 2237, h: 138, owner: 'content-dev' },
];
const regionAdvice = {
  '侧边栏 Sidebar':
    '核对宽度 215 CSS px、深蓝渐变 #182541、导航行高 45.5（active 48）、active 行 y131.5–179.5 + 左侧 2px #3b87f7、divider y279.5、菜单文案（Dashboard/用户管理/模型管理/权限管理/流量监控/系统设置）、退出登录 y713。',
  '顶栏 Topbar':
    '核对高度 53、纯白底、汉堡 x240.5（3 条 2px 线 y17.5/24/30.5）、铃铛 x1217.5 + 红点“2”、头像 d30.5、admin 文案 x1305 13.5px/500、右侧 padding 22。',
  '页头 Page header':
    '核对 H1“用户管理” 30px/800 左 ink x243.5、ink y79–106.5；副标题 14px 左 x242.5、ink y119–133；页头底到筛选卡间距 17。',
  '筛选卡 Filter card':
    '核对卡片 y153–231（h78）、控件高 39、搜索框 x257.5 w229、状态/角色 select 内联选项与选中 pill #e8effc、查询 #2077ed x1198.5、重置白底描边 x1273。',
  '工具栏 Toolbar':
    '核对按钮 y263.5–300.5（h37）右对齐 padding 18，新增 #1f7bf2、批量删除 #d95a5c、批量启用/停用 #d1d4dc（无选中时灰态）。',
  '表头+数据行 Table header + rows':
    '核对表头 band y318.5–359 bg #ebf2fd、列 x（318.5/424.5/529.5/650.5/854/1046/1151.5）、行高 64.5、4 行文案、状态徽章、操作列（编辑/编改、停用 pill、删除）。',
  '分页 Pagination':
    '核对分页文案“共 48 条记录，每页 10 条” x258.5 16px、按钮 h34、页码 1 active #2077ed、上一页/下一页位置、表格卡底 y684.5。',
};
function regionStats(r) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
  const area = Math.max(1, r.w * r.h);
  let bad = 0, sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) {
      const k = row + x;
      if (mask[k]) bad++;
      sum += delta[k];
      n++;
    }
  }
  const missing = Math.max(0, area - n);
  return { ...r, bad: bad + missing, pct: pct(bad + missing, area), meanDelta: n ? sum / n : 255, area };
}
const regions = REGIONS.map(regionStats);

// ---------- 16 × 8 grid ------------------------------------------------------
const GX = 16, GY = 8;
const gridCells = [];
for (let gy = 0; gy < GY; gy++) {
  const row = [];
  for (let gx = 0; gx < GX; gx++) {
    const x0 = Math.floor((gx * BW) / GX), x1 = Math.floor(((gx + 1) * BW) / GX);
    const y0 = Math.floor((gy * BH) / GY), y1 = Math.floor(((gy + 1) * BH) / GY);
    let bad = 0, n = 0;
    for (let y = y0; y < Math.min(y1, H); y++) {
      const r = y * W;
      for (let x = x0; x < Math.min(x1, W); x++) { if (mask[r + x]) bad++; n++; }
    }
    const area = (x1 - x0) * (y1 - y0);
    const missing = Math.max(0, area - n);
    const cell = { gx, gy, x0, y0, x1, y1, bad: bad + missing, pct: pct(bad + missing, area) };
    row.push(cell);
    gridCells.push(cell);
  }
}

// ---------- hotspot detection (16px blocks, 8-connected components) --------
const BS = 16;
const BWb = Math.ceil(BW / BS), BHb = Math.ceil(BH / BS);
const blocks = new Uint8Array(BWb * BHb);
const blockBad = new Uint32Array(BWb * BHb);
for (let by = 0; by < BHb; by++) {
  for (let bx = 0; bx < BWb; bx++) {
    const x0 = bx * BS, y0 = by * BS;
    let bad = 0, n = 0;
    for (let y = y0; y < Math.min(y0 + BS, H); y++) {
      const r = y * W;
      for (let x = x0; x < Math.min(x0 + BS, W); x++) { if (mask[r + x]) bad++; n++; }
    }
    const area = BS * BS;
    const miss = Math.max(0, area - n);
    const idx = by * BWb + bx;
    blockBad[idx] = bad + miss;
    if (bad + miss >= 6 && (bad + miss) / area >= 0.08) blocks[idx] = 1;
  }
}
const seen = new Uint8Array(BWb * BHb);
const components = [];
for (let by = 0; by < BHb; by++) {
  for (let bx = 0; bx < BWb; bx++) {
    const idx = by * BWb + bx;
    if (!blocks[idx] || seen[idx]) continue;
    const queue = [[bx, by]];
    seen[idx] = 1;
    let minx = bx, maxx = bx, miny = by, maxy = by, bad = 0;
    while (queue.length) {
      const [cx, cy] = queue.pop();
      const ii = cy * BWb + cx;
      bad += blockBad[ii];
      if (cx < minx) minx = cx;
      if (cx > maxx) maxx = cx;
      if (cy < miny) miny = cy;
      if (cy > maxy) maxy = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= BWb || ny >= BHb) continue;
          const ni = ny * BWb + nx;
          if (blocks[ni] && !seen[ni]) { seen[ni] = 1; queue.push([nx, ny]); }
        }
      }
    }
    const bbox = {
      x0: minx * BS,
      y0: miny * BS,
      x1: Math.min(BW, (maxx + 1) * BS),
      y1: Math.min(BH, (maxy + 1) * BS),
    };
    components.push({
      ...bbox,
      w: bbox.x1 - bbox.x0,
      h: bbox.y1 - bbox.y0,
      bad,
      density: bad / Math.max(1, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0)),
    });
  }
}

// mean colours + best integer shift per component (adaptive sampling)
function componentDetail(c) {
  const area = Math.max(1, c.w * c.h);
  const stepMean = Math.max(1, Math.ceil(Math.sqrt(area / 12000)));
  let sumB = [0, 0, 0], sumC = [0, 0, 0], n = 0;
  for (let y = c.y0; y < c.y1; y += stepMean) {
    for (let x = c.x0; x < c.x1; x += stepMean) {
      const b = rgb(base, x, y), cc = rgb(cur, x, y);
      sumB[0] += b[0]; sumB[1] += b[1]; sumB[2] += b[2];
      sumC[0] += cc[0]; sumC[1] += cc[1]; sumC[2] += cc[2];
      n++;
    }
  }
  const meanB = sumB.map((v) => v / Math.max(1, n));
  const meanC = sumC.map((v) => v / Math.max(1, n));

  const stepShift = Math.max(stepMean, Math.ceil(Math.sqrt(area / 2500)));
  const R = 7;
  let best = { dx: 0, dy: 0, err: Infinity };
  let zeroErr = Infinity;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let err = 0, m = 0;
      for (let y = c.y0; y < c.y1; y += stepShift) {
        for (let x = c.x0; x < c.x1; x += stepShift) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= CW || sy >= CH) { err += 60; m++; continue; }
          const i = at(base, x, y), j = at(cur, sx, sy);
          err += Math.abs(base.data[i] - cur.data[j]);
          err += Math.abs(base.data[i + 1] - cur.data[j + 1]);
          err += Math.abs(base.data[i + 2] - cur.data[j + 2]);
          m++;
        }
      }
      err /= Math.max(1, m);
      if (dx === 0 && dy === 0) zeroErr = err;
      if (err < best.err) best = { dx, dy, err };
    }
  }
  return {
    ...c,
    meanBase: meanB,
    meanCur: meanC,
    shift: best.err <= zeroErr * 0.97 ? { dx: best.dx, dy: best.dy } : { dx: 0, dy: 0, insignificant: true },
  };
}
const scattered = components.filter((c) => c.w * c.h > BW * BH * 0.25 && c.density < 0.06);
const hot = components
  .filter((c) => !scattered.includes(c))
  .sort((a, b) => b.bad - a.bad)
  .slice(0, opt.top)
  .map(componentDetail);

// hottest 64×64 cells (fine-grained; used for per-owner feedback)
const CS = 64;
const cells = [];
for (let y0 = 0; y0 < BH; y0 += CS) {
  for (let x0 = 0; x0 < BW; x0 += CS) {
    const x1 = Math.min(BW, x0 + CS), y1 = Math.min(BH, y0 + CS);
    let bad = 0, n = 0;
    for (let y = y0; y < Math.min(y1, H); y++) {
      const r = y * W;
      for (let x = x0; x < Math.min(x1, W); x++) { if (mask[r + x]) bad++; n++; }
    }
    const area = (x1 - x0) * (y1 - y0);
    const missing = Math.max(0, area - n);
    cells.push({
      x0, y0, x1, y1,
      bad: bad + missing,
      area,
      pct: pct(bad + missing, area),
      meanBase: rgb(base, Math.min(BW - 1, Math.floor((x0 + x1) / 2)), Math.min(BH - 1, Math.floor((y0 + y1) / 2))),
      meanCur: rgb(cur, Math.min(CW - 1, Math.floor((x0 + x1) / 2)), Math.min(CH - 1, Math.floor((y0 + y1) / 2))),
    });
  }
}
const hotCells = [...cells].sort((a, b) => b.bad - a.bad).slice(0, 15);

// ---------- owner / nearest region -----------------------------------------
function containingRegion(x, y) {
  for (const r of regions) {
    if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4) return r;
  }
  return null;
}
function nearestRegionName(c) {
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  const hit = containingRegion(cx, cy);
  if (hit) return hit.name;
  let best = null, bd = Infinity;
  for (const r of regions) {
    const d = Math.hypot(cx - (r.x + r.w / 2), cy - (r.y + r.h / 2));
    if (d < bd) { bd = d; best = r.name; }
  }
  return best;
}
function ownerOfRegionName(name) {
  const r = regions.find((rr) => rr.name === name);
  return r ? r.owner : 'content-dev';
}
const hotWithMeta = hot.map((c) => {
  const region = nearestRegionName(c);
  return { ...c, region, owner: ownerOfRegionName(region) };
});

// per-owner top hotspots for dev messages (fallback: 64px cells if needed)
const perOwner = { 'shell-dev': [], 'content-dev': [] };
for (const c of hotWithMeta) perOwner[c.owner].push(c);
for (const owner of ['shell-dev', 'content-dev']) {
  if (perOwner[owner].length) continue;
  const ownerRegions = regions.filter((r) => r.owner === owner);
  perOwner[owner] = cells
    .filter((c) => ownerRegions.some((r) => {
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
    }))
    .sort((a, b) => b.bad - a.bad)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      w: c.x1 - c.x0,
      h: c.y1 - c.y0,
      density: c.area ? c.bad / c.area : 0,
      region: ownerRegions[0].name,
      owner,
      meanBase: c.meanBase,
      meanCur: c.meanCur,
      shift: { dx: 0, dy: 0, insignificant: true },
    }));
}

// ---------- image helpers ---------------------------------------------------
function writePng(file, w, h, data) {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data);
  fs.writeFileSync(file, PNG.sync.write(png));
}
function downscale(img, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const sx = img.width / dw, sy = img.height / dh;
  for (let y = 0; y < dh; y++) {
    const ys = Math.floor(y * sy), ye = Math.min(img.height, Math.ceil((y + 1) * sy));
    for (let x = 0; x < dw; x++) {
      const xs = Math.floor(x * sx), xe = Math.min(img.width, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = ys; yy < ye; yy++) {
        const row = yy * img.width;
        for (let xx = xs; xx < xe; xx++) {
          const i = (row + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}

// docs/users-diff.png — 3 panels: baseline | current | heatmap, 50% scale
{
  const hw = Math.floor(BW / 2), hh = Math.floor(BH / 2);
  const gap = 4;
  const OW = hw * 3 + gap * 2, OH = hh;
  const comp = new Uint8ClampedArray(OW * OH * 4);
  for (let i = 0; i < comp.length; i += 4) { comp[i] = 18; comp[i + 1] = 18; comp[i + 2] = 22; comp[i + 3] = 255; }
  const left = downscale(base, hw, hh);
  const right = downscale(cur, hw, hh);

  // heatmap at full res, then downscale
  const heat = new Uint8ClampedArray(BW * BH * 4);
  for (let y = 0; y < BH; y++) {
    const row = y * BW;
    for (let x = 0; x < BW; x++) {
      const o = (row + x) * 4;
      const b = rgb(base, x, y);
      const gray = (b[0] * 0.299 + b[1] * 0.587 + b[2] * 0.114) * 0.55 + 60;
      let r = gray, g = gray, bb = gray;
      if (x < W && y < H) {
        const k = row + x;
        if (mask[k]) {
          const a = Math.min(1, delta[k] / 96);
          r = 255; g = 60 + gray * (1 - a); bb = 40 + gray * (1 - a);
        }
      }
      heat[o] = r; heat[o + 1] = g; heat[o + 2] = bb; heat[o + 3] = 255;
    }
  }
  const heatSmall = downscale({ width: BW, height: BH, data: heat }, hw, hh);
  const targets = [left, right, heatSmall];
  const put = (src, ox) => {
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < hw; x++) {
        const si = (y * hw + x) * 4, di = (y * OW + ox + x) * 4;
        comp[di] = src[si]; comp[di + 1] = src[si + 1]; comp[di + 2] = src[si + 2]; comp[di + 3] = 255;
      }
    }
  };
  put(targets[0], 0);
  put(targets[1], hw + gap);
  put(targets[2], hw * 2 + gap * 2);
  writePng(P(opt.image), OW, OH, comp);
}

// hotspot close-ups: baseline | current, 2× nearest-neighbour, window-clamped
const MAXCROP_W = 560, MAXCROP_H = 420;
function cropWindow(c) {
  const pad = 10;
  const bx0 = Math.max(0, c.x0 - pad), by0 = Math.max(0, c.y0 - pad);
  const bx1 = Math.min(BW, c.x1 + pad), by1 = Math.min(BH, c.y1 + pad);
  let x0 = bx0, y0 = by0, x1 = bx1, y1 = by1, clamped = false;
  if (x1 - x0 > MAXCROP_W || y1 - y0 > MAXCROP_H) {
    clamped = true;
    // centre window on the densest 64px cell inside the component
    let best = null;
    for (let yy = c.y0; yy < c.y1; yy += CS) {
      for (let xx = c.x0; xx < c.x1; xx += CS) {
        let bad = 0, n = 0;
        for (let y = yy; y < Math.min(yy + CS, H); y++) {
          const r = y * W;
          for (let x = xx; x < Math.min(xx + CS, W); x++) { if (mask[r + x]) bad++; n++; }
        }
        const v = bad / Math.max(1, n);
        if (!best || v > best.v) best = { v, x: xx, y: yy };
      }
    }
    const cx = best ? best.x + CS / 2 : (bx0 + bx1) / 2;
    const cy = best ? best.y + CS / 2 : (by0 + by1) / 2;
    const w = Math.min(MAXCROP_W, bx1 - bx0), h = Math.min(MAXCROP_H, by1 - by0);
    x0 = clamp(Math.round(cx - w / 2), bx0, Math.max(bx0, bx1 - w));
    y0 = clamp(Math.round(cy - h / 2), by0, Math.max(by0, by1 - h));
    x1 = Math.min(bx1, x0 + w);
    y1 = Math.min(by1, y0 + h);
  }
  return { x0, y0, x1, y1, clamped };
}
const cropFiles = [];
if (hotWithMeta.length) {
  fs.mkdirSync(P(opt.crops), { recursive: true });
  // remove stale hotspot crops from previous runs
  for (const f of fs.readdirSync(P(opt.crops))) {
    if (/^hotspot-\d+\.png$/i.test(f)) fs.rmSync(path.join(P(opt.crops), f));
  }
  hotWithMeta.forEach((c, i) => {
    const win = cropWindow(c);
    const cw = win.x1 - win.x0, ch = win.y1 - win.y0;
    const scale = 2;
    const gap = 4;
    const ow = cw * scale * 2 + gap, oh = ch * scale;
    const data = new Uint8ClampedArray(ow * oh * 4);
    for (let k = 0; k < data.length; k += 4) { data[k] = 30; data[k + 1] = 30; data[k + 2] = 34; data[k + 3] = 255; }
    const putCrop = (img, ox) => {
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const sx = win.x0 + x, sy = win.y0 + y;
          if (sx >= img.width || sy >= img.height) continue;
          const si = (sy * img.width + sx) * 4;
          for (let sy2 = 0; sy2 < scale; sy2++) {
            for (let sx2 = 0; sx2 < scale; sx2++) {
              const dx = ox + x * scale + sx2, dy = y * scale + sy2;
              const di = (dy * ow + dx) * 4;
              data[di] = img.data[si]; data[di + 1] = img.data[si + 1]; data[di + 2] = img.data[si + 2]; data[di + 3] = 255;
            }
          }
        }
      }
    };
    putCrop(base, 0);
    putCrop(cur, cw * scale + gap);
    const file = path.join(P(opt.crops), `hotspot-${i + 1}.png`);
    writePng(file, ow, oh, data);
    cropFiles.push({ file: path.relative(PROJECT, file), window: win, panelW: cw * scale, panelH: ch * scale, scale });
  });
}

// ---------- read screenshot meta + interaction results ----------------------
let meta = {};
try { meta = JSON.parse(fs.readFileSync(P(opt.meta), 'utf8')); } catch { /* optional */ }
let interaction = null;
if (opt.interactionSection) {
  try { interaction = JSON.parse(fs.readFileSync(P(opt.interaction), 'utf8')); } catch { /* optional */ }
}

// ---------- report ----------------------------------------------------------
const overallPct = pct(mismatchPixels, totalPixels);
const verdict =
  overallPct <= 0.5 ? '🟢 PASS (≤0.5%)'
  : overallPct <= 2 ? '🟡 CLOSE (≤2%)'
  : overallPct <= 6 ? '🟠 NEEDS WORK (≤6%)'
  : '🔴 FAR OFF (>6%)';
const statusIcon = (p) => (p <= 0.5 ? '🟢' : p <= 2 ? '🟡' : p <= 8 ? '🟠' : '🔴');
const cssBox = (r) => `${fmt(r.x / 2, 1)},${fmt(r.y / 2, 1)} → ${fmt((r.x + r.w) / 2, 1)},${fmt((r.y + r.h) / 2, 1)}`;

const L = [];
L.push('# 视觉 QA 报告 — 用户管理页面（users.jpg 像素还原）');
L.push('');
L.push(`生成时间: ${new Date().toISOString()}  `);
L.push(`Baseline: \`users.jpg\` (${BW}×${BH}，解码缓存 \`${path.relative(PROJECT, baselinePng)}\`)  `);
L.push(`Current: \`${opt.current}\` (${CW}×${CH})  `);
L.push(`Scale: 1376×768 CSS px @2x（图片 px = CSS px × 2）  `);
L.push(`像素阈值: max channel Δ > ${opt.threshold}  `);
L.push('');
L.push(`## 总体: ${fmt(overallPct)}% 像素不一致 — ${verdict}`);
L.push('');
L.push('| 指标 | 数值 |');
L.push('|---|---|');
L.push(`| 差异像素 | ${mismatchPixels.toLocaleString()} / ${totalPixels.toLocaleString()} |`);
L.push(`| 差异率 | ${fmt(overallPct)}% |`);
L.push(`| 平均绝对通道差 | ${fmt(meanAbs)} / 255 |`);
L.push(`| 截图尺寸匹配 | ${CW === BW && CH === BH ? '是（2752×1536）' : `否（current ${CW}×${CH}）`} |`);
L.push('');
L.push('> 说明：baseline 是 JPEG（有损压缩），文字边缘天然存在 1–2 CSS px 的模糊/振铃，');
L.push('> 因此即使完全还原也会残留少量低幅差异；重点看热点位置与区域差异率。');
L.push('');

// screenshot meta
L.push('## 截图信息（meta）');
L.push('');
L.push('| 项 | 值 |');
L.push('|---|---|');
L.push(`| URL | ${meta.url || opt.url || 'http://127.0.0.1:5173/users.html'} |`);
L.push(`| HTTP 状态 | ${meta.status ?? 'n/a'} |`);
L.push(`| viewport / dsf | ${meta.width ?? '?'}×${meta.height ?? '?'} / ${meta.dsf ?? '?'} → 期望 ${EXP_W}×${EXP_H} |`);
L.push(`| scrollWidth / scrollHeight | ${meta.scrollWidth ?? '?'} / ${meta.scrollHeight ?? '?'}（期望 1376 / 768） |`);
L.push(`| 字体 | ${(meta.fonts || []).filter((f) => /loaded/.test(f)).join('；') || 'n/a'} |`);
L.push(`| console.error | ${(meta.consoleErrors || []).length} 条${(meta.consoleErrors || []).length ? '：' + meta.consoleErrors.map((e) => '`' + String(e).slice(0, 120) + '`').join('，') : ''} |`);
L.push(`| pageerror | ${(meta.pageErrors || []).length} 条${(meta.pageErrors || []).length ? '：' + meta.pageErrors.map((e) => '`' + String(e).slice(0, 120) + '`').join('，') : ''} |`);
L.push('');
if (meta.scrollHeight && meta.scrollHeight !== 768) {
  L.push(`> ⚠️ 1376×768 下文档 scrollHeight = ${meta.scrollHeight}，页面出现纵向滚动（设计要求无滚动）。`);
  L.push('');
}
if (meta.consoleErrors?.length || meta.pageErrors?.length) {
  L.push('> ⚠️ 存在控制台/页面错误，交互测试会判失败，请优先修复。');
  L.push('');
}

// regions
L.push('## 区域差异');
L.push('');
L.push('| 区域 | bbox (img px) | CSS px | 差异率 | 平均Δ | 状态 | 负责 |');
L.push('|---|---|---|---|---|---|---|');
for (const r of regions) {
  L.push(`| ${r.name} | ${r.x},${r.y},${r.w},${r.h} | ${cssBox(r)} | ${fmt(r.pct)}% | ${fmt(r.meanDelta, 1)} | ${statusIcon(r.pct)} | ${r.owner} |`);
}
L.push('');
L.push('各区域建议核对：');
for (const r of regions) L.push(`- **${r.name}**（${r.owner}）: ${regionAdvice[r.name] || '检查该区域。'}`);
L.push('');

// grid
L.push(`## 网格差异（${GX}×${GY}，单元内差异像素 %）`);
L.push('');
L.push('| 行 \\ 列 | ' + Array.from({ length: GX }, (_, i) => i + 1).join(' | ') + ' |');
L.push('|---|' + '---|'.repeat(GX));
for (let gy = 0; gy < GY; gy++) {
  const row = gridCells.filter((c) => c.gy === gy);
  L.push(`| ${gy + 1} (y${row[0].y0}-${row[0].y1}) | ` + row.map((c) => fmt(c.pct, 1)).join(' | ') + ' |');
}
L.push('');

// hotspots
L.push(`## Top ${hotWithMeta.length} 差异热点`);
L.push('');
if (!hotWithMeta.length) {
  L.push('没有区域超过热点阈值。🎉');
  L.push('');
} else {
  L.push('| # | bbox (x0,y0)-(x1,y1) | 尺寸 | 差异像素 | 密度 | baseline 均色 | current 均色 | 位移估计 | 邻近区域 | 负责 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  hotWithMeta.forEach((c, i) => {
    const shiftTxt =
      c.shift.insignificant ? '内容不同（无匹配）'
      : c.shift.dx === 0 && c.shift.dy === 0 ? '无位移'
      : `(${c.shift.dx > 0 ? '+' : ''}${c.shift.dx},${c.shift.dy > 0 ? '+' : ''}${c.shift.dy}) px`;
    L.push(`| ${i + 1} | (${c.x0},${c.y0})-(${c.x1},${c.y1}) | ${c.w}×${c.h} | ${c.bad.toLocaleString()} | ${fmt(c.density * 100, 1)}% | ${hex(c.meanBase)} | ${hex(c.meanCur)} | ${shiftTxt} | ${c.region} | ${c.owner} |`);
  });
  L.push('');
  L.push('> 位移估计 = 让 current 内容重新对齐 baseline 所需整数 (dx,dy)；正值表示 current 内容偏右/偏下。');
  L.push('');
  L.push('热点放大图（左 baseline | 右 current，2× 最近邻）：');
  cropFiles.forEach((f, i) => {
    const w = f.window;
    L.push(`- 热点 ${i + 1}: \`${f.file}\`（窗口 (${w.x0},${w.y0})-(${w.x1},${w.y1})${w.clamped ? '，热点过大已取最密子窗口' : ''}）`);
  });
  L.push('');
}

// hottest fine cells
if (hotCells.length) {
  L.push('### 最热 64×64 单元（细粒度定位）');
  L.push('');
  L.push('| # | bbox (x0,y0)-(x1,y1) | 差异率 | baseline 均色 | current 均色 | 邻近区域 | 负责 |');
  L.push('|---|---|---|---|---|---|---|');
  hotCells.forEach((c, i) => {
    const region = nearestRegionName(c);
    L.push(`| ${i + 1} | (${c.x0},${c.y0})-(${c.x1},${c.y1}) | ${fmt(c.pct, 1)}% | ${hex(c.meanBase)} | ${hex(c.meanCur)} | ${region} | ${ownerOfRegionName(region)} |`);
  });
  L.push('');
}

// scattered
if (scattered.length) {
  L.push('### 大面积低密度差异（背景/字体渲染/阴影类）');
  L.push('');
  for (const c of scattered) {
    L.push(`- (${c.x0},${c.y0})-(${c.x1},${c.y1}) ${c.w}×${c.h}，${c.bad.toLocaleString()} px，密度 ${fmt(c.density * 100, 1)}% — 多半是整页背景色 / 字体渲染 / 阴影差异，不是单个错位元素。`);
  }
  L.push('');
}

// fix order
L.push('## 建议修复顺序');
L.push('');
const ordered = regions.filter((r) => r.pct > 0.5).sort((a, b) => b.pct * b.area - a.pct * a.area);
if (!ordered.length) L.push('所有区域都在 0.5% 以内，只剩抗锯齿噪声。');
ordered.forEach((r, i) => L.push(`${i + 1}. **${r.name}**（${fmt(r.pct)}% 差异，${r.owner}）— ${regionAdvice[r.name] || '检查该区域。'}`));
L.push('');

// interaction section
L.push('## 交互 + 响应式验证（Playwright）');
L.push('');
if (!opt.interactionSection) {
  L.push('本次运行跳过了交互结果合并（--no-interaction）。');
  L.push('');
} else if (!interaction) {
  L.push('尚未运行：`node tools/users/interaction-test.mjs`（结果会写入 `tools/out/users-interaction.json` 并合并到本报告）。');
  L.push('');
} else {
  const items = interaction.checks || interaction.results || [];
  const pass = items.filter((i) => i.pass).length;
  const fail = items.length - pass;
  L.push(`运行时间: ${interaction.timestamp || 'n/a'}  
URL: ${interaction.url || 'n/a'}  
viewport: ${interaction.viewport || '1376×768 (desktop) + 1024/768/390 (responsive)'}  `);
  L.push('');
  L.push(`汇总: ✅ ${pass} 通过 / ❌ ${fail} 失败 / 共 ${items.length} 项`);
  L.push('');
  L.push('| # | 分组 | 检查项 | 结果 | 说明 |');
  L.push('|---|---|---|---|---|');
  items.forEach((it, i) => {
    const detail = String(it.detail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 220);
    L.push(`| ${i + 1} | ${it.group || '-'} | ${it.name} | ${it.pass ? '✅ 通过' : '❌ 失败'} | ${detail} |`);
  });
  L.push('');
  if (fail) {
    L.push('失败项明细：');
    for (const it of items.filter((i) => !i.pass)) {
      L.push(`- **${it.group || ''} ${it.name}**：${it.detail || '（无说明）'}${it.owner ? ` — 负责：${it.owner}` : ''}`);
    }
    L.push('');
  }
  if (interaction.notes?.length) {
    L.push('补充说明：');
    for (const n of interaction.notes) L.push(`- ${n}`);
    L.push('');
  }
}

L.push('## 产物');
L.push('');
L.push(`- 三联对比图: \`${opt.image}\`（左 baseline | 中 current | 右差异热力图，50% 缩放）`);
L.push(`- 热点放大图: \`${opt.crops}/hotspot-*.png\`（每个热点左右并排，2×）`);
L.push(`- 机器可读统计: \`${opt.stats}\``);
L.push(`- 截图: \`${opt.current}\`，meta: \`${opt.meta}\``);
L.push('');

fs.mkdirSync(path.dirname(P(opt.report)), { recursive: true });
fs.writeFileSync(P(opt.report), L.join('\n'));

fs.mkdirSync(path.dirname(P(opt.stats)), { recursive: true });
fs.writeFileSync(
  P(opt.stats),
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      scale: { cssWidth: 1376, cssHeight: 768, dsf: 2, imageWidth: EXP_W, imageHeight: EXP_H },
      base: { file: opt.base, decoded: path.relative(PROJECT, baselinePng), width: BW, height: BH },
      current: { file: opt.current, width: CW, height: CH },
      threshold: opt.threshold,
      mismatchPixels,
      totalPixels,
      mismatchPct: overallPct,
      meanAbsChannelDiff: meanAbs,
      screenshotMeta: meta,
      regions: regions.map((r) => ({
        name: r.name, owner: r.owner, bbox: [r.x, r.y, r.w, r.h],
        cssBox: [r.x / 2, r.y / 2, r.w / 2, r.h / 2],
        pct: r.pct, meanDelta: r.meanDelta, bad: r.bad,
      })),
      grid: gridCells,
      hotspots: hotWithMeta,
      hotspotCrops: cropFiles.map((f, i) => ({ index: i + 1, file: f.file, window: f.window, scale: f.scale })),
      hottestCells: hotCells,
      perOwnerHotspots: perOwner,
      scattered,
    },
    null,
    2
  )
);

// ---------- console summary -------------------------------------------------
console.log(`overall mismatch: ${fmt(overallPct)}%  (${mismatchPixels}/${totalPixels} px)`);
console.log(`report: ${opt.report}`);
console.log('region %: ' + regions.map((r) => `${r.name}=${fmt(r.pct, 1)}%`).join('  '));
console.log(
  'top hotspots: ' +
    (hotWithMeta.slice(0, 5).map((c) => `(${c.x0},${c.y0})-(${c.x1},${c.y1}) ${fmt(pct(c.bad, c.w * c.h), 1)}% [${c.owner}]`).join(' | ') || 'none')
);
if (interaction) {
  const items = interaction.checks || interaction.results || [];
  const fail = items.filter((i) => !i.pass).length;
  console.log(`interaction: ${items.length - fail} pass / ${fail} fail`);
}
