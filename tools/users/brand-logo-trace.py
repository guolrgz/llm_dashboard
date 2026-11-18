#!/usr/bin/env python3
"""Trace the brand logo from users.jpg into an SVG symbol fragment.

The reference page uses a cloud + brain-circuit brand mark.  The shared dashboard
sprite (#i-logo) is a different mark, so we trace the actual mark from the design
reference and embed it as a page-local symbol (#i-brand-logo).

Usage:  PYTHONPATH=tools/.pylibs python3 tools/users/brand-logo-trace.py
Output: tools/users/brand-logo-symbol.frag  (paste into src/users/components/UserIcons.vue)
"""
import os
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# logo region in users.jpg pixel coordinates
X0, Y0, X1, Y1 = 34, 25, 128, 105
OUT = ROOT / (os.environ.get('LOGO_OUT') or 'tools/users/brand-logo-symbol.frag')

im = Image.open(ROOT / 'users.jpg').convert('RGB')
reg = np.asarray(im.crop((X0, Y0, X1, Y1))).astype(int)
R, G, B = reg[:, :, 0], reg[:, :, 1], reg[:, :, 2]
import os
_mask = os.environ.get('LOGO_MASK')
if _mask:
    mask = eval(_mask)
else:
    mask = (B > 105) & (B - R > 22) & (G > 50)
H, W = mask.shape


def components(mask, minsize=20):
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for y in range(H):
        for x in range(W):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)])
                seen[y, x] = True
                pix = []
                while q:
                    cy, cx = q.popleft()
                    pix.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                q.append((ny, nx))
                if len(pix) >= minsize:
                    comps.append(pix)
    comps.sort(key=len, reverse=True)
    return comps


def comp_mask(pix):
    m = np.zeros((H, W), dtype=np.uint8)
    for (y, x) in pix:
        m[y, x] = 255
    return m


def smooth_contour(m, scale=4):
    """Upscale + marching-squares contour of a binary mask (image-local px units)."""
    img = Image.fromarray(m).resize((W * scale, H * scale), Image.LANCZOS)
    a = np.pad(np.asarray(img).astype(float) / 255.0, 2, mode='constant')
    hh, ww = a.shape
    segs = []
    for y in range(hh - 1):
        for x in range(ww - 1):
            tl, tr, bl, br = a[y, x], a[y, x + 1], a[y + 1, x], a[y + 1, x + 1]
            idx = (tl >= .5) | ((tr >= .5) << 1) | ((br >= .5) << 2) | ((bl >= .5) << 3)
            if idx in (0, 15):
                continue

            def lerp(p, q):
                t = (0.5 - p) / (q - p) if q != p else 0.5
                return min(max(t, 0.0), 1.0)

            top = (x + lerp(tl, tr), y)
            right = (x + 1, y + lerp(tr, br))
            bottom = (x + lerp(bl, br), y + 1)
            left = (x, y + lerp(tl, bl))
            table = {
                1: [(left, top)], 2: [(top, right)], 3: [(left, right)], 4: [(right, bottom)],
                5: [(left, top), (right, bottom)], 6: [(top, bottom)], 7: [(left, bottom)],
                8: [(bottom, left)], 9: [(bottom, top)], 10: [(top, right), (bottom, left)],
                11: [(bottom, right)], 12: [(right, left)], 13: [(right, top)], 14: [(top, left)],
                15: [],
            }
            segs.extend(table[idx])

    def key(p):
        return (round(p[0], 3), round(p[1], 3))

    adj = {}
    for p, q in segs:
        adj.setdefault(key(p), []).append(q)
        adj.setdefault(key(q), []).append(p)

    loops, visited = [], set()
    for start in list(adj.keys()):
        if start in visited:
            continue
        loop, cur, prev = [start], start, None
        visited.add(start)
        while True:
            nxts = [n for n in adj.get(key(cur), [])
                    if key(n) != prev and (key(n) not in visited or key(n) == start)]
            if not nxts:
                break
            nxt = nxts[0]
            if key(nxt) == start:
                loop.append(start)
                break
            loop.append(key(nxt))
            visited.add(key(nxt))
            prev, cur = key(cur), key(nxt)
            if len(loop) > 100000:
                break
        if len(loop) > 8:
            loops.append([((x - 2) / scale, (y - 2) / scale) for (x, y) in loop])
    return loops


def simplify(pts, tol=0.45):
    if len(pts) < 4:
        return pts

    def rdp(pts):
        if len(pts) < 3:
            return pts
        x0, y0 = pts[0]
        x1, y1 = pts[-1]
        dx, dy = x1 - x0, y1 - y0
        den = (dx * dx + dy * dy) ** .5
        best, idx = 0, 0
        for i in range(1, len(pts) - 1):
            px, py = pts[i]
            d = (abs(dy * px - dx * py + x1 * y0 - y1 * x0) / den if den
                 else ((px - x0) ** 2 + (py - y0) ** 2) ** .5)
            if d > best:
                best, idx = d, i
        if best > tol:
            return rdp(pts[:idx + 1])[:-1] + rdp(pts[idx:])
        return [pts[0], pts[-1]]

    return rdp(pts)


def path_d(polys, scale=2.0):
    d = []
    for pts in polys:
        pts = simplify(pts)
        if len(pts) < 3:
            continue
        p = [(x * scale, y * scale) for (x, y) in pts]
        d.append(f'M{p[0][0]:.2f},{p[0][1]:.2f}')
        for i in range(1, len(p) - 1):
            mx = (p[i][0] + p[i + 1][0]) / 2
            my = (p[i][1] + p[i + 1][1]) / 2
            d.append(f'Q{p[i][0]:.2f},{p[i][1]:.2f} {mx:.2f},{my:.2f}')
        d.append('Z')
    return ' '.join(d)


comps = components(mask)
outline_d = path_d(smooth_contour(comp_mask(comps[0])))
feat_d = ' '.join(path_d(smooth_contour(comp_mask(c))) for c in comps[1:])

symbol = f'''      <!-- Brand mark traced from users.jpg (cloud + circuit brain). viewBox = ink bbox. -->
      <symbol id="i-brand-logo" viewBox="8 8 170 140">
        <defs>
          <linearGradient id="brandLogoGrad" x1="0.02" y1="0" x2="0.9" y2="1">
            <stop offset="0" stop-color="#86dcff"/>
            <stop offset="0.42" stop-color="#4cb9f8"/>
            <stop offset="1" stop-color="#2c8ce7"/>
          </linearGradient>
        </defs>
        <path d="{outline_d}" fill="url(#brandLogoGrad)" fill-rule="evenodd"/>
        <path d="{feat_d}" fill="url(#brandLogoGrad)" fill-rule="evenodd"/>
      </symbol>'''
OUT.write_text(symbol)
print('wrote', OUT.relative_to(ROOT), len(symbol), 'chars')
