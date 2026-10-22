/**
 * Custom accent color engine — UNLIMITED colors (v1.5).
 *
 * The custom accent lets the user pick ANY color: a full picker (hue dial +
 * saturation/lightness field + hex code) covers the entire sRGB gamut, and
 * the picked hex is converted here into an OKLCH theme that follows the same
 * lightness/chroma geometry as the built-in presets — so every color
 * (pastel, neon, deep, gray…) stays legible in both dark and light modes.
 *
 * Split of concerns:
 *   • the picker works in HSL/hex (exact, in-gamut, familiar to every user);
 *   • the theme derivation works in OKLCH (perceptual, mode-aware mapping);
 *   • AccentSync (providers.tsx) injects the derived colors as inline custom
 *     properties on <html>; globals.css [data-accent="custom"] performs only
 *     plain var() substitution (no calc() inside color functions — works in
 *     every engine that supports custom properties + oklch).
 *
 * All math is pure, allocation-light and side-effect free.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
} // channels 0..1
export interface Hsl {
  h: number;
  s: number;
  l: number;
} // h 0..360, s/l 0..1
export interface Oklch {
  l: number;
  c: number;
  h: number;
} // l 0..1, c 0..~0.33, h 0..360

/* ── helpers ─────────────────────────────────────────────── */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Wrap any angle into [0, 360). */
const wrapHue = (h: number): number => (((h % 360) + 360) % 360);
/** Round to 3 decimals (lightness/chroma), 1 decimal is enough for hue. */
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const r1 = (v: number): number => Math.round(v * 10) / 10;

/* ── hex ─────────────────────────────────────────────────── */

/** Canonicalize user hex input → "#rrggbb". Accepts "abc", "#abc", "aabbcc",
 *  "#AABBCC" (3-digit expands). Returns null for anything invalid. */
export function normalizeHex(input: string): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  const full = s.length === 3 ? s.split("").map((ch) => ch + ch).join("") : s;
  return "#" + full.toLowerCase();
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const ch = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/* ── HSL (the picker space — covers the full sRGB gamut) ─── */

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = wrapHue(h) / 360;
  if (s <= 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, hue + 1 / 3),
    g: hueToRgb(p, q, hue),
    b: hueToRgb(p, q, hue - 1 / 3),
  };
}

/** hex → HSL (picker position). */
export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(hexToRgb(hex));
}

/** HSL → canonical hex (picker commit). */
export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb(h, clamp01(s), clamp01(l)));
}

/* ── RGB 8-bit channels (the picker's RGB rows) ──────────── */

export interface Rgb255 {
  r: number;
  g: number;
  b: number;
} // channels 0..255 (integers)

/** hex → 8-bit RGB channels (0..255) — the picker's R/G/B inputs & sliders. */
export function hexToRgb255(hex: string): Rgb255 {
  const { r, g, b } = hexToRgb(normalizeHex(hex) ?? DEFAULT_CUSTOM_HEX);
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/** 8-bit RGB channels → canonical hex. Channels are clamped to 0..255. */
export function rgb255ToHex({ r, g, b }: Rgb255): string {
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/* ── OKLCH (the theme space) ─────────────────────────────── */
/* Reference OKLab matrices (Björn Ottosson, css-color-4).   */

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(a, bb), h: wrapHue(Math.atan2(bb, a) * (180 / Math.PI)) };
}

function oklchToRgbRaw(l: number, c: number, h: number): Rgb {
  const rad = wrapHue(h) * (Math.PI / 180);
  const a = Math.cos(rad) * c;
  const b = Math.sin(rad) * c;
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;
  return {
    r: linearToSrgb(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    g: linearToSrgb(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    b: linearToSrgb(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  };
}

/** hex → OKLCH (in-gamut by construction). */
function hexToOklch(hex: string): Oklch {
  return rgbToOklch(hexToRgb(hex));
}

/** OKLCH → hex, gamut-mapped (binary search for the max in-gamut chroma —
 *  the css-color-4 algorithm, simplified for our L∈[0,1] domain). Used only
 *  for the legacy hue migration; user picks are always in-gamut hexes. */
function oklchToHex(l: number, c: number, h: number): string {
  const eps = 1e-4;
  const inGamut = (rgb: Rgb) =>
    rgb.r >= -eps && rgb.r <= 1 + eps && rgb.g >= -eps && rgb.g <= 1 + eps && rgb.b >= -eps && rgb.b <= 1 + eps;
  if (!inGamut(oklchToRgbRaw(l, 0, h))) {
    const z = oklchToRgbRaw(l, 0, h);
    return rgbToHex(z);
  }
  let lo = 0;
  let hi = Math.max(0, c);
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbRaw(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return rgbToHex(oklchToRgbRaw(l, lo, h));
}

/* ── theme derivation ────────────────────────────────────── */

/** The pre-1.5 default custom look (oklch 0.84 0.16 168 → hex), preserved
 *  as the default so existing sessions keep their colors on upgrade. */
export const DEFAULT_CUSTOM_HEX = "#33ebb6";

/** Migrate a legacy (≤ v1.4) OKLCH-hue-only pick to the closest full color —
 *  same lightness/chroma the old CSS derivation used. */
export function migrateLegacyHue(hue: number): string {
  const h = wrapHue(Math.round(hue));
  return oklchToHex(0.84, 0.16, h);
}

export interface CustomThemePalette {
  /** complete palette for the dark (default) mode */
  dark: { primary: string; primaryFg: string; gradFrom: string; gradTo: string; ring: string };
  /** primary surface adjustments for the light mode */
  light: { primary: string; primaryFg: string; gradFrom: string; gradTo: string };
}

export interface CustomTheme extends CustomThemePalette {
  /** Inline custom properties written on <html> by AccentSync for EVERY
   *  accent (so switching to "custom" never flashes). globals.css
   *  [data-accent="custom"] maps them onto the theme tokens. */
  vars: Record<string, string>;
}

/* fg constants — shared with the preset themes in globals.css */
const FG_ON_BRIGHT = "oklch(0.15 0.03 258)"; // dark navy text (every dark preset uses it)
const FG_ON_DEEP = "oklch(0.99 0.005 240)"; // near-white text (base light mode fg)

/**
 * Derive the full custom theme from any hex color.
 *
 * Lightness maps monotonically per mode (user intent darker↔brighter is
 * preserved, each mode stays inside its legible band):
 *   dark:  Ld = 0.40 + 0.52·l   → 0.40…0.92 (vivid over navy surfaces)
 *   light: Ll = 0.26 + 0.42·l   → 0.26…0.68 (deep enough over white)
 * The old default (l≈0.85) lands at Ld 0.84 / Ll 0.61 — the exact v1.4 look.
 * Gradient stops keep the brand geometry: hue +27 / −38, slight L/C deltas.
 */
export function deriveCustomTheme(hexInput: string): CustomTheme {
  const hex = normalizeHex(hexInput) ?? DEFAULT_CUSTOM_HEX;
  const { l, c, h } = hexToOklch(hex);

  const Ld = 0.4 + 0.52 * l;
  const Ll = 0.26 + 0.42 * l;
  const C = Math.min(c, 0.3);

  const ok = (L: number, chroma: number, hue: number) =>
    `oklch(${r3(clamp01(L))} ${r3(Math.max(0, chroma))} ${r1(wrapHue(hue))})`;

  const dark = {
    primary: ok(Ld, C, h),
    // bright accents carry dark navy text; deep picks switch to near-white
    primaryFg: Ld >= 0.58 ? FG_ON_BRIGHT : FG_ON_DEEP,
    gradFrom: ok(Ld - 0.02, C * 0.94, h + 27),
    gradTo: ok(Ld + 0.01, C * 1.06, h - 38),
    ring: `oklch(${r3(Ld)} ${r3(C)} ${r1(wrapHue(h))} / 55%)`,
  };
  const light = {
    primary: ok(Ll, C, h),
    // bright picks get hue-tinted near-black text (amber light does the same)
    primaryFg: Ll >= 0.63 ? `oklch(0.15 0.03 ${r1(wrapHue(h))})` : FG_ON_DEEP,
    gradFrom: ok(Ll + 0.05, C * 0.94, h + 27),
    gradTo: ok(Ll + 0.11, C * 0.94, h - 38),
  };

  return {
    dark,
    light,
    vars: {
      "--custom-primary": dark.primary,
      "--custom-primary-fg": dark.primaryFg,
      "--custom-grad-from": dark.gradFrom,
      "--custom-grad-to": dark.gradTo,
      "--custom-ring": dark.ring,
      "--custom-primary-light": light.primary,
      "--custom-primary-fg-light": light.primaryFg,
      "--custom-grad-from-light": light.gradFrom,
      "--custom-grad-to-light": light.gradTo,
    },
  };
}

/** Gradient preview that matches the applied theme exactly (settings chip). */
export function customSwatchGradient(hexInput: string): string {
  const { dark } = deriveCustomTheme(hexInput);
  return `linear-gradient(135deg, ${dark.gradFrom}, ${dark.gradTo})`;
}

/** Shortest distance between two hue angles, in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(wrapHue(a) - wrapHue(b));
  return Math.min(d, 360 - d);
}
