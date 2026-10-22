"use client";

/**
 * Muscle-map SVG figure — v4 render ("living statue").
 *
 * Premium layered rendering of one anatomical view (front or back):
 *   1. soft neon aura behind the body (brand-matched, blurred silhouette)
 *   2. outer silhouette with a subtle vertical luminance gradient
 *   3. muscle plates: heat fill + per-plate top-lit "shine" gradient + crisp
 *      background-colored seams (the plate separation premium apps use)
 *   4. anatomical detail strokes (clavicle, abs cuts, quad sweep, spine,
 *      face/hands/feet statue ink — v7 anatomy)
 *   5. weighted-set (or volume) badge with halo strokes — text adapts to the
 *      active metric and auto-fits long numbers
 *
 * Heat fills resolve from the design-system tokens --heat-0..4 (oklch) via
 * getComputedStyle after mount — hex fallbacks per theme keep the very
 * first paint identical. The palette is brand-harmonized: untouched navy →
 * brand cyan → brand mint → amber → vivid red.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { haptic } from "@/lib/haptics";
import { useFormat, useI18n } from "@/lib/i18n";
import type { HeatLevel } from "@/lib/logic/heatmap";
import {
  BADGE_ANCHORS,
  BACK_AXIS,
  BACK_REGIONS,
  FRONT_AXIS,
  FRONT_BADGE_OVERRIDES,
  FRONT_REGIONS,
  SILHOUETTE_D,
  ARM_D,
  FRONT_DETAILS,
  BACK_DETAILS,
} from "./anatomy";

export type FigureView = "front" | "back";

export interface FigureLevelInfo {
  level: HeatLevel;
  weightedSets: number;
  /** raw volume in kg — used when the badge shows the volume metric */
  volume?: number;
}

/**
 * All-badges anchor overrides. Badges are rendered on EVERY plate (the
 * sets/volume toggle must visibly transform the whole figure), and two
 * shoulder plates collide in each view: front_delts (dx 31.5, y 100) sits
 * 4 units from side_delts (35.5, 98), rear_delts (34.5, 99) 21.5 units
 * from upper_back (13, 96) — wide volume pills overlap. Both delt plates
 * exist on BOTH body halves, so one delt badge per side keeps each badge
 * on its own muscle while removing the collision for any pill width.
 */
const ALL_BADGE_OVERRIDES: Record<FigureView, Record<string, { dx: number; y: number }>> = {
  front: { front_delts: { dx: -31.5, y: 100 } },
  back: { rear_delts: { dx: -34.5, y: 99 } },
};

export interface FigureProps {
  view: FigureView;
  /** per-svgId heat data — a missing svgId renders as level 0 */
  levels: Record<string, FigureLevelInfo>;
  /** currently highlighted svgId (accent stroke) */
  selected?: string;
  onSelect: (svgId: string) => void;
  /** localized muscle names per svgId, used for aria-labels */
  names?: Record<string, string>;
  /** whole-figure accessible name (screen passes t("muscles.a11y.figure")) */
  ariaLabel?: string;
  /**
   * Formats the number drawn on every muscle badge. Receives the muscle's
   * live info — the parent decides sets vs volume + units, so the metric
   * toggle is REAL: every badge reflects what the user asked to see.
   */
  badgeText?: (info: FigureLevelInfo) => string;
  /** zero test for the active metric — muted pill styling (default: sets). */
  zeroWhen?: (info: FigureLevelInfo) => boolean;
}

/**
 * Hex fallbacks approximating the oklch --heat-0..4 tokens (index = level).
 * Dark: untouched navy → brand cyan → brand mint → amber → vivid red.
 */
export const HEAT_FALLBACK_DARK: readonly string[] = [
  "#31404f", // 0 untouched — a shade lighter than the body: every muscle reads
  "#4fb9cd", // 1 below target — brand cyan
  "#4fd39a", // 2 on target — brand mint
  "#e8b64e", // 3 high load — amber
  "#d5583c", // 4 overload — vivid red
];
export const HEAT_FALLBACK_LIGHT: readonly string[] = [
  "#cdd5e0", // 0 untouched — reads against the light body
  "#3fa8bd", // 1 below target — deep cyan (AA on light)
  "#2fae74", // 2 on target — green
  "#c99034", // 3 high load — deep amber
  "#c23f46", // 4 overload — deep red
];

function resolveHeatColors(light: boolean): string[] {
  const fallback = light ? HEAT_FALLBACK_LIGHT : HEAT_FALLBACK_DARK;
  if (typeof window === "undefined") return [...fallback];
  try {
    const style = getComputedStyle(document.documentElement);
    return fallback.map((hex, i) => style.getPropertyValue(`--heat-${i}`).trim() || hex);
  } catch {
    return [...fallback];
  }
}

/**
 * Heat palette shared by the figure + legend: design tokens once mounted,
 * hex fallbacks before that, re-resolved when the theme flips.
 *
 * v1.13 fix: next-themes applies the html class change in ITS effect, which
 * runs AFTER this component's effect (child effects first) — so reading the
 * CSS variables right inside the effect caught the PREVIOUS theme and the
 * figure kept stale colors after a theme flip. A MutationObserver on the
 * html class re-resolves the instant the class actually lands, regardless
 * of effect ordering.
 */
export function useHeatColors(): string[] {
  const { resolvedTheme } = useTheme();
  const [palette, setPalette] = useState<string[]>(() => [...HEAT_FALLBACK_DARK]);
  useEffect(() => {
    const resolve = () =>
      setPalette(resolveHeatColors(resolvedTheme === "light"));
    resolve();
    const mo = new MutationObserver(resolve);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [resolvedTheme]);
  return palette;
}

/**
 * Per-view cropped viewBox. The figure spans ~96×400 units around its axis
 * (front 12..108, back 132..228) — identical scale between views.
 */
const FIGURE_BOX = {
  front: { x: 8, y: 6, w: 104, h: 402 },
  back: { x: 128, y: 6, w: 104, h: 402 },
} as const;

export function Figure({
  view,
  levels,
  selected,
  onSelect,
  names,
  ariaLabel,
  badgeText,
  zeroWhen,
}: FigureProps) {
  const { t } = useI18n();
  const fmt = useFormat();
  const palette = useHeatColors();

  const axis = view === "front" ? FRONT_AXIS : BACK_AXIS;
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  const details = view === "front" ? FRONT_DETAILS : BACK_DETAILS;
  const box = FIGURE_BOX[view];
  const silhouette = SILHOUETTE_D[view];
  const arms = ARM_D[view];

  const defsId = useMemo(
    () => `fig-${view}-${Math.random().toString(36).slice(2, 8)}`,
    [view]
  );

  const select = (svgId: string) => {
    haptic("light");
    onSelect(svgId);
  };

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      role="group"
      aria-label={ariaLabel ?? t("muscles.a11y.figure")}
      className="mx-auto block h-full w-full select-none"
    >
      <defs>
        {/* body surface: theme-aware solid base (see --figure-body in globals.css) */}
        {/* top-light overlay for volume (subtle in light mode) */}
        <linearGradient id={`${defsId}-shine-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(1 0 0 / 32%)" />
          <stop offset="45%" stopColor="oklch(1 0 0 / 8%)" />
          <stop offset="100%" stopColor="oklch(0 0 0 / 18%)" />
        </linearGradient>
        {/* muscle-plate convexity — per-plate radial volume (auto-bbox): highlight
            above center, shadow at the rim → every plate reads as a bulging 3D mass */}
        <radialGradient id={`${defsId}-vol`} cx="50%" cy="32%" r="74%">
          <stop offset="0%" stopColor="oklch(1 0 0 / 38%)" />
          <stop offset="42%" stopColor="oklch(1 0 0 / 12%)" />
          <stop offset="78%" stopColor="oklch(0 0 0 / 0%)" />
          <stop offset="100%" stopColor="oklch(0 0 0 / 22%)" />
        </radialGradient>
        {/* neon aura behind the figure (brand cyan→mint) */}
        <filter id={`${defsId}-aura`} x="-40%" y="-15%" width="180%" height="130%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* 1 — brand aura: blurred body glow (torso + arms) */}
      <g aria-hidden>
        <path
          d={silhouette}
          fill="var(--grad-from)"
          opacity={0.16}
          filter={`url(#${defsId}-aura)`}
        />
        <path
          d={arms}
          fill="var(--grad-from)"
          opacity={0.14}
          filter={`url(#${defsId}-aura)`}
        />
        <path
          d={silhouette}
          fill="var(--grad-to)"
          opacity={0.1}
          filter={`url(#${defsId}-aura)`}
          transform={`translate(${view === "front" ? 3 : -3}, 2)`}
        />
      </g>

      {/* 2 — body surface: torso + arms — solid, clearly readable form */}
      <g aria-hidden>
        <path d={silhouette} fill="var(--figure-body)" className="stroke-foreground/35" strokeWidth={1.1} strokeLinejoin="round" />
        <path d={arms} fill="var(--figure-body)" className="stroke-foreground/35" strokeWidth={1} strokeLinejoin="round" />
        <path d={silhouette} fill={`url(#${defsId}-shine-body)`} style={{ mixBlendMode: "overlay" }} />
        <path d={arms} fill={`url(#${defsId}-shine-body)`} style={{ mixBlendMode: "overlay" }} />
      </g>

      {/* 3 — muscle plates: heat fill + shine overlay + crisp seams */}
      <g>
        {regions.map((region) => {
          const level = levels[region.svgId]?.level ?? 0;
          const isSelected = selected === region.svgId;
          const label = names?.[region.svgId] ?? region.svgId;
          return (
            <g key={region.svgId} className="figure-plate">
              <path
                id={`m-${region.svgId}`}
                data-muscle={region.svgId}
                data-level={level}
                d={region.d}
                role="button"
                tabIndex={0}
                aria-label={`${label} — ${t(`muscles.legend.l${level}`)}`}
                fill={palette[level]}
                className="figure-plate__hit cursor-pointer transition-[fill,filter] duration-300 hover:brightness-125 focus-visible:brightness-150 focus:outline-none"
                onClick={() => select(region.svgId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(region.svgId);
                  }
                }}
                style={
                  isSelected
                    ? {
                        stroke: "var(--primary)",
                        strokeWidth: 1.8,
                        strokeLinejoin: "round",
                        filter: `drop-shadow(0 0 3.5px var(--primary))`,
                      }
                    : {
                        stroke: "var(--figure-body)",
                        strokeWidth: 0.9,
                        strokeLinejoin: "round",
                      }
                }
              />
              {/* convex 3D volume overlay (non-interactive) */}
              <path
                d={region.d}
                aria-hidden
                pointerEvents="none"
                fill={`url(#${defsId}-vol)`}
                style={{ mixBlendMode: "overlay" }}
              />
            </g>
          );
        })}
      </g>

      {/* 4a — anatomical SEAM strokes — fiber separations drawn in the seam crease tone
              over the plates (abs cuts, quad grooves, SCM, face statue ink…) so the
              anatomy reads at a glance, exactly like plate-map inking */}
      <g
        aria-hidden
        fill="none"
        stroke="var(--figure-seam)"
        strokeWidth={1.2}
        strokeLinecap="round"
        pointerEvents="none"
      >
        {details.filter((x) => x.seam).map((x, i) => (
          <path key={`seam-${i}`} d={x.d} />
        ))}
      </g>

      {/* 4b — soft ink lines — bone/crease hints beneath the seams (clavicle,
              spine furrow, knee ellipse, shin line, hairline, brow, hands…) */}
      <g
        aria-hidden
        className="text-foreground/20"
        fill="none"
        stroke="currentColor"
        strokeWidth={0.8}
        strokeLinecap="round"
        pointerEvents="none"
      >
        {details.filter((x) => !x.seam).map((x, i) => (
          <path key={`detail-${i}`} d={x.d} />
        ))}
      </g>

      {/* 5 — metric badge on EVERY plate (the sets/volume toggle drives the
             whole figure — the parent formats the number per metric). The
             SELECTED muscle's badge is highlighted (primary fill + glow);
             zero values render as quiet muted pills so the statue stays
             readable while every muscle still reports its number. Long
             volume numbers auto-fit (smaller face + wider pill) and the
             center is clamped inside the viewBox so no pill is ever cut. */}
      {regions.map((region) => {
        const info = levels[region.svgId];
        const baseAnchor = BADGE_ANCHORS[region.svgId];
        const anchor =
          ALL_BADGE_OVERRIDES[view][region.svgId] ??
          (view === "front" ? FRONT_BADGE_OVERRIDES[region.svgId] : undefined) ??
          baseAnchor;
        const isSelected = selected === region.svgId;
        if (!info || !anchor) return null;
        const text =
          badgeText?.(info) ?? fmt.number(info.weightedSets, { maximumFractionDigits: 1 });
        const zero = zeroWhen ? zeroWhen(info) : info.weightedSets <= 0;
        // auto-fit: longer numbers get a slightly smaller face + wider pill
        const len = [...text].length;
        const fontSize = len <= 3 ? 8.5 : len <= 4 ? 7.6 : 6.8;
        const width = Math.max(15, 6.5 + len * (len <= 3 ? 4.9 : 4.3));
        // viewBox clamping — wide volume pills on outer plates (biceps,
        // side_delts) would otherwise render past the figure's crop edge.
        const rawCenter = axis + anchor.dx;
        const maxCenter = box.x + box.w - 2 - width / 2;
        const minCenter = box.x + 2 + width / 2;
        const center = Math.min(maxCenter, Math.max(minCenter, rawCenter));
        return (
          <g key={`${region.svgId}-badge`} aria-hidden>
            {isSelected && (
              <rect
                x={center - width / 2 - 1.4}
                y={anchor.y - 7.9}
                width={width + 2.8}
                height={14.8}
                rx={7.4}
                fill="var(--primary)"
                opacity={0.22}
              />
            )}
            <rect
              x={center - width / 2}
              y={anchor.y - 6.5}
              width={width}
              height={13}
              rx={6}
              fill={isSelected ? "var(--primary)" : "var(--background)"}
              stroke={zero && !isSelected ? "var(--muted-foreground)" : "var(--primary)"}
              strokeWidth={0.7}
              opacity={0.96}
              style={
                isSelected
                  ? { filter: "drop-shadow(0 0 2.5px var(--primary))" }
                  : undefined
              }
            />
            <text
              x={center}
              y={anchor.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              fontWeight={700}
              className={
                isSelected
                  ? "fill-primary-foreground"
                  : zero
                    ? "fill-muted-foreground"
                    : "fill-foreground"
              }
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The anatomical SVG is the heaviest render in the app (16 plates + full ink
 * layer + filters). The parent already passes memoized levels/names/callbacks,
 * so React.memo lets unrelated parent state (sheet toggles, target steppers)
 * skip re-rendering the figure entirely.
 */
export default React.memo(Figure);
