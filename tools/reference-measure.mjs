#!/usr/bin/env node
/**
 * reference-measure.mjs — full dual-image measurement pass for the dashboard.
 *
 * Measures element geometry/ink boxes/colors on BOTH index.png (baseline) and
 * tools/out/current.png (current build), prints a comparable report and appends
 * a detailed section to docs/qa-report.md. Also writes tools/out/detail.json.
 *
 * Usage: node tools/reference-measure.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';

const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const A = PNG.sync.read(fs.readFileSync(path.join(PROJECT, 'index.png')));
const B = PNG.sync.read(fs.readFileSync(path.join(PROJECT, 'tools/out/current.png')));

function probe(img) {
  const { width: W, height: H, data } = img;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const chroma = (c) => Math.max(...c) - Math.min(...c);
  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const cb = (x, y) => { const c = px(x, y); return c; };
  const inRect = (x, y, r) => x >= r[0] && y >= r[1] && x < r[2] && y < r[3];
  function bbox(rect, pred) {
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0;
    for (let y = rect[1]; y < rect[3]; y++) {
      for (let x = rect[0]; x < rect[2]; x++) {
        if (pred(px(x, y), x, y)) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      }
    }
    return n ? { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, n } : null;
  }
  function components(rect, pred, minArea = 6, maxGap = 40) {
    const { x0, y0, x1, y1 } = { x0: rect[0], y0: rect[1], x1: rect[2], y1: rect[3] };
    const w = x1 - x0, h = y1 - y0;
    const seen = new Uint8Array(w * h);
    const raw = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (seen[idx] || !pred(px(x0 + x, y0 + y), x0 + x, y0 + y)) continue;
      const stack = [[x, y]]; seen[idx] = 1;
      let minx = x, maxx = x, miny = y, maxy = y, n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop(); n++;
        if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!seen[ni] && pred(px(x0 + nx, y0 + ny), x0 + nx, y0 + ny)) { seen[ni] = 1; stack.push([nx, ny]); }
        }
      }
      if (n >= minArea) raw.push({ x0: x0 + minx, y0: y0 + miny, x1: x0 + maxx + 1, y1: y0 + maxy + 1, n });
    }
    // group into text lines: same row band, x gap < maxGap
    raw.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const lines = [];
    for (const c of raw) {
      const l = lines.find((L) => c.y0 < L.y1 + 1 && c.y1 > L.y0 - 1 && c.x0 <= L.x1 + maxGap && c.x1 >= L.x0 - maxGap);
      if (l) { l.x0 = Math.min(l.x0, c.x0); l.y0 = Math.min(l.y0, c.y0); l.x1 = Math.max(l.x1, c.x1); l.y1 = Math.max(l.y1, c.y1); l.n += c.n; l.parts++; }
      else lines.push({ ...c, parts: 1 });
    }
    return lines.map((l) => ({ x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0, area: l.n }));
  }
  const ink = (c) => lum(c) < 190; // text ink on light backgrounds (white/tints)
  const inkStrong = (c) => lum(c) < 150;
  const sidebarInk = (c) => lum(c) > 135; // light text/icons on the dark navy sidebar
  const white = (c) => c[0] >= 252 && c[1] >= 252 && c[2] >= 252;
  const blue = (c) => c[2] - c[0] > 55 && c[2] > 150;
  const green = (c) => c[1] - c[0] > 30 && c[1] > 110 && c[1] - c[2] > -20;
  const colored = (c) => chroma(c) > 45 && lum(c) < 245;
  const tint = (c) => chroma(c) > 3 && chroma(c) < 40 && lum(c) > 228;
  const blueLine = (c) => c[2] > 200 && c[2] - c[0] > 95 && c[0] < 160;
  const greenLine = (c) => c[1] > 140 && c[1] - c[0] > 55 && c[1] - c[2] > 40 && c[0] < 130;
  const purpleLine = (c) => c[2] > 190 && c[2] - c[1] > 40 && c[0] > 90;
  function colorAt(x, y) { return hex(px(Math.round(x), Math.round(y))); }
  function inkRows(rect, pred) {
    // contiguous row bands containing at least one ink pixel
    const rows = [];
    for (let y = rect[1]; y < rect[3]; y++) {
      let n = 0;
      for (let x = rect[0]; x < rect[2]; x++) if (pred(px(x, y), x, y)) n++;
      rows.push([y, n]);
    }
    const bands = [];
    let cur = null;
    for (const [y, n] of rows) {
      if (n > 0) { if (!cur) cur = { y0: y, y1: y }; else cur.y1 = y; }
      else if (cur) { bands.push(cur); cur = null; }
    }
    if (cur) bands.push(cur);
    return bands;
  }
  return { W, H, px, lum, chroma, hex, bbox, components, ink, inkStrong, sidebarInk, white, blue, green, colored, tint, blueLine, greenLine, purpleLine, colorAt, inkRows };
}
const a = probe(A), b = probe(B);

const out = { generated: new Date().toISOString(), header: {}, sidebar: {}, kpi: [], chart: {}, donut: {}, table: {}, overview: {}, missing: [] };
const L = [];
const row = (label, base, cur, extra = '') => {
  const f = (v) => (v ? `${v.x},${v.y} ${v.w}x${v.h}` : '—');
  const d = (v1, v2) => (v1 && v2 ? `${v2.x - v1.x >= 0 ? '+' : ''}${v2.x - v1.x},${v2.y - v1.y >= 0 ? '' : ''}${v2.y - v1.y}` : '');
  L.push(`| ${label} | ${f(base)} | ${f(cur)} | ${d(base, cur)} | ${extra} |`);
  return { label, base, cur };
};

// =============================== 1. HEADER =================================
L.push('## 1. Header');
L.push('');
L.push('| element | baseline (x,y wxh) | current (x,y wxh) | Δx,Δy | note |');
L.push('|---|---|---|---|---|');
const h1a = a.bbox([285, 88, 700, 142], a.inkStrong);
const h1b = b.bbox([285, 88, 700, 142], b.inkStrong);
row('H1 "Dashboard" ink bbox', h1a, h1b, `baseline ink top y=${h1a?.y}, h=${h1a?.h}; current top y=${h1b?.y}, h=${h1b?.h}`);
const suba = a.bbox([285, 142, 760, 178], a.ink);
const subb = b.bbox([285, 142, 760, 178], b.ink);
row('subtitle ink bbox', suba, subb, `baseline first ink row y=${suba?.y}`);
// date controls: white boxes + blue pill, in region x 1330..1620 y 85..150
const pillA = a.bbox([1320, 85, 1580, 150], a.blue);
const pillB = b.bbox([1320, 85, 1580, 150], b.blue);
row('"今日" pill (blue box)', pillA, pillB, `base color ${pillA ? a.colorAt(pillA.x + 10, pillA.y + 20) : ''}`);
const segBoxA = a.bbox([1400, 85, 1600, 150], (c) => c[0] >= 249 && c[1] >= 249 && c[2] >= 249);
const segBoxB = b.bbox([1400, 85, 1600, 150], (c) => c[0] >= 249 && c[1] >= 249 && c[2] >= 249);
row('seg white container (right part)', segBoxA, segBoxB);
const t7a = a.bbox([1440, 95, 1512, 140], a.ink);
const t7b = b.bbox([1440, 95, 1512, 140], b.ink);
row('"近7天" text ink', t7a, t7b, `text x-range base ${t7a?.x}..${t7a && t7a.x + t7a.w - 1} / cur ${t7b?.x}..${t7b && t7b.x + t7b.w - 1}`);
const t30a = a.bbox([1512, 95, 1601, 140], a.ink);
const t30b = b.bbox([1512, 95, 1601, 140], b.ink);
row('"近30天" text ink', t30a, t30b, `text x-range base ${t30a?.x}..${t30a && t30a.x + t30a.w - 1} / cur ${t30b?.x}..${t30b && t30b.x + t30b.w - 1}`);
const calBoxA = a.bbox([1598, 85, 1672, 150], (c) => c[0] >= 249 && c[1] >= 249 && c[2] >= 249);
const calBoxB = b.bbox([1580, 85, 1672, 150], (c) => c[0] >= 249 && c[1] >= 249 && c[2] >= 249);
row('calendar button white box', calBoxA, calBoxB);
const calIcoA = a.bbox([1600, 95, 1660, 140], a.ink);
const calIcoB = b.bbox([1600, 95, 1660, 140], b.ink);
row('calendar icon ink', calIcoA, calIcoB);
out.header = { h1: { base: h1a, cur: h1b }, subtitle: { base: suba, cur: subb }, pillToday: { base: pillA, cur: pillB }, seg7: { base: t7a, cur: t7b }, seg30: { base: t30a, cur: t30b }, calendarBox: { base: calBoxA, cur: calBoxB }, calendarIcon: { base: calIcoA, cur: calIcoB } };
L.push('');

// =============================== 2. SIDEBAR ================================
L.push('## 2. Sidebar (260px)');
L.push('');
L.push('| element | baseline (x,y wxh) | current (x,y wxh) | Δx,Δy | note |');
L.push('|---|---|---|---|---|');
const logoPred = (p) => (c) => p.lum(c) > 70 && c[2] - c[0] > 12 && c[2] > 110;
const logoA = a.bbox([4, 4, 110, 100], logoPred(a));
const logoB = b.bbox([4, 4, 110, 100], logoPred(b));
row('logo glyph bbox', logoA, logoB, `base color ${logoA ? a.colorAt(logoA.x + logoA.w / 2, logoA.y + 4) : ''}`);
// brand text lines: x from 75..260, y 5..100
const brandLinesA = a.components([85, 5, 260, 100], a.sidebarInk, 15, 30);
const brandLinesB = b.components([85, 5, 260, 100], b.sidebarInk, 15, 30);
const brandTxtA = brandLinesA.length ? { x: Math.min(...brandLinesA.map((c) => c.x)), y: brandLinesA[0].y, w: 0, h: brandLinesA[0].h } : null;
L.push(`- brand text lines baseline: ${brandLinesA.map((c) => `(${c.x},${c.y} ${c.w}x${c.h})`).join(' ')}`);
L.push(`- brand text lines current : ${brandLinesB.map((c) => `(${c.x},${c.y} ${c.w}x${c.h})`).join(' ')}`);
// nav rows: detect label ink bands in x 60..230
const navBandsA = a.inkRows([60, 100, 230, 930], a.sidebarInk).filter((x) => x.y1 - x.y0 >= 6);
const navBandsB = b.inkRows([60, 100, 230, 930], b.sidebarInk).filter((x) => x.y1 - x.y0 >= 6);
L.push('');
L.push(`nav label ink bands baseline: ${navBandsA.map((x) => `${x.y0}-${x.y1}`).join(', ')}`);
L.push(`nav label ink bands current : ${navBandsB.map((x) => `${x.y0}-${x.y1}`).join(', ')}`);
const navNames = ['Dashboard', '用户管理', '角色管理', '权限管理', '流量监控', '系统设置', '退出登录'];
const navRes = [];
for (let i = 0; i < navNames.length; i++) {
  const ba = navBandsA[i], bb = navBandsB[i];
  const rect = (band) => [60, band ? band.y0 - 8 : 0, 240, band ? band.y1 + 9 : 0];
  const ia = ba ? a.bbox(rect(ba), a.sidebarInk) : null;
  const ib = bb ? b.bbox(rect(bb), b.sidebarInk) : null;
  const iconA = ba ? a.bbox([15, ba.y0 - 8, 62, ba.y1 + 9], a.sidebarInk) : null;
  const iconB = bb ? b.bbox([15, bb.y0 - 8, 62, bb.y1 + 9], b.sidebarInk) : null;
  row(`${navNames[i]} label ink`, ia, ib, `icon base ${iconA ? iconA.x + ',' + iconA.y + ' ' + iconA.w + 'x' + iconA.h : '—'} / cur ${iconB ? iconB.x + ',' + iconB.y + ' ' + iconB.w + 'x' + iconB.h : '—'}`);
  navRes.push({ name: navNames[i], label: { base: ia, cur: ib }, icon: { base: iconA, cur: iconB } });
}
const activeA = a.bbox([0, 95, 260, 175], a.blue);
const activeB = b.bbox([0, 95, 260, 175], b.blue);
row('active nav item box (blue)', activeA, activeB, `base center #${activeA ? a.colorAt(activeA.x + activeA.w / 2, activeA.y + activeA.h / 2).slice(1) : ''}`);
// divider: row in y 330..360 with elevated luminance
function dividerY(p) {
  let best = null, bestV = -1;
  for (let y = 330; y < 370; y++) {
    let s = 0;
    for (let x = 0; x < 260; x += 2) s += p.lum(p.px(x, y));
    if (s > bestV) { bestV = s; best = y; }
  }
  return best;
}
L.push(`- divider y baseline=${dividerY(a)} current=${dividerY(b)}`);
out.sidebar = { logo: { base: logoA, cur: logoB }, brandLines: { base: brandLinesA, cur: brandLinesB }, nav: navRes, active: { base: activeA, cur: activeB }, dividerY: { base: dividerY(a), cur: dividerY(b) } };
L.push('');

// =============================== 3. KPI ROW ================================
L.push('## 3. KPI cards');
L.push('');
L.push('| element | baseline (x,y wxh) | current (x,y wxh) | Δx,Δy | note |');
L.push('|---|---|---|---|---|');
const cards = [
  { name: 'KPI1', rect: [283, 183, 742, 327], iconRect: [300, 195, 395, 300], tone: 'blue', labelRect: [385, 210, 530, 240], valueRect: [385, 242, 531, 284], deltaRect: [385, 282, 530, 316], sparkRect: [531, 195, 745, 327] },
  { name: 'KPI2', rect: [742, 183, 1200, 327], iconRect: [752, 195, 850, 300], tone: 'green', labelRect: [838, 210, 1000, 240], valueRect: [838, 242, 999, 284], deltaRect: [838, 282, 999, 316], sparkRect: [990, 195, 1200, 327] },
  { name: 'KPI3', rect: [1200, 183, 1658, 327], iconRect: [1205, 195, 1305, 300], tone: 'purple', labelRect: [1295, 210, 1460, 240], valueRect: [1295, 242, 1459, 284], deltaRect: [1295, 282, 1459, 316], sparkRect: [1450, 195, 1658, 327] },
];
const tonePred = (p, tone) => (tone === 'blue' ? p.blueLine : tone === 'green' ? p.greenLine : p.purpleLine);
for (const card of cards) {
  const iconPred = (p) => (c) => p.chroma(c) > 60 && p.lum(c) < 245;
  const iconA = a.bbox(card.iconRect, iconPred(a));
  const iconB = b.bbox(card.iconRect, iconPred(b));
  row(`${card.name} icon glyph (colored core)`, iconA, iconB, `glow not included; core color base ${iconA ? a.colorAt(iconA.x + iconA.w / 2, iconA.y + iconA.h / 2) : ''} cur ${iconB ? b.colorAt(iconB.x + iconB.w / 2, iconB.y + iconB.h / 2) : ''}`);
  const la = a.bbox(card.labelRect, a.inkStrong), lb = b.bbox(card.labelRect, b.inkStrong);
  row(`${card.name} label ink`, la, lb, `left x base ${la?.x} cur ${lb?.x}`);
  const va = a.bbox(card.valueRect, a.inkStrong), vb = b.bbox(card.valueRect, b.inkStrong);
  row(`${card.name} value ink`, va, vb, `left x base ${va?.x} cur ${vb?.x}; ink h base ${va?.h} cur ${vb?.h}`);
  const da = a.bbox(card.deltaRect, a.green), db = b.bbox(card.deltaRect, b.green);
  row(`${card.name} delta ink`, da, db, `left x base ${da?.x} cur ${db?.x}`);
  const sp = tonePred(a, card.tone), sq = tonePred(b, card.tone);
  const sa = a.bbox(card.sparkRect, sp), sb = b.bbox(card.sparkRect, sq);
  // stroke thickness: median consecutive run length on columns through the line
  const thickness = (p, pred, box) => {
    if (!box) return 0;
    const runs = [];
    for (let x = box.x + 4; x < box.x + box.w - 4; x += 3) {
      let run = 0;
      for (let y = card.sparkRect[1]; y < card.sparkRect[3]; y++) {
        if (pred(p.px(x, y), x, y)) run++;
        else { if (run) runs.push(run); run = 0; }
      }
      if (run) runs.push(run);
    }
    runs.sort((u, v) => u - v);
    return runs.length ? runs[Math.floor(runs.length / 2)] : 0;
  };
  row(`${card.name} sparkline line bbox`, sa, sb, `stroke thickness base ${thickness(a, sp, sa)}px cur ${thickness(b, sq, sb)}px`);
  out.kpi.push({ name: card.name, icon: { base: iconA, cur: iconB }, label: { base: la, cur: lb }, value: { base: va, cur: vb }, delta: { base: da, cur: db }, spark: { base: sa, cur: sb }, stroke: { base: thickness(a, sp, sa), cur: thickness(b, sq, sb) } });
}
L.push('');

// =============================== 4. CHART ==================================
L.push('## 4. Chart card');
L.push('');
function gridRows(p) {
  const rows = [];
  for (let y = 390; y < 660; y++) {
    let n = 0;
    for (let x = 360; x < 1100; x++) {
      const c = p.px(x, y);
      if (p.chroma(c) < 14 && c[0] >= 232 && c[0] <= 250) n++;
    }
    if (n > 500) rows.push(y);
  }
  const g = [];
  for (const v of rows) { const l = g[g.length - 1]; if (l && v - l[l.length - 1] <= 2) l.push(v); else g.push([v]); }
  return g.map((arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length));
}
function gridCols(p) {
  const cols = [];
  for (let x = 340; x < 1128; x++) {
    let n = 0;
    for (let y = 395; y < 640; y++) {
      const c = p.px(x, y);
      if (p.chroma(c) < 14 && c[0] >= 232 && c[0] <= 250) n++;
    }
    if (n > 120) cols.push(x);
  }
  const g = [];
  for (const v of cols) { const l = g[g.length - 1]; if (l && v - l[l.length - 1] <= 2) l.push(v); else g.push([v]); }
  return g.map((arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length));
}
const yBands = (p) => p.inkRows([314, 400, 346, 632], p.ink).filter((r) => r.y1 - r.y0 >= 6 && r.y1 - r.y0 <= 14).map((r) => Math.round((r.y0 + r.y1) / 2));
const ybA = yBands(a), ybB = yBands(b);
L.push(`- y-axis label ink row centres (= value gridlines) baseline: ${ybA.join(', ')} — current: ${ybB.join(', ')}`);
const gcA = gridCols(a), gcB = gridCols(b);
L.push(`- vertical gridlines baseline x: ${gcA.join(', ')} — current x: ${gcB.join(', ')}`);
// y-axis labels: ink bbox in left gutter + per-line boxes
const ylA = a.bbox([295, 400, 356, 630], a.ink);
const ylB = b.bbox([295, 400, 356, 630], b.ink);
row('y-axis label block ink', ylA, ylB, `right edge base ${ylA ? ylA.x + ylA.w - 1 : '—'} cur ${ylB ? ylB.x + ylB.w - 1 : '—'}`);
// x-axis labels: component centers
const xlA = a.components([330, 626, 1130, 662], a.ink, 10, 30).sort((u, v) => u.x - v.x);
const xlB = b.components([330, 626, 1130, 662], b.ink, 10, 30).sort((u, v) => u.x - v.x);
const centers = (cs) => cs.map((c) => Math.round(c.x + c.w / 2));
L.push(`- x-label ink centers baseline (${xlA.length}): ${centers(xlA).join(', ')}`);
L.push(`- x-label ink centers current  (${xlB.length}): ${centers(xlB).join(', ')}`);
// card title + legend dots/text
const ctA = a.bbox([300, 348, 480, 396], a.inkStrong);
const ctB = b.bbox([300, 348, 480, 396], b.inkStrong);
row('chart title ink ("请求量趋势")', ctA, ctB);
const legDotsA = a.components([870, 350, 1010, 396], a.colored, 20, 20);
const legDotsB = b.components([870, 350, 1010, 396], b.colored, 20, 20);
row('legend dot 1', legDotsA[0] || null, legDotsB[0] || null, `base ${legDotsA[0] ? a.colorAt(legDotsA[0].x + legDotsA[0].w / 2, legDotsA[0].y + legDotsA[0].h / 2) : ''} cur ${legDotsB[0] ? b.colorAt(legDotsB[0].x + legDotsB[0].w / 2, legDotsB[0].y + legDotsB[0].h / 2) : ''}`);
row('legend dot 2', legDotsA[1] || null, legDotsB[1] || null, `base ${legDotsA[1] ? a.colorAt(legDotsA[1].x + legDotsA[1].w / 2, legDotsA[1].y + legDotsA[1].h / 2) : ''} cur ${legDotsB[1] ? b.colorAt(legDotsB[1].x + legDotsB[1].w / 2, legDotsB[1].y + legDotsB[1].h / 2) : ''}`);
const legTxtA = a.bbox([905, 350, 1128, 396], a.ink);
const legTxtB = b.bbox([905, 350, 1128, 396], b.ink);
row('legend text ink block', legTxtA, legTxtB);
// tooltip: detect pure-white 255 box inside plot (card bg is #fefefe=254)
function tipBox(p) {
  const rect = [700, 395, 1130, 540];
  let rowsW = [];
  for (let y = rect[1]; y < rect[3]; y++) {
    let run = 0, best = 0, bs = 0, s = -1;
    for (let x = rect[0]; x < rect[2]; x++) {
      const c = p.px(x, y);
      const is255 = c[0] === 255 && c[1] === 255 && c[2] === 255;
      if (is255) { if (s < 0) s = x; } else { if (s >= 0 && x - s > best) { best = x - s; bs = s; } s = -1; }
    }
    if (s >= 0 && rect[2] - s > best) { best = rect[2] - s; bs = s; }
    if (best >= 120) rowsW.push({ y, x0: bs, len: best });
  }
  if (!rowsW.length) return null;
  const y0 = rowsW[0].y, y1 = rowsW[rowsW.length - 1].y;
  const x0 = Math.min(...rowsW.map((r) => r.x0));
  const x1 = Math.max(...rowsW.map((r) => r.x0 + r.len));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 + 1 };
}
const tipA = tipBox(a), tipB = tipBox(b);
row('tooltip box (white 255 region)', tipA, tipB);
const tipTxtA = a.components([tipA ? tipA.x + 8 : 860, tipA ? tipA.y + 6 : 405, tipA ? tipA.x + tipA.w - 4 : 1080, tipA ? tipA.y + tipA.h - 4 : 520], a.ink, 8, 25);
const tipTxtB = b.components([tipB ? tipB.x + 8 : 860, tipB ? tipB.y + 6 : 405, tipB ? tipB.x + tipB.w - 4 : 1080, tipB ? tipB.y + tipB.h - 4 : 520], b.ink, 8, 25);
L.push(`- tooltip text rows baseline: ${tipTxtA.map((c) => `(${c.x},${c.y} ${c.w}x${c.h})`).join(' ')}`);
L.push(`- tooltip text rows current : ${tipTxtB.map((c) => `(${c.x},${c.y} ${c.w}x${c.h})`).join(' ')}`);

// chart facts: x-label centres, plot bounds, line/fill colours, tooltip
const xLabelCenters = (p) => {
  const groups = [];
  let cur = null;
  for (let x = 330; x < 1128; x++) {
    let n = 0;
    for (let y = 628; y < 656; y++) if (p.ink(p.px(x, y), x, y)) n++;
    if (n > 0) { if (!cur) cur = { x0: x, x1: x }; else cur.x1 = x; }
    else if (cur) { if (cur.x1 - cur.x0 >= 20) groups.push(cur); cur = null; }
  }
  if (cur && cur.x1 - cur.x0 >= 20) groups.push(cur);
  return groups.map((g) => ({ center: Math.round((g.x0 + g.x1) / 2), x0: g.x0, x1: g.x1 }));
};
const xcA = xLabelCenters(a), xcB = xLabelCenters(b);
L.push(`- x-label ink groups baseline: ${xcA.map((g) => `${g.x0}..${g.x1} (centre ${g.center})`).join(', ')}`);
L.push(`- x-label ink groups current : ${xcB.map((g) => `${g.x0}..${g.x1} (centre ${g.center})`).join(', ')}`);
function plotBounds(p, pred) {
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 395; y < 640; y++) for (let x = 300; x < 1130; x++) {
    if (pred(p.px(x, y), x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const pbA = plotBounds(a, a.blueLine), pbB = plotBounds(b, b.blueLine);
row('blue line ink bounds (whole series)', pbA, pbB, `base x ${pbA.x0}..${pbA.x0 + pbA.w - 1}; cur x ${pbB.x0}..${pbB.x0 + pbB.w - 1}`);
function lineColor(p, pred) {
  const m = new Map();
  for (let y = 400; y < 630; y += 2) for (let x = 360; x < 1120; x += 2) {
    const c = p.px(x, y);
    if (pred(c, x, y)) m.set(p.hex(c), (m.get(p.hex(c)) || 0) + 1);
  }
  return [...m.entries()].sort((u, v) => v[1] - u[1]).slice(0, 3);
}
L.push(`- blue line dominant colours baseline: ${lineColor(a, a.blueLine).map(([c]) => c).join(', ')} — current: ${lineColor(b, b.blueLine).map(([c]) => c).join(', ')}`);
L.push(`- green line dominant colours baseline: ${lineColor(a, a.greenLine).map(([c]) => c).join(', ')} — current: ${lineColor(b, b.greenLine).map(([c]) => c).join(', ')}`);
const fill = (p, x, y) => p.hex(p.px(x, y));
L.push(`- area-fill colour at (700,600) baseline ${fill(a, 700, 600)} / current ${fill(b, 700, 600)}; at (500,570) baseline ${fill(a, 500, 570)} / current ${fill(b, 500, 570)}`);
const tipA2 = a.components([tipA ? tipA.x + 8 : 860, tipA ? tipA.y + 6 : 405, tipA ? tipA.x + tipA.w - 4 : 1080, tipA ? tipA.y + tipA.h - 4 : 520], a.ink, 8, 25);
const tipB2 = b.components([tipB ? tipB.x + 8 : 860, tipB ? tipB.y + 6 : 405, tipB ? tipB.x + tipB.w - 4 : 1080, tipB ? tipB.y + tipB.h - 4 : 520], b.ink, 8, 25);
out.chart = { yGridCenter: { base: ybA, cur: ybB }, gridCols: { base: gcA, cur: gcB }, yLabels: { base: ylA, cur: ylB }, xCenters: { base: xcA, cur: xcB }, legendDots: { base: legDotsA, cur: legDotsB }, legendText: { base: legTxtA, cur: legTxtB }, tooltipText: { base: tipTxtA, cur: tipTxtB }, lineBounds: { base: pbA, cur: pbB }, tooltipBox: { base: tipA, cur: tipB } };

// =============================== 5. DONUT ==================================
L.push('## 5. Donut card');
L.push('');
function donutGeom(p) {
  const rect = [1140, 395, 1412, 660];
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (let y = rect[1]; y < rect[3]; y++) for (let x = rect[0]; x < rect[2]; x++) {
    const c = p.px(x, y);
    if (p.chroma(c) > 55 && p.lum(c) < 235) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  if (maxx < 0) return null;
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const Rguess = (maxx - minx + maxy - miny) / 4;
  const prof = [];
  for (let r = 20; r < Rguess + 8; r += 1) {
    let hit = 0, tot = 0;
    for (let k = 0; k < 180; k++) {
      const rad = (k / 180) * Math.PI * 2;
      const c = p.px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)));
      tot++;
      if (p.chroma(c) > 45 && p.lum(c) < 240) hit++;
    }
    prof.push([r, hit / tot]);
  }
  const ring = prof.filter(([, f]) => f > 0.85).map(([r]) => r);
  const innerR = ring.length ? ring[0] : 0, outerR = ring.length ? ring[ring.length - 1] : 0;
  // segment boundaries at mid-ring
  const mid = (innerR + outerR) / 2;
  const segs = [];
  let prev = null;
  for (let ang = 0; ang < 360; ang += 0.5) {
    const rad = ((ang - 90) * Math.PI) / 180;
    const c = p.px(Math.round(cx + mid * Math.cos(rad)), Math.round(cy + mid * Math.sin(rad)));
    if (!prev || Math.abs(prev[0] - c[0]) + Math.abs(prev[1] - c[1]) + Math.abs(prev[2] - c[2]) > 45) segs.push({ ang, c });
    prev = c;
  }
  // white gaps: angles where sampled colour is near-white
  const gaps = [];
  let gap = null;
  for (let ang = 0; ang < 360; ang += 0.5) {
    const rad = ((ang - 90) * Math.PI) / 180;
    const c = p.px(Math.round(cx + mid * Math.cos(rad)), Math.round(cy + mid * Math.sin(rad)));
    const isWhite = c[0] > 245 && c[1] > 245 && c[2] > 245;
    if (isWhite) { if (!gap) gap = { a0: ang, a1: ang }; else gap.a1 = ang; }
    else if (gap) { gaps.push(gap); gap = null; }
  }
  if (gap) gaps.push(gap);
  return { bbox: [minx, miny, maxx, maxy], center: [+cx.toFixed(1), +cy.toFixed(1)], outerR, innerR, thickness: outerR - innerR, mid: +mid.toFixed(1), segs, gaps, gapPx: gaps.map((g) => +((((g.a1 - g.a0) / 360) * Math.PI * mid) / 1).toFixed(1)) };
}
const dA = donutGeom(a), dB = donutGeom(b);
function segColors(p, d) {
  const bounds = [0, 145, 228, 274, 326, 360];
  const out = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const midDeg = (bounds[i] + bounds[i + 1]) / 2;
    const midR = (d.outerR + d.innerR) / 2;
    const counts = new Map();
    for (let dd = -6; dd <= 6; dd += 0.5) {
      const rad = ((midDeg + dd - 90) * Math.PI) / 180;
      const c = p.px(Math.round(d.center[0] + midR * Math.cos(rad)), Math.round(d.center[1] + midR * Math.sin(rad)));
      const h = p.hex(c);
      counts.set(h, (counts.get(h) || 0) + 1);
    }
    out.push([...counts.entries()].sort((u, v) => v[1] - u[1])[0][0]);
  }
  return out;
}
const scA = segColors(A ? a : a, dA), scB = segColors(b, dB);
L.push(`- donut stroke colours baseline: ${scA.join(', ')}`);
L.push(`- donut stroke colours current : ${scB.join(', ')}`);
row('donut bbox', dA ? { x: dA.bbox[0], y: dA.bbox[1], w: dA.bbox[2] - dA.bbox[0] + 1, h: dA.bbox[3] - dA.bbox[1] + 1 } : null, dB ? { x: dB.bbox[0], y: dB.bbox[1], w: dB.bbox[2] - dB.bbox[0] + 1, h: dB.bbox[3] - dB.bbox[1] + 1 } : null);
L.push(`- centre baseline=(${dA.center}) current=(${dB.center}); outerR baseline=${dA.outerR} current=${dB.outerR}; innerR baseline=${dA.innerR} current=${dB.innerR}; ring thickness baseline=${dA.thickness} current=${dB.thickness}`);
L.push(`- gap widths (px along mid-radius) baseline: ${dA.gapPx.join(', ')} — current: ${dB.gapPx.join(', ')}`);
const segDesc = (d) => d.segs.map((s) => `${s.ang}° ${a.hex(s.c)}`).join(' | ');
const segDescB = (d, p) => d.segs.map((s) => `${s.ang}° ${p.hex(s.c)}`).join(' | ');
L.push(`- segment boundaries baseline: ${segDesc(dA)}`);
L.push(`- segment boundaries current : ${segDescB(dB, b)}`);
// donut center text
const dcnA = a.bbox([1215, 500, 1355, 545], a.inkStrong);
const dcnB = b.bbox([1215, 500, 1355, 545], b.inkStrong);
row('donut center value ink', dcnA, dcnB);
const dclA = a.bbox([1215, 545, 1355, 580], a.ink);
const dclB = b.bbox([1215, 545, 1355, 580], b.ink);
row('donut center label ink', dclA, dclB);
// legend rows: dots in x 1420..1450, texts x 1450..1660
const legDotA = a.components([1420, 450, 1452, 625], a.colored, 15, 8);
const legDotB = b.components([1420, 450, 1452, 625], b.colored, 15, 8);
const legTxtRowsA = a.components([1450, 450, 1662, 625], a.ink, 8, 20).sort((u, v) => u.y - v.y);
const legTxtRowsB = b.components([1450, 450, 1662, 625], b.ink, 8, 20).sort((u, v) => u.y - v.y);
L.push(`- legend dots baseline: ${legDotA.map((c) => `(${c.x},${c.y} ${c.w}x${c.h} ${a.colorAt(c.x + c.w / 2, c.y + c.h / 2)})`).join(' ')}`);
L.push(`- legend dots current : ${legDotB.map((c) => `(${c.x},${c.y} ${c.w}x${c.h} ${b.colorAt(c.x + c.w / 2, c.y + c.h / 2)})`).join(' ')}`);
L.push(`- legend text rows baseline: ${legTxtRowsA.map((c) => `y${c.y}..${c.y + c.h} x${c.x}..${c.x + c.w - 1}`).join(' | ')}`);
L.push(`- legend text rows current : ${legTxtRowsB.map((c) => `y${c.y}..${c.y + c.h} x${c.x}..${c.x + c.w - 1}`).join(' | ')}`);
// donut card title
const dtA = a.bbox([1150, 350, 1420, 396], a.inkStrong);
const dtB = b.bbox([1150, 350, 1420, 396], b.inkStrong);
row('donut card title ink ("Token 使用量分布")', dtA, dtB);
out.donut = { geom: { base: dA, cur: dB }, centerValue: { base: dcnA, cur: dcnB }, centerLabel: { base: dclA, cur: dclB }, legendDots: { base: legDotA, cur: legDotB }, legendText: { base: legTxtRowsA, cur: legTxtRowsB }, title: { base: dtA, cur: dtB } };
L.push('');

// =============================== 6. TABLE ==================================
L.push('## 6. Table card');
L.push('');
const thA = a.bbox([300, 745, 990, 785], (c) => c[0] < 250 || c[1] < 250 || c[2] < 250);
const thB = b.bbox([300, 745, 990, 785], (c) => c[0] < 250 || c[1] < 250 || c[2] < 250);
// header bg band: scan rows for tinted band
function headerBand(p) {
  let y0 = null, y1 = null;
  for (let y = 730; y < 800; y++) {
    let n = 0;
    for (let x = 310; x < 990; x += 2) { const c = p.px(x, y); if (c[0] < 252 && p.chroma(c) < 20) n++; }
    const hit = n > 250;
    if (hit && y0 === null) y0 = y;
    if (hit) y1 = y;
  }
  return y0 !== null ? { x: 310, y: y0, w: 680, h: y1 - y0 + 1 } : null;
}
row('table header row band', headerBand(a), headerBand(b));
const thsA = a.components([305, 745, 995, 782], a.ink, 6, 40).sort((u, v) => u.x - v.x);
const thsB = b.components([305, 745, 995, 782], b.ink, 6, 40).sort((u, v) => u.x - v.x);
L.push(`- header cell ink left-x baseline: ${thsA.map((c) => c.x).join(', ')}`);
L.push(`- header cell ink left-x current : ${thsB.map((c) => c.x).join(', ')}`);
L.push(`- header ink rows baseline y=${thsA[0]?.y}..${thsA[0] ? thsA[0].y + thsA[0].h - 1 : '—'} current y=${thsB[0]?.y}..${thsB[0] ? thsB[0].y + thsB[0].h - 1 : '—'}`);
for (let r = 0; r < 4; r++) {
  const y0 = 782 + r * 30 - 6, y1 = 782 + (r + 1) * 30 + 2;
  const ra = a.components([305, y0, 995, y1], a.ink, 6, 40).sort((u, v) => u.x - v.x);
  const rb = b.components([305, y0, 995, y1], b.ink, 6, 40).sort((u, v) => u.x - v.x);
  row(`row ${r + 1} text ink`, { x: ra[0]?.x, y: ra[0]?.y, w: ra.length ? ra[ra.length - 1].x + ra[ra.length - 1].w - ra[0].x : 0, h: ra[0]?.h }, { x: rb[0]?.x, y: rb[0]?.y, w: rb.length ? rb[rb.length - 1].x + rb[rb.length - 1].w - rb[0].x : 0, h: rb[0]?.h }, `cell left-x base ${ra.map((c) => c.x).join('/')} cur ${rb.map((c) => c.x).join('/')}`);
  const ba = a.components([900, y0, 990, y1], a.green, 20, 10);
  const bb = b.components([900, y0, 990, y1], b.green, 20, 10);
  row(`row ${r + 1} badge`, ba[0] || null, bb[0] || null, `badge color base ${ba[0] ? a.colorAt(ba[0].x + ba[0].w / 2, ba[0].y + ba[0].h / 2) : ''} cur ${bb[0] ? b.colorAt(bb[0].x + bb[0].w / 2, bb[0].y + bb[0].h / 2) : ''}`);
  out.table = out.table || {};
  out.table[`row${r + 1}`] = { text: { base: ra[0], cur: rb[0] }, cells: { base: ra.map((c) => c.x), cur: rb.map((c) => c.x) }, badge: { base: ba[0], cur: bb[0] } };
}
const moreA = a.bbox([860, 700, 1010, 750], a.blue);
const moreB = b.bbox([860, 700, 1010, 750], b.blue);
row('"查看更多" ink', moreA, moreB);
const ttlA = a.bbox([300, 700, 500, 745], a.inkStrong);
const ttlB = b.bbox([300, 700, 500, 745], b.inkStrong);
row('table title ink ("近期请求记录")', ttlA, ttlB);
out.table.header = { band: { base: headerBand(a), cur: headerBand(b) }, cells: { base: thsA.map((c) => c.x), cur: thsB.map((c) => c.x) } };
out.table.moreLink = { base: moreA, cur: moreB };
out.table.title = { base: ttlA, cur: ttlB };
L.push('');

// =============================== 7. OVERVIEW ===============================
L.push('## 7. Overview card (系统概览)');
L.push('');
function tiles(p) {
  const card = [1020, 745, 1660, 900];
  // tinted tile pixels by column
  const colHit = new Array(card[2] - card[0]).fill(0);
  const rowHit = new Array(card[3] - card[1]).fill(0);
  for (let y = card[1]; y < card[3]; y++) for (let x = card[0]; x < card[2]; x++) {
    const c = p.px(x, y);
    if (p.chroma(c) > 3 && p.lum(c) > 232 && p.lum(c) < 252) { colHit[x - card[0]]++; rowHit[y - card[1]]++; }
  }
  const runs = (arr, minGap, minLen) => {
    const out = []; let s = -1, gap = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > 3) { if (s < 0) { s = i; } gap = 0; }
      else if (s >= 0) { gap++; if (gap > minGap) { if (i - gap - s >= minLen) out.push([s, i - gap]); s = -1; gap = 0; } }
    }
    if (s >= 0) out.push([s, arr.length - 1 - gap]);
    return out;
  };
  const xs = runs(colHit, 6, 40).map(([s, e]) => [s + card[0], e + card[0]]);
  const ys = runs(rowHit, 4, 30).map(([s, e]) => [s + card[1], e + card[1]]);
  return { xs, ys, card };
}
const tvA = tiles(a), tvB = tiles(b);
L.push(`- tile x-ranges baseline: ${tvA.xs.map((r) => `${r[0]}..${r[1]} (${r[1] - r[0] + 1}px)`).join(', ')}`);
L.push(`- tile x-ranges current : ${tvB.xs.map((r) => `${r[0]}..${r[1]} (${r[1] - r[0] + 1}px)`).join(', ')}`);
L.push(`- tile y-range baseline: ${tvA.ys.map((r) => `${r[0]}..${r[1]}`).join(', ')} — current: ${tvB.ys.map((r) => `${r[0]}..${r[1]}`).join(', ')}`);
const ovTilesA = tvA.xs.slice(0, 4), ovTilesB = tvB.xs.slice(0, 4);
const ovIconsA = [], ovIconsB = [], ovLabA = [], ovLabB = [], ovValA = [], ovValB = [];
for (let i = 0; i < 4; i++) {
  const ta = ovTilesA[i] || [1030, 1180], tb = ovTilesB[i] || [1030, 1180];
  ovIconsA.push(a.bbox([ta[0] + 5, 755, ta[1] - 5, 812], a.colored));
  ovIconsB.push(b.bbox([tb[0] + 5, 755, tb[1] - 5, 812], b.colored));
  ovLabA.push(a.bbox([ta[0], 808, ta[1], 840], a.ink));
  ovLabB.push(b.bbox([tb[0], 808, tb[1], 840], b.ink));
  ovValA.push(a.bbox([ta[0], 840, ta[1], 878], a.inkStrong));
  ovValB.push(b.bbox([tb[0], 840, tb[1], 878], b.inkStrong));
}
const ovIconRow = (cs, p) => cs.map((c) => (c ? `(${c.x},${c.y} ${c.w}x${c.h} ${p.colorAt(c.x + c.w / 2, c.y + c.h / 2)})` : '—')).join(' ');
L.push(`- overview icon glyphs baseline: ${ovIconRow(ovIconsA, a)}`);
L.push(`- overview icon glyphs current : ${ovIconRow(ovIconsB, b)}`);
L.push(`- overview labels (centre x / y) baseline: ${ovLabA.map((c) => c ? `cx${Math.round(c.x + c.w / 2)} y${c.y}..${c.y + c.h - 1}` : '—').join(' | ')}`);
L.push(`- overview labels (centre x / y) current : ${ovLabB.map((c) => c ? `cx${Math.round(c.x + c.w / 2)} y${c.y}..${c.y + c.h - 1}` : '—').join(' | ')}`);
L.push(`- overview values (centre x / y) baseline: ${ovValA.map((c) => c ? `cx${Math.round(c.x + c.w / 2)} y${c.y}..${c.y + c.h - 1}` : '—').join(' | ')}`);
L.push(`- overview values (centre x / y) current : ${ovValB.map((c) => c ? `cx${Math.round(c.x + c.w / 2)} y${c.y}..${c.y + c.h - 1}` : '—').join(' | ')}`);
const ovTtlA = a.bbox([1025, 700, 1220, 745], a.inkStrong);
const ovTtlB = b.bbox([1025, 700, 1220, 745], b.inkStrong);
row('overview title ink', ovTtlA, ovTtlB);
out.overview = { tiles: { base: tvA, cur: tvB }, icons: { base: ovIconsA, cur: ovIconsB }, labels: { base: ovLabA, cur: ovLabB }, values: { base: ovValA, cur: ovValB }, title: { base: ovTtlA, cur: ovTtlB } };
L.push('');

// =============================== 8. PRESENCE ===============================
L.push('## 8. Elements present in only one image');
L.push('');
const presence = [
  ['topbar hamburger', a.bbox([280, 10, 330, 60], a.ink), b.bbox([280, 10, 330, 60], b.ink)],
  ['topbar bell', a.bbox([1480, 10, 1540, 60], a.ink), b.bbox([1480, 10, 1540, 60], b.ink)],
  ['topbar bell badge red', a.bbox([1480, 8, 1545, 50], (c) => c[0] > 180 && c[1] < 120 && c[2] < 120), b.bbox([1480, 8, 1545, 50], (c) => c[0] > 180 && c[1] < 120 && c[2] < 120)],
  ['topbar avatar', a.bbox([1540, 10, 1610, 60], a.colored), b.bbox([1540, 10, 1610, 60], b.colored)],
  ['topbar user name', a.bbox([1600, 15, 1665, 55], a.inkStrong), b.bbox([1600, 15, 1665, 55], b.inkStrong)],
  ['KPI1 spark area-fill', a.bbox([520, 200, 738, 320], (c) => c[2] - c[0] > 4 && c[2] > 235 && c[0] < 250), b.bbox([520, 200, 738, 320], (c) => c[2] - c[0] > 4 && c[2] > 235 && c[0] < 250)],
  ['chart legend area (right of title)', a.bbox([860, 352, 1125, 394], a.ink), b.bbox([860, 352, 1125, 394], b.ink)],
];
for (const [name, pa, pb] of presence) {
  row(name, pa, pb, pa && !pb ? 'MISSING in current' : !pa && pb ? 'extra in current' : '');
  if (pa && !pb) out.missing.push(`${name}: present in baseline, missing in current`);
  if (!pa && pb) out.missing.push(`${name}: absent in baseline, present in current`);
}
L.push('');

// =============================== 9. MISMATCH RANKING ========================
L.push('## 9. Mismatch-pixel ranking (biggest visual impact first)');
L.push('');
const curImg = B;
const deltaAt = (x, y) => {
  const i = (y * A.width + x) * 4, j = (y * curImg.width + x) * 4;
  return Math.max(
    Math.abs(A.data[i] - curImg.data[j]),
    Math.abs(A.data[i + 1] - curImg.data[j + 1]),
    Math.abs(A.data[i + 2] - curImg.data[j + 2])
  );
};
const mismatchIn = (rect) => {
  let n = 0;
  for (let y = rect[1]; y < Math.min(rect[3], A.height); y++)
    for (let x = rect[0]; x < Math.min(rect[2], A.width); x++)
      if (deltaAt(x, y) > 24) n++;
  return n;
};
const fixAreas = [
  ['Sidebar brand (logo+text)', [0, 0, 260, 105]],
  ['Sidebar nav items (labels/icons)', [0, 105, 260, 471]],
  ['Sidebar active item bg', [0, 105, 260, 165]],
  ['Sidebar logout row', [0, 830, 260, 930]],
  ['Header H1 + subtitle', [285, 88, 780, 176]],
  ['Header date controls (seg/calendar)', [1330, 85, 1672, 150]],
  ['Chart title + legend', [300, 348, 1128, 396]],
  ['Chart plot area (grid+lines+labels)', [300, 396, 1128, 660]],
  ['Chart tooltip', [880, 400, 1080, 520]],
  ['KPI1 icon', [300, 195, 380, 300]],
  ['KPI1 text block', [380, 205, 535, 318]],
  ['KPI1 sparkline', [529, 195, 740, 327]],
  ['KPI2 icon', [752, 195, 850, 300]],
  ['KPI2 text block', [838, 205, 995, 318]],
  ['KPI2 sparkline', [988, 195, 1198, 327]],
  ['KPI3 icon', [1205, 195, 1300, 300]],
  ['KPI3 text block', [1295, 205, 1455, 318]],
  ['KPI3 sparkline', [1448, 195, 1656, 327]],
  ['Donut ring', [1150, 395, 1412, 670]],
  ['Donut centre text', [1215, 495, 1360, 580]],
  ['Donut legend', [1415, 445, 1662, 625]],
  ['Table title + 查看更多', [300, 700, 1005, 748]],
  ['Table header row', [300, 748, 1005, 782]],
  ['Table rows', [300, 782, 1005, 900]],
  ['Table badges', [900, 782, 985, 900]],
  ['Overview tiles bg', [1025, 750, 1655, 900]],
  ['Overview icons', [1030, 755, 1650, 810]],
  ['Overview labels/values', [1030, 808, 1650, 880]],
  ['Topbar', [260, 0, 1672, 68]],
];
const ranked = fixAreas.map(([name, rect]) => ({ name, rect, px: mismatchIn(rect) })).sort((u, v) => v.px - u.px);
L.push('| rank | area | bbox | mismatching px | share of all mismatches |');
L.push('|---|---|---|---|---|');
let totalMismatch = 0;
for (const r of ranked) totalMismatch += r.px;
const totalAll = (() => {
  let n = 0;
  for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) if (deltaAt(x, y) > 24) n++;
  return n;
})();
ranked.forEach((r, i) => {
  L.push(`| ${i + 1} | ${r.name} | ${r.rect.join(',')} | ${r.px.toLocaleString()} | ${((100 * r.px) / totalAll).toFixed(1)}% |`);
});
L.push('');
L.push(`Total mismatching pixels: ${totalAll.toLocaleString()} of ${(A.width * A.height).toLocaleString()} (${((100 * totalAll) / (A.width * A.height)).toFixed(2)}%). Areas above cover ${((100 * ranked.reduce((s, r) => s + r.px, 0)) / totalAll).toFixed(1)}% of all mismatches (overlaps counted once per area list, so share can exceed coverage).`);
L.push('');
out.ranking = ranked;

// ---- write output ----------------------------------------------------------
fs.mkdirSync(path.join(PROJECT, 'tools/out'), { recursive: true });
fs.writeFileSync(path.join(PROJECT, 'tools/out/detail.json'), JSON.stringify(out, null, 1));

const section = ['', '<!-- detailed-measurements -->', '# Detailed element measurements (baseline vs current)', '', `Generated ${new Date().toISOString()} by tools/reference-measure.mjs. Boxes are ink/glyph bounding boxes in page px (1672×941). Δ is current − baseline.`, '', ...L, ''].join('\n');
const reportPath = path.join(PROJECT, 'docs/qa-report.md');
let report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '# Visual QA report\n';
report = report.split('<!-- detailed-measurements -->')[0].trimEnd() + '\n' + section;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, report);
console.log(L.join('\n'));
console.log('\nAppended detailed measurements to docs/qa-report.md; JSON at tools/out/detail.json');
