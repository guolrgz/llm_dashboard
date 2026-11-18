#!/usr/bin/env python3
"""Extract monochrome / multi-colour icon glyphs from index.png as SVG paths."""
import json
import math
from PIL import Image

IM = Image.open('index.png').convert('RGB')
PX = IM.load()

# ---------- marching squares -------------------------------------------------
def mask_from_region(box, pred):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    m = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            m[y][x] = pred(PX[x0 + x, y0 + y])
    return m

def contours(mask):
    h = len(mask); w = len(mask[0])
    segs = []
    for y in range(h - 1):
        for x in range(w - 1):
            a = mask[y][x]; b = mask[y][x + 1]; c = mask[y + 1][x + 1]; d = mask[y + 1][x]
            idx = a * 1 + b * 2 + c * 4 + d * 8
            top = (x + 0.5, y); right = (x + 1, y + 0.5); bottom = (x + 0.5, y + 1); left = (x, y + 0.5)
            if idx in (1, 14): segs.append((left, top))
            elif idx in (2, 13): segs.append((top, right))
            elif idx in (3, 12): segs.append((left, right))
            elif idx in (4, 11): segs.append((right, bottom))
            elif idx in (6, 9): segs.append((top, bottom))
            elif idx in (7, 8): segs.append((left, bottom))
            elif idx == 5: segs.append((left, top)); segs.append((right, bottom))
            elif idx == 10: segs.append((top, right)); segs.append((left, bottom))
    adj = {}
    def add(a, b):
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    for a, b in segs:
        add(a, b)
    used = set()
    def key(a, b):
        return (a, b) if a <= b else (b, a)
    loops = []
    for start in list(adj.keys()):
        while True:
            nbrs = [n for n in adj.get(start, []) if key(start, n) not in used]
            if not nbrs:
                break
            loop = [start]; cur = start; prev = None
            while True:
                opts = [n for n in adj.get(cur, []) if key(cur, n) not in used and n != prev]
                if not opts:
                    break
                nxt = opts[0]
                used.add(key(cur, nxt))
                prev, cur = cur, nxt
                loop.append(cur)
                if cur == start:
                    break
            if len(loop) > 8 and loop[0] == loop[-1]:
                loops.append(loop[:-1])
            elif len(loop) > 8:
                # close forcibly
                loops.append(loop)
    return loops

def chaikin(loop, iters=2):
    pts = list(loop)
    for _ in range(iters):
        out = []
        n = len(pts)
        for i in range(n):
            p, q = pts[i], pts[(i + 1) % n]
            out.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
            out.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
        pts = out
    return pts

def rdp(points, eps):
    if len(points) < 3:
        return points
    def d(p, a, b):
        if a == b:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        return abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / math.hypot(b[0] - a[0], b[1] - a[1])
    dmax = 0; idx = 0
    for i in range(1, len(points) - 1):
        dd = d(points[i], points[0], points[-1])
        if dd > dmax:
            dmax = dd; idx = i
    if dmax > eps:
        return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)
    return [points[0], points[-1]]

def area(loop):
    s = 0
    for i in range(len(loop)):
        x1, y1 = loop[i]; x2, y2 = loop[(i + 1) % len(loop)]
        s += x1 * y2 - x2 * y1
    return s / 2

def to_path(loops, ox, oy, eps=0.55, scale=1.0):
    parts = []
    for lp in loops:
        if abs(area(lp)) < 2:
            continue
        sm = chaikin(lp, 2)
        pts = rdp(sm + [sm[0]], eps)[:-1]
        if len(pts) < 3:
            continue
        coords = [(ox + p[0] * scale, oy + p[1] * scale) for p in pts]
        d = 'M' + ' '.join(f'{c[0]:.1f},{c[1]:.1f}' for c in coords) + 'Z'
        parts.append(d)
    return ''.join(parts)

def components(mask):
    h = len(mask); w = len(mask[0])
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                stack = [(x, y)]; seen[y][x] = True; comp = []
                while stack:
                    cx, cy = stack.pop(); comp.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True; stack.append((nx, ny))
                if len(comp) > 12:
                    out.append(comp)
    return out

def comp_mask(mask, comp):
    h = len(mask); w = len(mask[0])
    m = [[False] * w for _ in range(h)]
    for x, y in comp:
        m[y][x] = True
    return m

def avg_color(box, comp):
    x0, y0 = box[0], box[1]
    rs = gs = bs = n = 0
    for x, y in comp:
        r, g, b = PX[x0 + x, y0 + y]
        rs += r; gs += g; bs += b; n += 1
    return (round(rs / n), round(gs / n), round(bs / n))

def hexc(c):
    return '#%02x%02x%02x' % c

# ---------- builder ----------------------------------------------------------
result = {}

def build(name, box, pred, color_mode='current', eps=0.55):
    m = mask_from_region(box, pred)
    loops = contours(m)
    w = box[2] - box[0]; h = box[3] - box[1]
    if color_mode == 'current':
        d = to_path(loops, 0, 0, eps)
        result[name] = {'w': w, 'h': h, 'fills': [{'d': d, 'fill': 'currentColor', 'fillRule': 'evenodd'}]}
    else:
        comps = components(m)
        fills = []
        for comp in comps:
            cm = comp_mask(m, comp)
            cl = contours(cm)
            d = to_path(cl, 0, 0, eps)
            if not d:
                continue
            col = hexc(avg_color(box, comp))
            fills.append({'d': d, 'fill': col, 'fillRule': 'evenodd'})
        result[name] = {'w': w, 'h': h, 'fills': fills}
    return result[name]

# ---------- logo (blue gradient glyph) ---------------------------------------
def is_logo_blue(p):
    r, g, b = p
    return b > 110 and b - r > 30 and g > 90 and b > g

build('logo', (16, 13, 71, 72), is_logo_blue, 'current', eps=0.7)

# ---------- nav icons (light grey on navy) -----------------------------------
def light_glyph(p):
    r, g, b = p
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > 78

nav = {
    'home': (24, 120, 52, 148),
    'users': (24, 178, 52, 206),
    'role': (24, 233, 52, 261),
    'shield': (24, 288, 52, 316),
    'traffic': (24, 372, 52, 400),
    'settings': (24, 427, 52, 455),
    'logout': (24, 855, 52, 883),
}
white_glyph = lambda p: (p[0] > 225 and p[1] > 225 and p[2] > 225)
for name, box in nav.items():
    build(name, box, white_glyph if name == 'home' else light_glyph, 'current', eps=0.5)

# ---------- chrome icons (dark on white / grey) ------------------------------
def dark_glyph(p):
    return sum(p) < 560

def navy_glyph(p):
    r, g, b = p
    return r < 130 and g < 130 and b < 150 and sum(p) < 420

build('bell', (1472, 12, 1510, 48), navy_glyph, 'current', eps=0.6)
build('menu', (290, 24, 316, 44), dark_glyph, 'current', eps=0.6)
build('calendar', (1610, 104, 1631, 126), dark_glyph, 'current', eps=0.6)
build('arrow-up', (396, 287, 410, 301), dark_glyph, 'current', eps=0.5)

# ---------- KPI icons (multi colour, regions aligned to glow boxes) ----------
def chat_front(p):
    r, g, b = p
    return b > 160 and b - r > 55 and b - g > 18

def chat_back(p):
    r, g, b = p
    return b > 230 and 150 < r < 225 and 190 < g < 240 and b - r > 25

build('message', (307, 197, 377, 267), chat_front, 'color', eps=0.6)
mb = build('message-back', (307, 197, 377, 267), chat_back, 'color', eps=0.7)
for f in mb['fills']:
    f['fill'] = '#c8ddfe'
    f['fillRule'] = 'nonzero'

def db_pred(p):
    r, g, b = p
    return g > 150 and g - r > 35 and g - b > 20

build('database', (764, 197, 834, 267), db_pred, 'color', eps=0.6)

def check_pred(p):
    r, g, b = p
    return b > 150 and b - g > 40 and r > 80

build('check-circle', (1223, 197, 1293, 267), check_pred, 'color', eps=0.6)

# ---------- overview icons ---------------------------------------------------
build('ov-users-blue', (1088, 767, 1128, 807), lambda p: p[2] > 150 and p[2] - p[1] > 40 and p[2] - p[0] > 40, 'color', eps=0.6)
build('ov-users-purple', (1246, 767, 1286, 807), lambda p: p[2] > 140 and p[1] < 130 and p[2] - p[1] > 50, 'color', eps=0.6)
build('ov-cube-green', (1403, 767, 1443, 807), lambda p: p[1] > 110 and p[1] - p[2] > 20 and p[1] - p[0] > 40, 'color', eps=0.5)
build('ov-clock-orange', (1556, 767, 1596, 807), lambda p: p[0] > 200 and p[2] < 140 and p[1] > 100, 'color', eps=0.6)

# ---------- chart title bars icon -------------------------------------------
build('bars', (309, 358, 338, 386), lambda p: p[2] > 150 and p[2] - p[0] > 60, 'color', eps=0.6)

json.dump(result, open('tools/out/icons.json', 'w'), indent=1)
for k, v in result.items():
    print(k, 'fills:', len(v['fills']), 'pathlen:', sum(len(f['d']) for f in v['fills']))
