/**
 * Brand banner compositor — rasterizes the hand-typed SVG overlay (crisp
 * vector typography: gradient wordmark, tagline, feature chips) over the
 * AI-generated navy/mint background.
 *
 * Output:
 *   assets/brand/banner.png      1280×640  (GitHub social preview / og:image)
 *   assets/brand/banner-wide.png 1344×768  (README hero)
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DIR = join(ROOT, "assets", "brand");

function overlay(w: number, h: number): Buffer {
  const pad = Math.round(w * 0.055);
  const wordSize = Math.round(w * 0.135);
  const tagSize = Math.round(w * 0.026);
  const chipSize = Math.round(w * 0.019);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mint" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="55%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#a3e635"/>
    </linearGradient>
    <linearGradient id="fade" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0b1020" stop-opacity="0"/>
      <stop offset="100%" stop-color="#05070f" stop-opacity="0.55"/>
    </linearGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#fade)"/>

  <g font-family="'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif" text-rendering="geometricPrecision">
    <text x="${pad}" y="${Math.round(h * 0.45)}" fill="url(#mint)" font-size="${wordSize}" font-weight="700" letter-spacing="${Math.round(wordSize * 0.10)}">ASTNUM</text>
    <text x="${pad}" y="${Math.round(h * 0.45) + Math.round(tagSize * 2.4)}" fill="#e2e8f0" font-size="${tagSize}" font-weight="500" opacity="0.92">Habits · Notes · Workouts — one private, offline-first tracker</text>

    <!-- feature chips -->
    <g font-size="${chipSize}" font-weight="700">
      <g>
        <rect x="${pad}" y="${Math.round(h * 0.72)}" width="${Math.round(chipSize * 13.2)}" height="${Math.round(chipSize * 2.4)}" rx="${Math.round(chipSize * 1.2)}" fill="#22d3ee22" stroke="#22d3ee" stroke-opacity="0.55"/>
        <text x="${Math.round(pad + chipSize * 1.1)}" y="${Math.round(h * 0.72 + chipSize * 1.65)}" fill="#67e8f9">160 LANGUAGES</text>
      </g>
      <g>
        <rect x="${Math.round(pad + chipSize * 14.4)}" y="${Math.round(h * 0.72)}" width="${Math.round(chipSize * 11.2)}" height="${Math.round(chipSize * 2.4)}" rx="${Math.round(chipSize * 1.2)}" fill="#34d39922" stroke="#34d399" stroke-opacity="0.55"/>
        <text x="${Math.round(pad + chipSize * 15.5)}" y="${Math.round(h * 0.72 + chipSize * 1.65)}" fill="#6ee7b7">OPEN SOURCE · MIT</text>
      </g>
      <g>
        <rect x="${Math.round(pad + chipSize * 27)}" y="${Math.round(h * 0.72)}" width="${Math.round(chipSize * 11.5)}" height="${Math.round(chipSize * 2.4)}" rx="${Math.round(chipSize * 1.2)}" fill="#a3e63522" stroke="#a3e635" stroke-opacity="0.55"/>
        <text x="${Math.round(pad + chipSize * 28.1)}" y="${Math.round(h * 0.72 + chipSize * 1.65)}" fill="#bef264">19 HOME WIDGETS</text>
      </g>
    </g>
  </g>
</svg>`);
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const bg = readFileSync(join(DIR, "banner-bg.png"));

  // wide hero 1344×768
  const wide = await sharp(bg).composite([{ input: overlay(1344, 768) }]).png().toBuffer();
  writeFileSync(join(DIR, "banner-wide.png"), wide);

  // social preview 1280×640 (GitHub og-image sweet spot)
  const og = await sharp(bg)
    .extract({ left: 32, top: 64, width: 1280, height: 640 })
    .composite([{ input: overlay(1280, 640) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(DIR, "banner.png"), og);

  console.log("✓ banner-wide.png + banner.png composited");
  console.log(`  og: ${(og.length / 1024).toFixed(0)} KB, wide: ${(wide.length / 1024).toFixed(0)} KB`);
}

main();
