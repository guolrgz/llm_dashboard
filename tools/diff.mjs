#!/usr/bin/env node
/**
 * diff.mjs — pixel-diff QA report for the dashboard restoration.
 *
 * Usage (from anywhere):
 *   node tools/diff.mjs [--base=index.png] [--current=tools/out/current.png]
 *                       [--report=docs/qa-report.md] [--image=docs/diff.png]
 *                       [--threshold=24] [--top=10]
 *
 * Outputs:
 *   docs/qa-report.md          region/grid/hotspot breakdown + suggested checks
 *   docs/diff.png              baseline | current side-by-side (50%)
 *   docs/diff-heatmap.png      baseline with mismatch pixels highlighted red
 *   docs/crops/hotspot-N.png   per-hotspot baseline | current close-ups (2x)
 *   tools/out/diff-stats.json  machine-readable stats
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';

const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = {
  base: 'index.png',
  current: 'tools/out/current.png',
  report: 'docs/qa-report.md',
  image: 'docs/diff.png',
  heatmap: 'docs/diff-heatmap.png',
  crops: 'docs/crops',
  stats: 'tools/out/diff-stats.json',
  threshold: 24,
  top: 10,
};
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)(?:=(.*))?$/);
  if (!m) continue;
  const k = m[1];
  const v = m[2];
  if (k in opt) opt[k] = typeof opt[k] === 'number' ? parseInt(v, 10) : v;
}
const P = (p) => path.resolve(PROJECT, p);
const BASE = P(opt.base);
const CUR = P(opt.current);
if (!fs.existsSync(CUR)) {
  console.error(`diff.mjs: current screenshot not found: ${CUR}\nRun: node tools/shot.mjs`);
  process.exit(2);
}
const base = PNG.sync.read(fs.readFileSync(BASE));
const cur = PNG.sync.read(fs.readFileSync(CUR));
const BW = base.width, BH = base.height;
const CW = cur.width, CH = cur.height;
const W = Math.min(BW, CW), H = Math.min(BH, CH);

// ---- helpers ---------------------------------------------------------------
const at = (img, x, y) => (y * img.width + x) * 4;
function rgb(img, x, y) {
  const i = at(img, x, y);
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
const hex = (c) =>
  '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const pct = (n, d) => (d ? (100 * n) / d : 0);
const fmt = (n, dp = 2) => Number(n).toFixed(dp);

// per-pixel diff (max channel delta; alpha ignored)
const delta = new Uint8Array(W * H);
const mask = new Uint8Array(W * H); // 1 = mismatch
let mismatchPixels = 0;
let sumAbs = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = at(base, x, y);
    const j = at(cur, x, y);
    const d0 = Math.abs(base.data[i] - cur.data[j]);
    const d1 = Math.abs(base.data[i + 1] - cur.data[j + 1]);
    const d2 = Math.abs(base.data[i + 2] - cur.data[j + 2]);
    const m = Math.max(d0, d1, d2);
    delta[y * W + x] = m;
    sumAbs += d0 + d1 + d2;
    if (m > opt.threshold) {
      mask[y * W + x] = 1;
      mismatchPixels++;
    }
  }
}
const totalPixels = BW * BH;
// pixels that exist in the baseline but outside the current screenshot
const missingPixels = Math.max(0, totalPixels - W * H);
mismatchPixels += missingPixels;
const meanAbs = sumAbs / (W * H * 3);

// ---- named regions (baseline geometry of the 1672x941 design) -------------
// boxes auto-measured from index.png (see tools/measure-ref*.mjs)
const REGIONS = [
  { name: 'Sidebar', x: 0, y: 0, w: 260, h: BH },
  { name: 'Topbar', x: 260, y: 0, w: BW - 260, h: 68 },
  { name: 'Page header (title + date filter)', x: 260, y: 68, w: BW - 260, h: 122 },
  { name: 'KPI row', x: 291, y: 190, w: 1360, h: 130 },
  { name: 'Chart row', x: 291, y: 338, w: 1360, h: 336 },
  { name: 'Table row', x: 291, y: 696, w: 1360, h: BW === 1672 ? BH - 696 : 211 },
];
const REFERENCE_LAYOUT = [
  ['Sidebar', 'x 0..260, y 0..941', 'bg #19223a'],
  ['Topbar', 'x 260..1672, y 0..68 (68px tall)', 'bg #ffffff'],
  ['Content gutter', 'cards start x=291, right edge x=1651 (content width 1360)', 'page bg ~#f2f4f9'],
  ['KPI row', 'y 190..319 (130px tall); 3 equal cards w≈443/444/446, gaps ≈15px', 'card bg #fefefe'],
  ['Chart row', 'y 338..673 (336px tall); line-chart card x 291..1128 (w 838), donut card x 1139..1651 (w 513), gap ≈10px', 'card bg #fefefe'],
  ['Table row', 'y 696..906 (211px tall); table card x 291..1006 (w 716), overview card x 1020..1651 (w 632), gap ≈13px', 'card bg #fefefe'],
  ['Bottom padding', 'content ends y=906, 35px below', ''],
];

function regionStats(r) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
  const area = Math.max(1, (r.x + r.w - x0) * (r.y + r.h - y0));
  let bad = 0, sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const k = y * W + x;
      if (mask[k]) bad++;
      sum += delta[k];
      n++;
    }
  }
  const missing = Math.max(0, r.w * r.h - (x1 - x0) * (y1 - y0));
  return {
    ...r,
    bad: bad + missing,
    pct: pct(bad + missing, area),
    meanDelta: n ? sum / n : 255,
    area,
  };
}
const regions = REGIONS.map(regionStats);

// ---- 16 x 8 grid breakdown -------------------------------------------------
const GX = 16, GY = 8;
const gridCells = [];
for (let gy = 0; gy < GY; gy++) {
  const row = [];
  for (let gx = 0; gx < GX; gx++) {
    const x0 = Math.floor((gx * BW) / GX), x1 = Math.floor(((gx + 1) * BW) / GX);
    const y0 = Math.floor((gy * BH) / GY), y1 = Math.floor(((gy + 1) * BH) / GY);
    let bad = 0, n = 0;
    for (let y = y0; y < Math.min(y1, H); y++) {
      for (let x = x0; x < Math.min(x1, W); x++) {
        if (mask[y * W + x]) bad++;
        n++;
      }
    }
    const area = (x1 - x0) * (y1 - y0);
    const missing = Math.max(0, area - n);
    const cell = { gx, gy, x0, y0, x1, y1, bad: bad + missing, pct: pct(bad + missing, area) };
    row.push(cell);
    gridCells.push(cell);
  }
}

// ---- connected-component hotspot detection (16px blocks) -------------------
const BS = 16;
const BWb = Math.ceil(BW / BS), BHb = Math.ceil(BH / BS);
const blocks = new Uint8Array(BWb * BHb);
const blockBad = new Uint32Array(BWb * BHb);
const blockArea = new Uint32Array(BWb * BHb);
for (let by = 0; by < BHb; by++) {
  for (let bx = 0; bx < BWb; bx++) {
    let bad = 0, n = 0;
    const x0 = bx * BS, y0 = by * BS;
    for (let y = y0; y < Math.min(y0 + BS, H); y++) {
      for (let x = x0; x < Math.min(x0 + BS, W); x++) {
        if (mask[y * W + x]) bad++;
        n++;
      }
    }
    const area = BS * BS;
    const missing = Math.max(0, area - n);
    blockArea[by * BWb + bx] = area;
    blockBad[by * BWb + bx] = bad + missing;
    if (bad + missing >= 6 && (bad + missing) / area >= 0.08) blocks[by * BWb + bx] = 1;
  }
}
const seen = new Uint8Array(BWb * BHb);
const components = [];
for (let by = 0; by < BHb; by++) {
  for (let bx = 0; bx < BWb; bx++) {
    const idx = by * BWb + bx;
    if (!blocks[idx] || seen[idx]) continue;
    // BFS, 8-connectivity
    const queue = [[bx, by]];
    seen[idx] = 1;
    const blocksIn = [];
    let minx = bx, maxx = bx, miny = by, maxy = by, bad = 0;
    while (queue.length) {
      const [cx, cy] = queue.pop();
      const ii = cy * BWb + cx;
      blocksIn.push(ii);
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
          if (blocks[ni] && !seen[ni]) {
            seen[ni] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
    const bbox = {
      x0: minx * BS,
      y0: miny * BS,
      x1: Math.min(BW, (maxx + 1) * BS),
      y1: Math.min(BH, (maxy + 1) * BS),
    };
    components.push({ ...bbox, w: bbox.x1 - bbox.x0, h: bbox.y1 - bbox.y0, bad, density: bad / Math.max(1, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0)) });
  }
}

// mean colours + best integer shift per component
function componentDetail(c) {
  const step = c.w * c.h > 40000 ? 2 : 1;
  let sumB = [0, 0, 0], sumC = [0, 0, 0], n = 0, bad = 0;
  for (let y = c.y0; y < c.y1; y += step) {
    for (let x = c.x0; x < c.x1; x += step) {
      const k = y * W + x;
      const b = rgb(base, x, y), cc = rgb(cur, x, y);
      sumB[0] += b[0]; sumB[1] += b[1]; sumB[2] += b[2];
      sumC[0] += cc[0]; sumC[1] += cc[1]; sumC[2] += cc[2];
      if (mask[k]) bad++;
      n++;
    }
  }
  const meanB = sumB.map((v) => v / n);
  const meanC = sumC.map((v) => v / n);
  // best shift within +-7 px (content displacement estimate)
  let best = { dx: 0, dy: 0, err: Infinity };
  let zeroErr = Infinity;
  const R = 7;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let err = 0, m = 0;
      for (let y = c.y0; y < c.y1; y += step * 2) {
        for (let x = c.x0; x < c.x1; x += step * 2) {
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
    shift: best.err <= zeroErr * 0.97 ? best : { dx: 0, dy: 0, err: zeroErr, insignificant: true },
    zeroErr,
    sampled: n,
    badSampled: bad,
  };
}
// drop huge low-density "scattered noise" components; report them separately
const scattered = components.filter((c) => c.w * c.h > BW * BH * 0.25 && c.density < 0.06);
const hot = components
  .filter((c) => !scattered.includes(c))
  .sort((a, b) => b.bad - a.bad)
  .slice(0, opt.top)
  .map(componentDetail);

// hottest 64px cells (fine-grained, independent of clustering)
const CS = 64;
const cells = [];
for (let y0 = 0; y0 < BH; y0 += CS) {
  for (let x0 = 0; x0 < BW; x0 += CS) {
    const x1 = Math.min(BW, x0 + CS), y1 = Math.min(BH, y0 + CS);
    let bad = 0, n = 0;
    for (let y = y0; y < Math.min(y1, H); y++) {
      for (let x = x0; x < Math.min(x1, W); x++) { if (mask[y * W + x]) bad++; n++; }
    }
    const area = (x1 - x0) * (y1 - y0);
    const missing = Math.max(0, area - n);
    cells.push({ x0, y0, x1, y1, bad: bad + missing, area, pct: pct(bad + missing, area), meanBase: rgb(base, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)), meanCur: rgb(cur, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)) });
  }
}
const hotCells = cells.sort((a, b) => b.bad - a.bad).slice(0, 12);

// ---- images ---------------------------------------------------------------
const outDir = path.dirname(P(opt.image));
fs.mkdirSync(outDir, { recursive: true });

// 50% box-downscale into a target buffer
function downscale(img, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const sx = img.width / dw, sy = img.height / dh;
  for (let y = 0; y < dh; y++) {
    const ys = Math.floor(y * sy), ye = Math.min(img.height, Math.ceil((y + 1) * sy));
    for (let x = 0; x < dw; x++) {
      const xs = Math.floor(x * sx), xe = Math.min(img.width, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = ys; yy < ye; yy++) {
        for (let xx = xs; xx < xe; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}
function writePng(file, w, h, data) {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data);
  fs.writeFileSync(file, PNG.sync.write(png));
}

// side by side, each half 50%
{
  const halfW = Math.floor(BW / 2), halfH = Math.floor(BH / 2);
  const comp = new Uint8ClampedArray(BW * BH * 4);
  const left = downscale(base, halfW, halfH);
  const right = downscale(cur, halfW, halfH);
  const put = (src, sw, sh, ox, oy) => {
    for (let y = 0; y < sh && oy + y < BH; y++) {
      for (let x = 0; x < sw && ox + x < BW; x++) {
        const si = (y * sw + x) * 4, di = ((oy + y) * BW + ox + x) * 4;
        comp[di] = src[si]; comp[di + 1] = src[si + 1]; comp[di + 2] = src[si + 2]; comp[di + 3] = 255;
      }
    }
  };
  // background
  for (let i = 0; i < comp.length; i += 4) { comp[i] = 20; comp[i + 1] = 20; comp[i + 2] = 24; comp[i + 3] = 255; }
  put(left, halfW, halfH, 0, Math.floor((BH - halfH) / 2));
  put(right, halfW, halfH, BW - halfW, Math.floor((BH - halfH) / 2));
  // centre divider
  for (let y = 0; y < BH; y++) {
    const di = (y * BW + Math.floor(BW / 2)) * 4;
    comp[di] = 255; comp[di + 1] = 80; comp[di + 2] = 80; comp[di + 3] = 255;
  }
  writePng(P(opt.image), BW, BH, comp);
}

// heatmap: desaturated baseline + red overlay on mismatching pixels
{
  const out = new Uint8ClampedArray(BW * BH * 4);
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const o = (y * BW + x) * 4;
      const inCur = x < CW && y < CH;
      const b = inCur ? rgb(base, x, y) : [0, 0, 0];
      const g = b[0] * 0.299 + b[1] * 0.587 + b[2] * 0.114;
      const gray = g * 0.55 + 60;
      let r = gray, gg = gray, bb = gray;
      if (!inCur) { r = 90; gg = 0; bb = 0; }
      else {
        const k = y * W + x;
        if (mask[k]) {
          const a = Math.min(1, delta[k] / 96);
          r = 255;
          gg = gray * (1 - a) + 60 * a;
          bb = gray * (1 - a) + 40 * a;
        }
      }
      out[o] = r; out[o + 1] = gg; out[o + 2] = bb; out[o + 3] = 255;
    }
  }
  writePng(P(opt.heatmap), BW, BH, out);
}

// hotspot crops: baseline | current, 2x nearest
fs.mkdirSync(P(opt.crops), { recursive: true });
const cropFiles = [];
hot.forEach((c, i) => {
  const pad = 8;
  const x0 = Math.max(0, c.x0 - pad), y0 = Math.max(0, c.y0 - pad);
  const x1 = Math.min(BW, c.x1 + pad), y1 = Math.min(BH, c.y1 + pad);
  const cw = x1 - x0, ch = y1 - y0;
  const scale = 2;
  const ow = cw * scale * 2 + 4, oh = ch * scale;
  const data = new Uint8ClampedArray(ow * oh * 4);
  for (let i2 = 0; i2 < data.length; i2 += 4) { data[i2] = 30; data[i2 + 1] = 30; data[i2 + 2] = 34; data[i2 + 3] = 255; }
  const putCrop = (img, ox) => {
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sx = x0 + x, sy = y0 + y;
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
  putCrop(cur, cw * scale + 4);
  const file = path.join(P(opt.crops), `hotspot-${i + 1}.png`);
  writePng(file, ow, oh, data);
  cropFiles.push(path.relative(PROJECT, file));
});

// ---- report ----------------------------------------------------------------
const nearestRegion = (c) => {
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  let best = null;
  for (const r of regions) {
    if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return r.name;
  }
  let bd = Infinity;
  for (const r of regions) {
    const d = Math.hypot(cx - (r.x + r.w / 2), cy - (r.y + r.h / 2));
    if (d < bd) { bd = d; best = r.name; }
  }
  return best;
};
const regionAdvice = {
  Sidebar: 'check sidebar width (260px), background/gradient color (target #19223a), logo block, nav item spacing/active state.',
  Topbar: 'check topbar height (68px), white background, hamburger position, bell badge, avatar/name alignment.',
  'Page header (title + date filter)': 'check "Dashboard" title size/weight/position, subtitle copy, segmented date control width/colors, calendar button.',
  'KPI row': 'check 3-card grid (gap ~15px, radius ~12px), icon circle colors, label/number/sparkline sizes, +/- percentage color.',
  'Chart row': 'check chart-card/donut-card split, chart plot area padding, gridline/axis label colors, legend dots, tooltip box, donut size/segments/legend.',
  'Table row': 'check table card vs system-overview widths, header background, row heights, badge colors, 4 stat tiles layout/colors.',
};
let meta = {};
try { meta = JSON.parse(fs.readFileSync(path.join(HERE, 'out', 'current-meta.json'), 'utf8')); } catch { /* optional */ }

const overallPct = pct(mismatchPixels, totalPixels);
const lines = [];
lines.push('# Visual QA report — dashboard restoration');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}  `);
lines.push(`Baseline: \`${opt.base}\` (${BW}×${BH})  `);
lines.push(`Current: \`${opt.current}\` (${CW}×${CH})  `);
lines.push(`Pixel threshold: max channel Δ > ${opt.threshold}  `);
lines.push('');
const verdict =
  overallPct <= 0.5 ? '🟢 PASS (≤0.5%)'
  : overallPct <= 2 ? '🟡 CLOSE (≤2%)'
  : overallPct <= 6 ? '🟠 NEEDS WORK (≤6%)'
  : '🔴 FAR OFF (>6%)';
lines.push(`## Overall: ${fmt(overallPct)}% pixels differ — ${verdict}`);
lines.push('');
lines.push('| metric | value |');
lines.push('|---|---|');
lines.push(`| mismatching pixels | ${mismatchPixels.toLocaleString()} / ${totalPixels.toLocaleString()} |`);
lines.push(`| mismatch % | ${fmt(overallPct)}% |`);
lines.push(`| mean abs channel diff | ${fmt(meanAbs)} / 255 |`);
lines.push(`| screenshot size match | ${CW === BW && CH === BH ? 'yes' : `NO (current ${CW}×${CH})`} |`);
lines.push('');
if (meta.overflow) lines.push('> ⚠️ Page overflows the 1672×941 viewport (document is larger); the screenshot was clipped to the viewport for comparison. Fix overflow first.\n');
if (meta.consoleErrors?.length || meta.pageErrors?.length || meta.failedRequests?.length) {
  lines.push('### Page/console errors');
  for (const e of meta.pageErrors || []) lines.push(`- pageerror: \`${e.slice(0, 300)}\``);
  for (const e of meta.consoleErrors || []) lines.push(`- console.error: \`${e.slice(0, 300)}\``);
  for (const e of meta.failedRequests || []) lines.push(`- requestfailed: \`${e.slice(0, 300)}\``);
  if (meta.fontFamilies) lines.push(`- body font-family: \`${meta.fontFamilies}\``);
  if (meta.bodyBg) lines.push(`- body background: \`${meta.bodyBg}\``);
  lines.push('');
}

// region table
lines.push('## Region breakdown');
lines.push('');
lines.push('| region | bbox (x,y,w,h) | mismatch % | mean Δ | status |');
lines.push('|---|---|---|---|---|');
for (const r of regions) {
  const st = r.pct <= 0.5 ? '🟢' : r.pct <= 2 ? '🟡' : r.pct <= 8 ? '🟠' : '🔴';
  lines.push(`| ${r.name} | ${r.x},${r.y},${r.w},${r.h} | ${fmt(r.pct)}% | ${fmt(r.meanDelta, 1)} | ${st} |`);
}
lines.push('');
lines.push('Suggested check per region:');
for (const r of regions) lines.push(`- **${r.name}**: ${regionAdvice[r.name] || 'inspect this area.'}`);
lines.push('');
lines.push('### Reference layout (auto-measured from `index.png`)');
lines.push('');
lines.push('| block | expected geometry | expected fill |');
lines.push('|---|---|---|');
for (const [a, b, c] of REFERENCE_LAYOUT) lines.push(`| ${a} | ${b} | ${c} |`);
lines.push('');

// grid heat table
lines.push(`## Grid breakdown (${GX}×${GY} cells, % pixels differing)`);
lines.push('');
lines.push('| row \\ col | ' + Array.from({ length: GX }, (_, i) => i + 1).join(' | ') + ' |');
lines.push('|---|' + '---|'.repeat(GX));
for (let gy = 0; gy < GY; gy++) {
  const row = gridCells.filter((c) => c.gy === gy);
  lines.push(`| ${gy + 1} (y${row[0].y0}-${row[0].y1}) | ` + row.map((c) => fmt(c.pct, 1)).join(' | ') + ' |');
}
lines.push('');

// hotspots
lines.push('## Top mismatching regions');
lines.push('');
if (!hot.length) {
  lines.push('No region exceeds the mismatch threshold. 🎉');
} else {
  lines.push('| # | bbox (x0,y0)-(x1,y1) | size | mismatch px | mean baseline | mean current | est. content shift | nearest region |');
  lines.push('|---|---|---|---|---|---|---|---|');
  hot.forEach((c, i) => {
    const shiftTxt =
      c.shift.dx === 0 && c.shift.dy === 0
        ? (c.shift.insignificant ? 'no match (content differs)' : 'none')
        : `(${c.shift.dx > 0 ? '+' : ''}${c.shift.dx},${c.shift.dy > 0 ? '+' : ''}${c.shift.dy}) px`;
    lines.push(
      `| ${i + 1} | (${c.x0},${c.y0})-(${c.x1},${c.y1}) | ${c.w}×${c.h} | ${c.bad.toLocaleString()} (${fmt(pct(c.bad, c.w * c.h), 1)}%) | ${hex(c.meanBase)} | ${hex(c.meanCur)} | ${shiftTxt} | ${nearestRegion(c)} |`
    );
  });
  lines.push('');
  lines.push('> "est. content shift" = the integer (dx,dy) that best re-aligns current content onto the baseline; positive dx means current content sits N px to the right of the target.');
  lines.push('');
  lines.push('Close-ups (baseline | current, 2×):');
  cropFiles.forEach((f, i) => lines.push(`- hotspot ${i + 1}: \`${f}\``));
  lines.push('');
}
if (scattered.length) {
  lines.push('### Scattered differences (low-density, wide area)');
  lines.push('');
  for (const c of scattered)
    lines.push(`- (${c.x0},${c.y0})-(${c.x1},${c.y1}) ${c.w}×${c.h}, ${c.bad.toLocaleString()} px, density ${fmt(c.density * 100, 1)}% — likely global page-background / font-rendering / shadow differences rather than a single misplaced element.`);
  lines.push('');
}
if (hotCells.length) {
  lines.push('### Hottest 64×64 cells');
  lines.push('');
  lines.push('| # | bbox (x0,y0)-(x1,y1) | mismatch % | baseline px | current px |');
  lines.push('|---|---|---|---|---|');
  hotCells.forEach((c, i) =>
    lines.push(`| ${i + 1} | (${c.x0},${c.y0})-(${c.x1},${c.y1}) | ${fmt(c.pct, 1)}% | ${hex(c.meanBase)} | ${hex(c.meanCur)} |`)
  );
  lines.push('');
}

// fix checklist
lines.push('## Suggested fix order');
lines.push('');
const ordered = regions.filter((r) => r.pct > 0.5).sort((a, b) => b.pct * b.area - a.pct * a.area);
if (!ordered.length) lines.push('Everything is within tolerance — only sub-0.5% anti-aliasing noise remains.');
ordered.forEach((r, i) => lines.push(`${i + 1}. **${r.name}** (${fmt(r.pct)}% differing) — ${regionAdvice[r.name] || 'inspect.'}`));
lines.push('');
lines.push('## Artifacts');
lines.push('');
lines.push(`- side-by-side: \`${opt.image}\` (baseline left, current right, 50% scale)`);
lines.push(`- heatmap: \`${opt.heatmap}\` (baseline grayscale, mismatches in red)`);
lines.push(`- stats: \`${opt.stats}\``);
lines.push('');

fs.mkdirSync(path.dirname(P(opt.report)), { recursive: true });
fs.writeFileSync(P(opt.report), lines.join('\n'));
fs.mkdirSync(path.dirname(P(opt.stats)), { recursive: true });
fs.writeFileSync(
  P(opt.stats),
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      base: { file: opt.base, width: BW, height: BH },
      current: { file: opt.current, width: CW, height: CH },
      threshold: opt.threshold,
      mismatchPixels,
      totalPixels,
      mismatchPct: overallPct,
      meanAbsChannelDiff: meanAbs,
      regions: regions.map((r) => ({ name: r.name, bbox: [r.x, r.y, r.w, r.h], pct: r.pct, meanDelta: r.meanDelta, bad: r.bad })),
      grid: gridCells,
      hotspots: hot,
    },
    null,
    2
  )
);

console.log(`overall mismatch: ${fmt(overallPct)}%  (${mismatchPixels}/${totalPixels} px)`);
console.log(`report: ${opt.report}`);
console.log(`region %: ` + regions.map((r) => `${r.name}=${fmt(r.pct, 1)}%`).join('  '));
console.log(`top hotspots: ` + (hot.slice(0, 5).map((c) => `(${c.x0},${c.y0})-(${c.x1},${c.y1}) ${fmt(pct(c.bad, c.w * c.h), 1)}%`).join(' | ') || 'none'));
