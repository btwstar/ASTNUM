/**
 * Muscle-heat figure → PNG for the home-screen heat widget.
 *
 * The widget must show the REAL muscle heatmap the app shows — same plates,
 * same 5-level brand palette. Rather than porting the anatomy to Java, the
 * web side renders its own figure to a small PNG:
 *
 *   anatomy.ts paths (front + back bodies) → SVG string with per-plate
 *   level fills → Blob → <img> → canvas → PNG base64 → snapshot.heat.image.
 *
 * Rendered in the WebView (client) on demand, cached by a content key so a
 * data mutation that didn't change the map costs zero re-rasterization.
 * Any failure (SSR, headless, unsupported) degrades to has:false — the
 * native widget shows its branded placeholder, never a crash.
 */

import {
  FRONT_REGIONS,
  BACK_REGIONS,
  SILHOUETTE_D,
  ARM_D,
} from "@/components/muscle-map/anatomy";
import { HEAT_FALLBACK_DARK, HEAT_FALLBACK_LIGHT } from "@/components/muscle-map/figure";

/* ── palette resolution (mirrors figure.tsx resolveHeatColors) ────────── */

function heatPalette(light: boolean): string[] {
  const fallback = light ? HEAT_FALLBACK_LIGHT : HEAT_FALLBACK_DARK;
  if (typeof window === "undefined") return [...fallback];
  try {
    const style = getComputedStyle(document.documentElement);
    return fallback.map(
      (hex, i) => style.getPropertyValue(`--heat-${i}`).trim() || hex
    );
  } catch {
    return [...fallback];
  }
}

function bodyColors(light: boolean): { fill: string; stroke: string } {
  const dark = { fill: "#151E36", stroke: "#3A466B" };
  const lite = { fill: "#EEF2F9", stroke: "#B9C3D6" };
  if (typeof window === "undefined") return light ? lite : dark;
  try {
    const style = getComputedStyle(document.documentElement);
    const fill = style.getPropertyValue("--figure-body").trim();
    return fill ? { fill, stroke: light ? "#B9C3D6" : "#3A466B" } : light ? lite : dark;
  } catch {
    return light ? lite : dark;
  }
}

/* ── SVG assembly ────────────────────────────────────────────────────── */

interface HeatMuscleEntry {
  svgId: string;
  level: number;
  volume: number;
  weightedSets: number;
}

function plate(rid: string, d: string, fill: string, stroke: string): string {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round" data-m="${rid}"/>`;
}

/**
 * Build the dual-view heat SVG (front 8..112, back 128..232 → viewBox 8 6 224 402).
 * `levels` maps svgId → 0..4. Body silhouettes/arms paint under the plates.
 */
function buildHeatSvg(muscles: HeatMuscleEntry[], light: boolean): string {
  const palette = heatPalette(light);
  const body = bodyColors(light);
  const levelOf = new Map(muscles.map((m) => [m.svgId, m.level] as const));
  const fillFor = (svgId: string) =>
    palette[Math.max(0, Math.min(4, levelOf.get(svgId) ?? 0))];

  let paths = "";
  for (const view of ["front", "back"] as const) {
    const silhouette = SILHOUETTE_D[view];
    const arms = ARM_D[view];
    paths += plate("body", silhouette, body.fill, body.stroke);
    if (arms) paths += plate("arms", arms, body.fill, body.stroke);
    const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
    for (const r of regions) paths += plate(r.svgId, r.d, fillFor(r.svgId), body.stroke);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 6 224 402" width="448" height="804">` +
    `<rect x="8" y="6" width="224" height="402" fill="none"/>${paths}</svg>`
  );
}

/* ── rasterization + cache ───────────────────────────────────────────── */

let cacheKey = "";
let cachePng = "";

/** A cheap fingerprint of everything the image depends on. */
function cacheFingerprint(muscles: HeatMuscleEntry[], light: boolean): string {
  const lv = muscles
    .map((m) => `${m.svgId}:${Math.min(4, Math.max(0, m.level))}`)
    .sort()
    .join(",");
  return `${lv}|${light ? "L" : "D"}`;
}

/** SVG string → PNG base64 (no prefix). null on any failure/timeout. */
function rasterize(svg: string, w: number, h: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const timer = window.setTimeout(() => resolve(null), 2500);
    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d");
          ctx.drawImage(img, 0, 0, w, h);
          const data = canvas.toDataURL("image/png");
          resolve(data.startsWith("data:image/png;base64,") ? data.slice(22) : null);
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
          window.clearTimeout(timer);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        window.clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Renders (or reuses from cache) the heat PNG. null → widget placeholder. */
export async function renderHeatImage(
  muscles: HeatMuscleEntry[],
  light: boolean
): Promise<string | null> {
  const key = cacheFingerprint(muscles, light);
  if (key === cacheKey && cachePng) return cachePng;
  const png = await rasterize(buildHeatSvg(muscles, light), 448, 804);
  if (png) {
    cacheKey = key;
    cachePng = png;
  }
  return png;
}
