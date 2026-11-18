#!/usr/bin/env python3
"""decode-baseline.py SRC.jpg DST.png

Decode the JPEG design reference (users.jpg) into a lossless PNG so the Node
pixel-diff tool can read it with pngjs (which has no JPEG decoder).
Called automatically by tools/users/diff.mjs (cached by mtime).

Usage:
  PYTHONPATH=tools/.pylibs python3 tools/users/decode-baseline.py users.jpg tools/out/users-baseline.png
"""
import sys
from PIL import Image

if len(sys.argv) != 3:
    sys.exit("usage: decode-baseline.py SRC.jpg DST.png")

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
im.save(dst, "PNG")
print(f"decoded {src} -> {dst} ({im.size[0]}x{im.size[1]})")
