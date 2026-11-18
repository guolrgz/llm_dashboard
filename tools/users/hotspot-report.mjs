#!/usr/bin/env node
/**
 * users/hotspot-report.mjs — print a concise per-owner hotspot briefing from
 * tools/out/users-diff-stats.json (written by tools/users/diff.mjs).
 *
 * Usage:
 *   node tools/users/hotspot-report.mjs                 # all owners, 8 each
 *   node tools/users/hotspot-report.mjs --owner=shell-dev
 *   node tools/users/hotspot-report.mjs --owner=content-dev --n=6
 *   node tools/users/hotspot-report.mjs --json          # raw JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../..');
const STATS = path.join(PROJECT, 'tools/out/users-diff-stats.json');

const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const owner = getArg('owner', null);
const n = parseInt(getArg('n', '8'), 10);
const asJson = argv.includes('--json');

if (!fs.existsSync(STATS)) {
  console.error('missing tools/out/users-diff-stats.json — run: node tools/users/diff.mjs');
  process.exit(1);
}
const s = JSON.parse(fs.readFileSync(STATS, 'utf8'));
const css = (v) => Math.round(v / 2);

if (asJson) {
  console.log(JSON.stringify(s.perOwnerHotspots, null, 2));
  process.exit(0);
}

const fmt = (v, d = 1) => Number(v).toFixed(d);
const shiftTxt = (h) =>
  h.shift?.insignificant ? '内容不同' : h.shift?.dx || h.shift?.dy ? `位移(${h.shift.dx},${h.shift.dy})` : '无位移';

console.log(`overall ${fmt(s.mismatchPct, 2)}%  (${s.current?.width}×${s.current?.height})`);
for (const r of s.regions) {
  console.log(`  ${r.name.padEnd(34)} ${fmt(r.pct, 2).padStart(6)}%  meanΔ ${fmt(r.meanDelta, 1)}  [${r.owner}]`);
}
if (s.screenshotMeta?.scrollHeight && s.screenshotMeta.scrollHeight !== 768) {
  console.log(`  ⚠ scrollHeight=${s.screenshotMeta.scrollHeight} (expect 768)`);
}
console.log('');

const owners = owner ? [owner] : ['shell-dev', 'content-dev'];
for (const o of owners) {
  const list = (s.perOwnerHotspots?.[o] || []).slice(0, n);
  console.log(`== ${o} — top ${list.length} hotspots ==`);
  if (!list.length) {
    console.log('  (none)');
    console.log('');
    continue;
  }
  list.forEach((h, i) => {
    const img = `img (${h.x0},${h.y0})-(${h.x1},${h.y1})`;
    const cssBox = `css (${css(h.x0)},${css(h.y0)})-(${css(h.x1)},${css(h.y1)})`;
    const mean = `base ${h.meanBase ? '#' + h.meanBase.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : '?'} / cur ${h.meanCur ? '#' + h.meanCur.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : '?'}`;
    console.log(`  ${i + 1}. ${img}  ${cssBox}  ${h.bad}px (${fmt((h.bad / Math.max(1, (h.x1 - h.x0) * (h.y1 - h.y0))) * 100)}%)  ${mean}  ${shiftTxt(h)}  [${h.region}]`);
  });
  console.log('');
}
