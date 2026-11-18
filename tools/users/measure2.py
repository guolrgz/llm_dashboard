#!/usr/bin/env python3
import json
from PIL import Image
import numpy as np
IM = Image.open('users.jpg').convert('RGB')
A = np.asarray(IM).astype(int); H,W = A.shape[:2]
LUM = A.mean(axis=2)
R,G,B = A[:,:,0],A[:,:,1],A[:,:,2]

def bbox(mask, name, minarea=30):
    ys,xs = np.where(mask)
    if len(xs)<minarea: return {name: None}
    return {name: dict(x0=int(xs.min()),x1=int(xs.max()),y0=int(ys.min()),y1=int(ys.max()),
                       w=int(xs.max()-xs.min()+1),h=int(ys.max()-ys.min()+1),area=int(len(xs)))}

def ink(x0,y0,x1,y1, delta=70):
    reg = LUM[y0:y1, x0:x1]; bg = np.median(reg); mask = reg < bg - delta
    ys,xs = np.where(mask)
    if len(xs)==0: return None
    return dict(x0=int(x0+xs.min()),x1=int(x0+xs.max()),y0=int(y0+ys.min()),y1=int(y0+ys.max()),
                w=int(xs.max()-xs.min()+1),h=int(ys.max()-ys.min()+1),n=int(len(xs)))

def inkpos(x0,y0,x1,y1,delta=60,mode='dark'):
    reg = LUM[y0:y1,x0:x1]; bg=np.median(reg)
    mask = reg < bg-delta if mode=='dark' else reg > bg+delta
    ys,xs=np.where(mask)
    if len(xs)==0: return None
    # split into x runs (words)
    cols = sorted(set(xs.tolist()))
    runs=[]; s=cols[0]; p=cols[0]
    for c in cols[1:]:
        if c-p>6: runs.append((int(x0+s),int(x0+p))); s=c
        p=c
    runs.append((int(x0+s),int(x0+p)))
    return dict(x0=int(x0+xs.min()),x1=int(x0+xs.max()),y0=int(y0+ys.min()),y1=int(y0+ys.max()),
                h=int(ys.max()-ys.min()+1),xruns=runs)

out={}
# ---------- topbar ----------
top = dict(
  hamburger=ink(440,10,700,100),
  bell=ink(2050,10,2400,100),
  avatar_area=ink(2380,0,2600,106),
  username=inkpos(2560,20,2700,90),
)
out['topbar']=top
out['topbar_colors']=dict(
  bell_badge='#%02x%02x%02x'%tuple(np.median(A[30:50,2330:2360].reshape(-1,3),axis=0).astype(int)),
)

# ---------- sidebar ----------
out['sidebar_ink']=dict(
  logo=ink(20,10,220,160),
  brand1=ink(150,20,420,110),
  brand2=ink(150,90,430,150),
  nav=ink(30,150,430,260),
  active_text=ink(100,280,400,340),
  active_icon=ink(30,280,100,340),
  chev_active=ink(360,280,430,340),
  nav2=ink(30,360,430,470),
  nav3=ink(30,470,430,580),
  divider=ink(0,580,430,640, delta=8),
  nav4=ink(30,620,430,720),
  chev4=ink(360,620,430,720),
  nav5=ink(30,720,430,820),
  chev5=ink(360,720,430,820),
  logout=ink(30,1380,430,1500),
  logout_icon=ink(30,1380,110,1500),
)
# sidebar colors
out['sidebar_colors']={
 'bg_top':'#%02x%02x%02x'%tuple(np.median(A[10:20,300:420].reshape(-1,3),axis=0).astype(int)),
 'bg_mid':'#%02x%02x%02x'%tuple(np.median(A[600:700,300:420].reshape(-1,3),axis=0).astype(int)),
 'bg_low':'#%02x%02x%02x'%tuple(np.median(A[1200:1300,300:420].reshape(-1,3),axis=0).astype(int)),
 'active':'#%02x%02x%02x'%tuple(np.median(A[280:340,150:350].reshape(-1,3),axis=0).astype(int)),
}

# ---------- page header ----------
out['page_header']=dict(h1=ink(460,120,1300,230,delta=100), sub=ink(460,225,1700,290))

# ---------- filter card controls ----------
# input box border: find rounded rect around x 500..1230? use non-white mask inside card
mask = LUM < 243
# white card region y 306..462, x 479..2715
def comps_in(x0,y0,x1,y1,thr=245):
    reg = (LUM[y0:y1,x0:x1] < thr)
    ys,xs=np.where(reg)
    if len(xs)==0: return None
    return dict(x0=int(x0+xs.min()),x1=int(x0+xs.max()),y0=int(y0+ys.min()),y1=int(y0+ys.max()))
out['filter_controls_raw']=dict(
  all_nonwhite=comps_in(479,306,2716,462),
)
# runs of non-white along row through middle of filter card
for y in [340, 350, 360, 370, 380, 390, 400, 410, 420]:
    m = LUM[y,479:2716] < 250
    runs=[]; s=None
    for i,v in enumerate(m):
        if v and s is None: s=i
        elif not v and s is not None:
            if i-s>=2: runs.append((479+s,479+i-1))
            s=None
    if s is not None: runs.append((479+s,2715))
    out[f'filter_nonwhite_row_{y}']=runs

# ---------- buttons via color ----------
out['filter_buttons']={
 'blue': bbox((B>180)&(R<120)&(G>80)&(G<170)&(np.indices((H,W))[0]>300)&(np.indices((H,W))[0]<470),'blue'),
 'red':  bbox((R>180)&(G<140)&(B<140)&(np.indices((H,W))[0]>480)&(np.indices((H,W))[0]<620),'red'),
 'gray': bbox((abs(R-205)<18)&(abs(G-212)<18)&(abs(B-219)<18)&(np.indices((H,W))[0]>480)&(np.indices((H,W))[0]<620),'gray'),
}
# white bordered buttons in filter card (重置): detect border pixels (gray)
# nonwhite runs around y 380 for x>2300
out['filter_right_runs']=out.get('filter_nonwhite_row_380')

# ---------- table card: toolbar y, header row ----------
# nonwhite runs per row to identify toolbar and header
for y in [500, 520, 540, 560, 580, 600, 610, 620, 630, 640, 650, 660, 680, 700, 720, 740, 800]:
    m = LUM[y,479:2716] < 248
    runs=[]; s=None
    for i,v in enumerate(m):
        if v and s is None: s=i
        elif not v and s is not None:
            if i-s>=2: runs.append((479+s,479+i-1))
            s=None
    if s is not None: runs.append((479+s,2715))
    out[f'table_row_{y}']=runs

print(json.dumps(out,indent=1,ensure_ascii=False))
