#!/usr/bin/env python3
"""Pixel analysis helpers for index.png design spec extraction."""
import sys
from PIL import Image

IMG = "/home/student/code/llm_dashboard/index.png"

def load():
    im = Image.open(IMG).convert("RGB")
    return im

def hexc(p):
    return "#%02x%02x%02x" % p

def runs(seq, minlen=1):
    """Group consecutive equal items in list of (pos, value)."""
    out = []
    start = None
    prev = None
    for pos, v in seq:
        if v != prev:
            if prev is not None and pos - start >= minlen:
                out.append((start, pos - 1, prev))
            start = pos
            prev = v
    if prev is not None:
        out.append((start, seq[-1][0], prev))
    return out

def scan_row(im, y, x0=0, x1=None, minlen=2, tol=6):
    x1 = x1 or im.width
    px = im.load()
    seq = []
    for x in range(x0, x1):
        seq.append((x, px[x, y]))
    # quantize
    q = []
    for pos, v in seq:
        q.append((pos, tuple((c // tol) * tol for c in v)))
    return runs(q, minlen)

def scan_col(im, x, y0=0, y1=None, minlen=2, tol=6):
    y1 = y1 or im.height
    px = im.load()
    q = []
    for y in range(y0, y1):
        v = px[x, y]
        q.append((y, tuple((c // tol) * tol for c in v)))
    return runs(q, minlen)

def main():
    im = load()
    print("size", im.size)
    mode = sys.argv[1] if len(sys.argv) > 1 else "info"
    if mode == "row":
        y = int(sys.argv[2])
        x0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        x1 = int(sys.argv[4]) if len(sys.argv) > 4 else None
        for a, b, c in scan_row(im, y, x0, x1):
            print(f"x {a}-{b}  {hexc(c)}  len={b-a+1}")
    elif mode == "col":
        x = int(sys.argv[2])
        y0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        y1 = int(sys.argv[4]) if len(sys.argv) > 4 else None
        for a, b, c in scan_col(im, x, y0, y1):
            print(f"y {a}-{b}  {hexc(c)}  len={b-a+1}")
    elif mode == "px":
        px = im.load()
        for arg in sys.argv[2:]:
            x, y = map(int, arg.split(","))
            print(arg, hexc(px[x, y]))
    elif mode == "crop":
        # crop x0 y0 x1 y1 out [scale]
        x0, y0, x1, y1 = map(int, sys.argv[2:6])
        out = sys.argv[6]
        scale = float(sys.argv[7]) if len(sys.argv) > 7 else 1
        c = im.crop((x0, y0, x1, y1))
        if scale != 1:
            c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
        c.save(out)
        print("saved", out, c.size)
    elif mode == "uniq":
        # most common colors in box
        x0, y0, x1, y1 = map(int, sys.argv[2:6])
        from collections import Counter
        c = im.crop((x0, y0, x1, y1))
        cnt = Counter(c.getdata())
        for col, n in cnt.most_common(15):
            print(hexc(col), n)
    else:
        print("modes: row col px crop uniq")

if __name__ == "__main__":
    main()
