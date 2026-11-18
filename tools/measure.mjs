#!/usr/bin/env node
/**
 * measure.mjs — extract reference geometry/colors from index.png (and optionally
 * the current screenshot) so QA findings can cite exact expected numbers.
 *
 * Usage:
 *   node tools/measure.mjs [--image=../index.png] [--out=tools/out/measure.json]
 *
 * Prints:
 *  - text/colored component boxes for the main blocks (brand, nav, header, KPI
 *    cards, chart card, donut card, table card, overview card)
 *  - line-chart calibration: plot box, gridlines, axis labels, series values
 *    per hour extracted from the blue/green pixels
 *  - donut geometry: centre, outer/inner radius, segment angles and colours
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';

const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
let imageArg = 'index.png';
let outArg = 'tools/out/measure.json';
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)=(.*)$/);
  if (!m) continue;
  if (m[1] === 'image') imageArg = m[2];
  if (m[1] === 'out') outArg = m[2];
}
const img = PNG.sync.read(fs.readFileSync(path.resolve(PROJECT, imageArg)));
const { width: W, height: H, data } = img;
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
const chroma = (c) => Math.max(...c) - Math.min(...c);

// ---- generic component extraction over a rect ------------------------------
function components(rect, pred, minArea = 10, gap = 25) {
  const { x0, y0, x1, y1 } = rect;
  const w = x1 - x0, h = y1 - y0;
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (seen[idx]) continue;
      const c = px(x0 + x, y0 + y);
      if (!pred(c, x0 + x, y0 + y)) continue;
      // BFS component
      const stack = [[x, y]];
      seen[idx] = 1;
      let minx = x, maxx = x, miny = y, maxy = y, n = 0, sr = 0, sg = 0, sb = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const cc = px(x0 + cx, y0 + cy);
        n++; sr += cc[0]; sg += cc[1]; sb += cc[2];
        if (cx < minx) minx = cx;
        if (cx > maxx) maxx = cx;
        if (cy < miny) miny = cy;
        if (cy > maxy) maxy = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (seen[ni]) continue;
            if (!pred(px(x0 + nx, y0 + ny), x0 + nx, y0 + ny)) continue;
            seen[ni] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (n >= minArea) out.push({ x0: x0 + minx, y0: y0 + miny, x1: x0 + maxx + 1, y1: y0 + maxy + 1, w: maxx - minx + 1, h: maxy - miny + 1, area: n, mean: [sr / n, sg / n, sb / n] });
    }
  }
  // merge components whose boxes overlap/nearly touch horizontally on same line
  const merged = [];
  out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const c of out) {
    let target = merged.find(
      (m) => !(m.x1 + gap < c.x0 || c.x1 + gap < m.x0 || m.y1 + 3 < c.y0 || c.y1 + 3 < m.y0)
    );
    if (target) {
      target.x0 = Math.min(target.x0, c.x0);
      target.y0 = Math.min(target.y0, c.y0);
      target.x1 = Math.max(target.x1, c.x1);
      target.y1 = Math.max(target.y1, c.y1);
      target.w = target.x1 - target.x0;
      target.h = target.y1 - target.y0;
      target.area += c.area;
      target.mean = [0, 1, 2].map((i) => (target.mean[i] + c.mean[i]) / 2);
      target.parts = (target.parts || 1) + 1;
    } else merged.push({ ...c, parts: 1 });
  }
  return merged.map((m) => ({ x: m.x0, y: m.y0, w: m.w, h: m.h, area: m.area, color: hex(m.mean) }));
}

// ---- dark text components --------------------------------------------------
const darkText = (c) => lum(c) < 150 && chroma(c) < 60;
const lightText = (c) => lum(c) > 140;
const colored = (c) => chroma(c) > 45 && lum(c) < 240;

const blocks = {
  brand: { x0: 0, y0: 0, x1: 260, y1: 105 },
  nav_active: { x0: 0, y0: 105, x1: 260, y1: 165 },
  nav_users: { x0: 0, y0: 165, x1: 260, y1: 220 },
  header: { x0: 262, y0: 68, x1: 1672, y1: 190 },
  kpi1: { x0: 291, y0: 190, x1: 733, y1: 319 },
  kpi2: { x0: 748, y0: 190, x1: 1191, y1: 319 },
  kpi3: { x0: 1206, y0: 190, x1: 1651, y1: 319 },
  chart_card: { x0: 291, y0: 338, x1: 1128, y1: 673 },
  donut_card: { x0: 1139, y0: 338, x1: 1651, y1: 673 },
  table_card: { x0: 291, y0: 696, x1: 1006, y1: 906 },
  overview_card: { x0: 1020, y0: 696, x1: 1651, y1: 906 },
};

const report = { image: imageArg, size: [W, H], blocks: {} };
for (const [name, rect] of Object.entries(blocks)) {
  const r = { rect, text: components(rect, darkText, 25), colored: components(rect, colored, 60) };
  report.blocks[name] = r;
  console.log(`\n== ${name} [${rect.x0},${rect.y0} ${rect.x1 - rect.x0}x${rect.y1 - rect.y0}]`);
  console.log('  text:', r.text.map((c) => `(${c.x},${c.y} ${c.w}x${c.h} ${c.color}${c.area > 999 ? ' a=' + c.area : ''})`).join(' '));
  console.log('  colored:', r.colored.map((c) => `(${c.x},${c.y} ${c.w}x${c.h} ${c.color})`).join(' '));
}

// sidebar light text (nav)
console.log('\n== sidebar light text');
for (const [name, rect] of Object.entries({ brand: blocks.brand, nav_active: blocks.nav_active, nav_users: blocks.nav_users })) {
  const comps = components(rect, lightText, 20).filter((c) => !(c.x < 120 && c.h > 30));
  console.log(name, comps.map((c) => `(${c.x},${c.y} ${c.w}x${c.h} ${c.color})`).join(' '));
}

// ---- chart calibration & series extraction ---------------------------------
function findPlot() {
  // gridlines: rows/cols inside chart card with many light-gray pixels (#e8ecf3-ish)
  const isGrid = (c) => Math.abs(c[0] - c[1]) < 12 && c[0] >= 225 && c[0] <= 245;
  const rows = [], cols = [];
  for (let y = 380; y < 660; y++) {
    let n = 0;
    for (let x = 340; x < 1110; x++) if (isGrid(px(x, y))) n++;
    if (n > 500) rows.push(y);
  }
  for (let x = 300; x < 1128; x++) {
    let n = 0;
    for (let y = 390; y < 650; y++) if (isGrid(px(x, y))) n++;
    if (n > 150) cols.push(x);
  }
  const group = (arr) => {
    const g = [];
    for (const v of arr) {
      const last = g[g.length - 1];
      if (last && v - last[last.length - 1] <= 2) last.push(v);
      else g.push([v]);
    }
    return g.map((a) => Math.round(a.reduce((s, v) => s + v, 0) / a.length));
  };
  return { gridRows: group(rows), gridCols: group(cols) };
}
const plot = findPlot();
console.log('\n== chart gridlines');
console.log('rows:', plot.gridRows.join(','), ' cols:', plot.gridCols.join(','));

// axis value calibration: axis labels are dark text left of plot; find them
const axisLabels = components({ x0: 291, y0: 380, x1: 360, y1: 660 }, darkText, 10);
console.log('y-axis labels:', axisLabels.map((c) => `y=${c.y}..${c.y + c.h} "${c.w}x${c.h}"`).join(' '));

// series extraction: blue + green line pixels inside plot
const isBlue = (c) => c[2] > 150 && c[2] - c[0] > 60 && c[1] < 190;
const isGreen = (c) => c[1] > 120 && c[1] - c[0] > 40 && c[1] - c[2] > 20;
const plotX0 = plot.gridCols[0] ?? 430, plotX1 = plot.gridCols[plot.gridCols.length - 1] ?? 1095;
const plotY0 = plot.gridRows[0] ?? 395, plotY1 = plot.gridRows[plot.gridRows.length - 1] ?? 610;
function series(pred) {
  const ys = [];
  for (let x = plotX0; x <= plotX1; x++) {
    const vals = [];
    for (let y = plotY0 - 6; y <= plotY1 + 6; y++) if (pred(px(x, y))) vals.push(y);
    ys.push(vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null);
  }
  return ys;
}
const blue = series(isBlue), green = series(isGreen);
// calibrate: gridRows correspond to 100k,75k,50k,25k,0 from top to bottom
const rows = plot.gridRows;
const maxV = 100000, minV = 0;
let calib = null;
if (rows.length >= 2) {
  const top = rows[0], bottom = rows[rows.length - 1];
  const step = (maxV - minV) / (rows.length - 1);
  calib = { top, bottom, step, valueAt: (y) => maxV - ((y - top) / (bottom - top)) * (maxV - minV) };
  console.log('calibration', { top, bottom, step });
}
const hours = [];
if (calib) {
  for (let h = 0; h <= 24; h++) {
    const xi = Math.round(plotX0 + ((plotX1 - plotX0) * h) / 24);
    const yb = blue[Math.min(blue.length - 1, Math.max(0, xi - plotX0))];
    const yg = green[Math.min(green.length - 1, Math.max(0, xi - plotX0))];
    hours.push({
      h,
      x: xi,
      total: yb ? Math.round(calib.valueAt(yb) / 100) * 100 : null,
      success: yg ? Math.round(calib.valueAt(yg) / 100) * 100 : null,
    });
  }
  console.log('\n== series by hour (x, total, success)');
  for (const p of hours) console.log(`  ${String(p.h).padStart(2, '0')}:00 x=${p.x} total=${p.total} success=${p.success}`);
}
report.chart = { plot, axisLabels, calibration: calib && { top: calib.top, bottom: calib.bottom, step: calib.step }, seriesByHour: hours };

// ---- donut geometry --------------------------------------------------------
const donutRect = { x0: 1140, y0: 390, x1: 1420, y1: 660 };
// colored ring pixels
let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
const cols = [];
for (let y = donutRect.y0; y < donutRect.y1; y++) {
  for (let x = donutRect.x0; x < donutRect.x1; x++) {
    const c = px(x, y);
    if (chroma(c) > 40 && lum(c) < 235) {
      cols.push([x, y, c]);
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  }
}
const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
const outerR = (maxx - minx + maxy - miny) / 4;
// inner radius: largest white-ish run radius from centre
let innerR = 0;
for (let r = 0; r < outerR; r++) {
  const c = px(Math.round(cx + r), Math.round(cy));
  if (lum(c) > 245 && chroma(c) < 12) innerR = r;
  else break;
}
console.log('\n== donut', { bbox: [minx, miny, maxx, maxy], center: [cx, cy], outerR, innerR });
const ring = [];
const sampleR = (outerR + innerR) / 2;
for (let a = 0; a < 360; a += 1) {
  const rad = ((a - 90) * Math.PI) / 180;
  const x = Math.round(cx + sampleR * Math.cos(rad));
  const y = Math.round(cy + sampleR * Math.sin(rad));
  ring.push({ a, color: hex(px(x, y)), raw: px(x, y) });
}
// cluster into segments by color similarity
const segs = [];
for (const s of ring) {
  const last = segs[segs.length - 1];
  const close = last && Math.abs(last.raw[0] - s.raw[0]) + Math.abs(last.raw[1] - s.raw[1]) + Math.abs(last.raw[2] - s.raw[2]) < 40;
  if (close) { last.a1 = s.a; last.raw = s.raw; last.color = s.color; }
  else segs.push({ a0: s.a, a1: s.a, raw: s.raw, color: s.color });
}
// merge first/last segment (wraps around 0)
if (segs.length > 1) {
  const first = segs[0], last = segs[segs.length - 1];
  const d = Math.abs(first.raw[0] - last.raw[0]) + Math.abs(first.raw[1] - last.raw[1]) + Math.abs(first.raw[2] - last.raw[2]);
  if (d < 40) { last.a1 = first.a1 + 360; segs.pop(); }
}
console.log('segments (start angle -> end angle, % of circle):');
for (const s of segs) {
  const span = (s.a1 - s.a0 + 360) % 360 || 360;
  console.log(`  ${s.a0}..${s.a1 % 360}  ${((span / 360) * 100).toFixed(1)}%  ${s.color}`);
}
report.donut = { bbox: [minx, miny, maxx, maxy], center: [cx, cy], outerR, innerR, segments: segs.map((s) => ({ from: s.a0, to: s.a1 % 360, pct: ((s.a1 - s.a0 + 360) % 360 || 360) / 3.6, color: s.color })) };

fs.mkdirSync(path.dirname(path.resolve(PROJECT, outArg)), { recursive: true });
fs.writeFileSync(path.resolve(PROJECT, outArg), JSON.stringify(report, null, 1));
console.log('\nsaved', outArg);
