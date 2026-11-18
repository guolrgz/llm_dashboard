#!/usr/bin/env python3
"""Measure the users.jpg reference design. Uses repo-local Pillow via PYTHONPATH=tools/.pylibs."""
import json, sys
from PIL import Image
import numpy as np

IM = Image.open('users.jpg').convert('RGB')
A = np.asarray(IM).astype(int)
H, W = A.shape[:2]
LUM = A.mean(axis=2)

def color(x, y, r=2):
    patch = A[max(0,y-r):y+r+1, max(0,x-r):x+r+1].reshape(-1,3)
    return '#%02x%02x%02x' % tuple(np.median(patch, axis=0).astype(int))

def median_region(x0,y0,x1,y1):
    patch = A[y0:y1, x0:x1].reshape(-1,3)
    return '#%02x%02x%02x' % tuple(np.median(patch, axis=0).astype(int))

def ink(x0,y0,x1,y1, delta=70):
    """bbox of pixels notably darker than local background median."""
    reg = LUM[y0:y1, x0:x1]
    bg = np.median(reg)
    mask = reg < bg - delta
    ys, xs = np.where(mask)
    if len(xs)==0: return None
    return dict(x0=int(x0+xs.min()), x1=int(x0+xs.max()), y0=int(y0+ys.min()), y1=int(y0+ys.max()),
                w=int(xs.max()-xs.min()+1), h=int(ys.max()-ys.min()+1), n=int(len(xs)))

def ink_light(x0,y0,x1,y1, delta=60):
    reg = LUM[y0:y1, x0:x1]
    bg = np.median(reg)
    mask = reg > bg + delta
    ys, xs = np.where(mask)
    if len(xs)==0: return None
    return dict(x0=int(x0+xs.min()), x1=int(x0+xs.max()), y0=int(y0+ys.min()), y1=int(y0+ys.max()),
                w=int(xs.max()-xs.min()+1), h=int(ys.max()-ys.min()+1), n=int(len(xs)))

def runs(mask, minlen=4):
    out=[]; start=None
    for i,v in enumerate(mask):
        if v and start is None: start=i
        elif not v and start is not None:
            if i-start>=minlen: out.append((int(start), int(i-1), int(i-start)))
            start=None
    if start is not None and len(mask)-start>=minlen: out.append((int(start), len(mask)-1, len(mask)-start))
    return out

def vruns_dark(x, y0, y1, delta=25):
    col = LUM[y0:y1, x]
    med = np.median(col)
    return runs((col < med - delta) | (col > med + delta), 3)

def darker_mask(x0,y0,x1,y1,delta):
    reg = LUM[y0:y1, x0:x1]
    bg = np.median(reg)
    return reg < bg - delta

def white_mask(x0,y0,x1,y1,thr=245):
    return LUM[y0:y1, x0:x1] > thr

out = {}
out['size'] = [W, H]
out['colors'] = {
  'sidebar': [color(200, 400), color(200, 900), color(200, 1200), color(300, 600)],
  'sidebar_active': [color(200, 300), color(380, 320), color(50, 310)],
  'topbar': color(1500, 50),
  'content_bg': [color(300, 150), color(1500, 100), color(2400, 150), color(200, 250), color(1500, 400), color(500, 1500), color(2500, 1400)],
  'page_bg_low': color(2400, 1450),
  'card': [color(700, 380), color(1500, 550)],
  'table_header_bg': color(1600, 640),
  'active_band': color(200, 280),
  'button_blue': color(2060, 550),
  'button_red': color(2320, 550),
  'button_gray': color(2560, 550),
}
# card bounds by white runs on columns
for x in [500, 1000, 2000, 2700]:
    col = LUM[:, x]
    out[f'white_runs_col_{x}'] = runs(col > 246, 20)
# topbar height
col = LUM[:, 1500]
out['topbar_runs_col1500'] = runs(col > 246, 20)
# card row extents / background transitions at several rows
for y in [305, 340, 400, 470, 500, 620, 700, 800, 1300, 1369, 1400]:
    row = A[y]
    out[f'row_{y}_white_runs'] = runs(LUM[y] > 246, 20)

# Content bg sampling per row band
out['bg_rows'] = {}
for y in [110,150,200,250,280,300,470,480,1375,1400,1450,1500]:
    out['bg_rows'][str(y)] = median_region(2000, y, 2700, y+1) if y>500 else median_region(2200, y, 2700, y+1)
print(json.dumps(out, indent=1, ensure_ascii=False))
