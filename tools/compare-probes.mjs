#!/usr/bin/env node
/**
 * compare-probes.mjs — targeted geometry/colour probes run on BOTH the baseline
 * reference and the current screenshot, printing a side-by-side delta table.
 *
 * Usage: node tools/compare-probes.mjs [--base=index.png] [--cur=tools/out/current.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';

const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const opt = { base: 'index.png', cur: 'tools/out/current.png' };
for (const a of argv) {
  const m = a.match(/^--([A-Za-z-]+)=(.*)$/);
  if (!m) continue;
  if (m[1] in opt) opt[m[1]] = m[2];
}
const load = (p) => PNG.sync.read(fs.readFileSync(path.resolve(PROJECT, p)));
const A = load(opt.base), B = load(opt.cur);

function makeProbe(img) {
  const { width: W, height: H, data } = img;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const chroma = (c) => Math.max(...c) - Math.min(...c);
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const preds = {
    dark: (c) => lum(c) < 170 && chroma(c) < 70,
    light: (c) => lum(c) > 150,
    blue: (c) => c[2] - c[0] > 55 && c[2] > 150,
    green: (c) => c[1] - c[0] > 25 && c[1] > 100 && c[1] > c[2] - 30,
    colored: (c) => chroma(c) > 40 && lum(c) < 245,
    tint: (c) => chroma(c) > 3 && chroma(c) < 40 && lum(c) > 225,
  };
  function bbox(rect, predName) {
    const pred = preds[predName];
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0;
    for (let y = rect[1]; y < rect[3]; y++) {
      for (let x = rect[0]; x < rect[2]; x++) {
        const c = px(x, y);
        if (pred(c)) {
          n++;
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (!n) return null;
    return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, n };
  }
  function mode(rect) {
    const m = new Map();
    for (let y = rect[1]; y < rect[3]; y += 2) {
      for (let x = rect[0]; x < rect[2]; x += 2) {
        const k = hex(px(x, y));
        m.set(k, (m.get(k) || 0) + 1);
      }
    }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return top.length ? top[0][0] : null;
  }
  // horizontal light rows: rows with > ratio share of near-uniform light pixels
  function gridRows(rect, isDarkish) {
    const rows = [];
    for (let y = rect[1]; y < rect[3]; y++) {
      let n = 0;
      for (let x = rect[0]; x < rect[2]; x++) if (isDarkish(px(x, y))) n++;
      if (n / (rect[2] - rect[0]) > 0.5) rows.push(y);
    }
    const g = [];
    for (const v of rows) { const l = g[g.length - 1]; if (l && v - l[l.length - 1] <= 2) l.push(v); else g.push([v]); }
    return g.map((a) => Math.round(a.reduce((s, v) => s + v, 0) / a.length));
  }
  const gridLine = (c) => chroma(c) < 14 && c[0] >= 222 && c[0] <= 246;
  return { px, lum, chroma, hex, preds, bbox, mode, gridRows, gridLine, W, H };
}
const a = makeProbe(A), b = makeProbe(B);

const probes = [
  // [name, rect, predicate]
  ['brand logo (colored)', [8, 8, 95, 95], 'colored'],
  ['brand title (light)', [90, 18, 240, 55], 'light'],
  ['brand sub (light)', [90, 50, 250, 88], 'light'],
  ['nav active bg (colored)', [0, 100, 260, 170], 'blue'],
  ['nav active icon (light)', [20, 112, 70, 158], 'light'],
  ['nav active text (light)', [60, 112, 220, 158], 'light'],
  ['nav users icon (light)', [20, 170, 70, 215], 'light'],
  ['nav users text (light)', [60, 170, 220, 215], 'light'],
  ['title "Dashboard"', [270, 88, 520, 142], 'dark'],
  ['subtitle', [270, 142, 720, 176], 'dark'],
  ['date pill "今日" blue bg', [1330, 82, 1455, 152], 'blue'],
  ['seg text 近7天', [1440, 92, 1512, 148], 'dark'],
  ['seg text 近30天', [1512, 92, 1605, 148], 'dark'],
  ['calendar icon', [1595, 90, 1665, 148], 'dark'],
  ['KPI1 icon circle', [298, 196, 392, 300], 'colored'],
  ['KPI1 label 总请求量', [385, 205, 545, 240], 'dark'],
  ['KPI1 number 128,960', [385, 240, 680, 292], 'dark'],
  ['KPI1 badge arrow', [385, 282, 545, 316], 'green'],
  ['KPI1 sparkline', [500, 196, 738, 319], 'blue'],
  ['KPI2 icon circle', [752, 196, 845, 300], 'colored'],
  ['KPI2 label Token 使用量', [840, 205, 1040, 240], 'dark'],
  ['KPI2 number 1.24B', [840, 240, 1100, 292], 'dark'],
  ['KPI2 badge', [840, 282, 1040, 316], 'green'],
  ['KPI2 sparkline', [990, 196, 1196, 319], 'green'],
  ['KPI3 icon circle', [1210, 196, 1305, 300], 'colored'],
  ['KPI3 label 成功率', [1295, 205, 1450, 240], 'dark'],
  ['KPI3 number 99.2%', [1295, 240, 1520, 292], 'dark'],
  ['KPI3 badge', [1295, 282, 1450, 316], 'green'],
  ['KPI3 sparkline', [1440, 196, 1656, 319], 'colored'],
  ['chart title 请求量趋势', [330, 348, 470, 396], 'dark'],
  ['chart legend text', [905, 352, 1125, 392], 'dark'],
  ['chart legend dots', [875, 352, 1005, 392], 'colored'],
  ['chart yaxis labels', [298, 400, 352, 628], 'dark'],
  ['chart xaxis labels', [340, 626, 1128, 662], 'dark'],
  ['chart tooltip text', [890, 410, 1080, 505], 'dark'],
  ['donut center number', [1220, 505, 1350, 548], 'dark'],
  ['donut center label', [1220, 545, 1350, 578], 'dark'],
  ['donut legend text', [1445, 450, 1660, 625], 'dark'],
  ['donut legend dots', [1420, 450, 1450, 625], 'colored'],
  ['table title 近期请求记录', [300, 700, 480, 742], 'dark'],
  ['table 查看更多 link', [870, 700, 1006, 746], 'blue'],
  ['table header row text', [305, 748, 1000, 782], 'dark'],
  ['table row1 text', [305, 782, 1000, 812], 'dark'],
  ['table row4 text', [305, 872, 1000, 900], 'dark'],
  ['table badges col', [905, 782, 975, 900], 'green'],
  ['overview title 系统概览', [1030, 700, 1220, 742], 'dark'],
  ['overview tile1', [1025, 755, 1185, 895], 'tint'],
  ['overview tile2', [1188, 755, 1330, 895], 'tint'],
  ['overview tile3', [1332, 755, 1475, 895], 'tint'],
  ['overview tile4', [1478, 755, 1620, 895], 'tint'],
  ['overview labels row', [1025, 805, 1620, 838], 'dark'],
  ['overview numbers row', [1025, 838, 1620, 876], 'dark'],
];

const fmtB = (r) => (r ? `${r.x},${r.y} ${r.w}x${r.h}` : '—');
console.log('probe'.padEnd(30), 'BASE (x,y wxh)'.padEnd(20), 'CURRENT (x,y wxh)'.padEnd(22), 'Δx,Δy Δw,Δh   baseColor  curColor');
for (const [name, rect, pred] of probes) {
  const ra = a.bbox(rect, pred), rb = b.bbox(rect, pred);
  const d = ra && rb ? `${rb.x - ra.x > 0 ? '+' : ''}${rb.x - ra.x},${rb.y - ra.y > 0 ? '+' : ''}${rb.y - ra.y}  ${rb.w - ra.w > 0 ? '+' : ''}${rb.w - ra.w},${rb.h - ra.h > 0 ? '+' : ''}${rb.h - ra.h}` : '';
  // sample colour at centre of intersection of both boxes
  let ca = '', cb = '';
  if (ra && rb) {
    const sx = Math.round((Math.max(ra.x, rb.x) + Math.min(ra.x + ra.w, rb.x + rb.w)) / 2);
    const sy = Math.round((Math.max(ra.y, rb.y) + Math.min(ra.y + ra.h, rb.y + rb.h)) / 2);
    ca = a.hex(a.px(sx, sy)); cb = b.hex(b.px(sx, sy));
  }
  console.log(name.padEnd(30), fmtB(ra).padEnd(20), fmtB(rb).padEnd(22), d.padEnd(16), ca.padEnd(10), cb);
}

// chart gridlines & plot box
const gridA = a.gridRows([300, 395, 1120, 660], a.gridLine);
const gridB = b.gridRows([300, 395, 1120, 660], b.gridLine);
console.log('\nchart horizontal gridline rows base:', gridA.join(','), ' cur:', gridB.join(','));
// vertical gridlines: columns with many gridline pixels
function vGrids(p) {
  const out = [];
  for (let x = 300; x < 1128; x++) {
    let n = 0;
    for (let y = 400; y < 650; y++) if (p.gridLine(p.px(x, y))) n++;
    if (n > 120) out.push(x);
  }
  const g = [];
  for (const v of out) { const l = g[g.length - 1]; if (l && v - l[l.length - 1] <= 2) l.push(v); else g.push([v]); }
  return g.map((arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length));
}
console.log('chart vertical gridline cols base:', vGrids(a).join(','), ' cur:', vGrids(b).join(','));
// donut radial profile
function donut(p) {
  const rect = [1140, 390, 1425, 665];
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (let y = rect[1]; y < rect[3]; y++) for (let x = rect[0]; x < rect[2]; x++) {
    const c = p.px(x, y);
    if (p.chroma(c) > 40 && p.lum(c) < 238) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, R = (maxx - minx + maxy - miny) / 4;
  // radial ring fraction: colored share over 72 angles at each radius
  const profile = [];
  for (let r = 10; r < R + 4; r += 2) {
    let hit = 0, tot = 0;
    for (let k = 0; k < 72; k++) {
      const rad = (k / 72) * Math.PI * 2;
      const x = Math.round(cx + r * Math.cos(rad)), y = Math.round(cy + r * Math.sin(rad));
      const c = p.px(x, y); tot++;
      if (p.chroma(c) > 40 && p.lum(c) < 238) hit++;
    }
    profile.push([r, Math.round((hit / tot) * 100)]);
  }
  const ring = profile.filter(([, f]) => f > 70).map(([r]) => r);
  const innerR = ring.length ? ring[0] : 0, outerR = ring.length ? ring[ring.length - 1] : R;
  return { bbox: [minx, miny, maxx, maxy], center: [cx, cy], outerR: +outerR.toFixed(1), innerR: +innerR.toFixed(1), thickness: +(outerR - innerR).toFixed(1), profile };
}
const dA = donut(a), dB = donut(b);
console.log('\ndonut base:', JSON.stringify({ bbox: dA.bbox, center: dA.center, outerR: dA.outerR, innerR: dA.innerR, thickness: dA.thickness }));
console.log('donut cur :', JSON.stringify({ bbox: dB.bbox, center: dB.center, outerR: dB.outerR, innerR: dB.innerR, thickness: dB.thickness }));
// donut segment colours at mid-ring
function segs(p, d) {
  const r = (d.outerR + d.innerR) / 2;
  const out = [];
  let prev = null;
  for (let ang = 0; ang < 360; ang += 0.5) {
    const rad = ((ang - 90) * Math.PI) / 180;
    const c = p.px(Math.round(d.center[0] + r * Math.cos(rad)), Math.round(d.center[1] + r * Math.sin(rad)));
    const h = p.hex(c);
    if (!prev || Math.abs(prev.c[0] - c[0]) + Math.abs(prev.c[1] - c[1]) + Math.abs(prev.c[2] - c[2]) > 40) {
      out.push({ ang, color: h, c });
    }
    prev = { c, h };
  }
  return out;
}
console.log('donut base segment boundaries:', JSON.stringify(segs(a, dA)));
console.log('donut cur  segment boundaries:', JSON.stringify(segs(b, dB)));
