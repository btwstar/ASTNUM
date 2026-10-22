#!/usr/bin/env python3
"""
ASTNUM Android asset regenerator — rebuilds every launcher icon + splash
from the user's uploaded black-on-white fox/dumbbell artwork
(upload/file_00000000294c81f59125552487c9f52a.png).

New icon identity (v2): PURE WHITE background + PURE BLACK logo.
(no navy anywhere — the old neon-on-navy artwork upload/1000419154.png
is retired but left untouched on disk for history.)

Faithful to the existing Capacitor resource layout:
  - ic_launcher.png            full-bleed square  (36/48/72/96/144/192)
  - ic_launcher_round.png       circular alpha-crop at the same sizes
  - ic_launcher_foreground.png full-bleed (matches current convention;
                               the adaptive XMLs apply the 16.7% inset)
  - ic_launcher_background.png solid pure-white tile (1.5x legacy sizes)
  - splash.png (port+land+night) white bg + centered black logo at
    every density the previous script discovered (~26% of the short side)
"""
from PIL import Image, ImageDraw
import glob
import os

ROOT = "/home/z/my-project/android-app/android/app/src/main/res"
ART = Image.open(
    "/home/z/my-project/upload/file_00000000294c81f59125552487c9f52a.png"
).convert("RGB")

# identity color: pure white background (255,255,255) everywhere
WHITE = (255, 255, 255)

DENSITIES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

def circle_mask(size):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    return m

for dens, n in DENSITIES.items():
    folder = os.path.join(ROOT, f"mipmap-{dens}")
    os.makedirs(folder, exist_ok=True)
    # the source already carries its own white-bg + black-logo composition
    square = ART.resize((n, n), Image.LANCZOS)
    square.save(os.path.join(folder, "ic_launcher.png"))
    round_img = square.convert("RGBA")
    round_img.putalpha(circle_mask(n))
    round_img.save(os.path.join(folder, "ic_launcher_round.png"))
    square.save(os.path.join(folder, "ic_launcher_foreground.png"))
    bg_n = int(n * 1.5)
    bg = Image.new("RGB", (bg_n, bg_n), WHITE)
    bg.save(os.path.join(folder, "ic_launcher_background.png"))
    print(f"✓ mipmap-{dens} ({n}px, bg {bg_n}px)")

# ── splash: white bg + centered black logo (~26% of the shorter side) ──
# Day AND night variants both use the white identity (matches the icon).
SPLASHES = {}
for p in glob.glob(f"{ROOT}/drawable*/splash.png"):
    with Image.open(p) as im:
        SPLASHES[p] = im.size

for path, (w, h) in SPLASHES.items():
    base = Image.new("RGB", (w, h), WHITE)
    logo_side = max(1, int(min(w, h) * 0.26))
    logo = ART.resize((logo_side, logo_side), Image.LANCZOS)
    base.paste(logo, ((w - logo_side) // 2, (h - logo_side) // 2))
    base.save(path)
    print(f"✓ {os.path.relpath(path, ROOT)} ({w}x{h})")
print(f"✓ {len(SPLASHES)} splash resources regenerated")
