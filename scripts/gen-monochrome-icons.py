#!/usr/bin/env python3
"""
ASTNUM — Android 13+ themed-icon (monochrome) layer generator.

Takes the user's uploaded black-on-white fox/dumbbell artwork
(upload/file_00000000294c81f59125552487c9f52a.png), thresholds the dark
pixels into an ink mask and renders it as BLACK ink on transparency at
every launcher density (alpha = ink, RGB = black, white areas fully
transparent — the old white silhouette from assets/icon-only.png is
retired but the file stays on disk untouched). Referenced by
<monochrome> in the adaptive-icon XMLs; the system tints this layer
with the wallpaper-derived theme color on Android 13+.

Conventions kept identical to the previous generator: full-bleed N×N
output per density (no padding — the adaptive XML applies the 16.7%
inset), LANCZOS downsampling from source resolution.
"""
from PIL import Image
import numpy as np
import os

ROOT = "/home/z/my-project/android-app/android/app/src/main/res"
SRC = Image.open(
    "/home/z/my-project/upload/file_00000000294c81f59125552487c9f52a.png"
).convert("L")

# threshold at full source resolution: dark pixels = ink (alpha 255),
# everything else transparent. LANCZOS downsampling afterwards keeps the
# small-size edges smooth.
ALPHA = Image.fromarray(((np.array(SRC) < 128) * 255).astype(np.uint8))
INK = Image.merge("RGBA", (
    Image.new("L", SRC.size, 0),   # R: black ink
    Image.new("L", SRC.size, 0),   # G
    Image.new("L", SRC.size, 0),   # B
    ALPHA,                         # A: ink mask
))

DENSITIES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

for dens, n in DENSITIES.items():
    folder = os.path.join(ROOT, f"mipmap-{dens}")
    os.makedirs(folder, exist_ok=True)
    mono = INK.resize((n, n), Image.LANCZOS)
    mono.save(os.path.join(folder, "ic_launcher_monochrome.png"))
    print(f"✓ mipmap-{dens}/ic_launcher_monochrome.png ({n}px)")

print("done")
