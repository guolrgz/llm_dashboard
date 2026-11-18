#!/usr/bin/env node
// compare-crop.mjs --rect=x,y,w,h [--scale=2] [--out=docs/crops/x.png] [--stack=v]
// Writes baseline (top/left) and current (bottom/right) crops side by side at scale.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pngjs';
const { PNG } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const o = { rect: null, scale: 2, out: 'docs/crops/compare.png', base: 'index.png', cur: 'tools/out/current.png', stack: 'v', gap: 10 };
for (const a of argv) { const m = a.match(/^--([A-Za-z-]+)=(.*)$/); if (!m) continue; if (m[1] === 'rect') o.rect = m[2].split(',').map(Number); else if (m[1] in o) o[m[1]] = isNaN(+m[2]) ? m[2] : +m[2]; }
const load = (p) => PNG.sync.read(fs.readFileSync(path.resolve(PROJECT, p)));
const A = load(o.base), B = load(o.cur);
const [x0, y0, w, h] = o.rect;
const s = o.scale;
const ow = o.stack === 'v' ? w * s : w * s * 2 + o.gap;
const oh = o.stack === 'v' ? h * s * 2 + o.gap : h * s;
const data = new Uint8ClampedArray(ow * oh * 4);
for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 0; data[i + 2] = 255; data[i + 3] = 255; }
function put(img, ox, oy) {
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const sx = x0 + Math.floor(x / s), sy = y0 + Math.floor(y / s);
    let c = [255, 255, 255];
    if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height) { const i = (sy * img.width + sx) * 4; c = [img.data[i], img.data[i + 1], img.data[i + 2]]; }
    const di = ((oy + y) * ow + ox + x) * 4;
    data[di] = c[0]; data[di + 1] = c[1]; data[di + 2] = c[2]; data[di + 3] = 255;
  }
}
put(A, 0, 0);
put(B, o.stack === 'v' ? 0 : w * s + o.gap, o.stack === 'v' ? h * s + o.gap : 0);
const png = new PNG({ width: ow, height: oh });
png.data = Buffer.from(data);
fs.mkdirSync(path.dirname(path.resolve(PROJECT, o.out)), { recursive: true });
fs.writeFileSync(path.resolve(PROJECT, o.out), PNG.sync.write(png));
console.log(o.out, ow + 'x' + oh);
