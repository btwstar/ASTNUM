"use client";

/**
 * خريطة العضلات / Muscle map screen (v1.13 “living statue”).
 *
 * Live heatmap of training load spread over the 15 canonical muscles:
 *   - NO insight/summary card (v1.12 user request: removed entirely for
 *     empty AND data periods — the map, legend, list and detail sheet carry
 *     all the data; the only card left under the title is the functional
 *     load-error alert with its retry button)
 *   - front/back anatomical figure (Figure) with per-muscle heat fills
 *   - 7/30-day window, sets/volume metric, 5-level legend
 *   - accessible list of all 15 muscles (never color-only)
 *   - bottom detail sheet: animated weighted-sets number, volume line,
 *     last-trained, level, suggested exercises, weekly-target stepper.
 *   - v1.13: the figure auto-fits the space above the bottom nav (lower
 *     plates used to sit behind it — untappable at first sight); the FAB
 *     opens the most-neglected muscle (focus suggestion); the sets/volume
 *     toggle now drives the on-figure badge + legend note too.
 *
 * Data: GET /api/muscles/load?days=7|30, GET /api/muscles,
 *       GET /api/muscles/[id]/exercises, PATCH /api/muscles/targets.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  CircleCheck,
  CircleSlash,
  Dumbbell,
  Flame,
  History,
  Lightbulb,
  Minus,
  Plus,
  RefreshCw,
  Target,
  TrendingDown,
} from "lucide-react";

import { apiGet, apiPatch } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useFormat, useI18n, type TranslateParams } from "@/lib/i18n";
import { useAppStore, type WeightUnit } from "@/lib/store/app-store";
import { diffDaysBetween } from "@/lib/logic/heatmap";
import type { HeatLevel } from "@/lib/logic/heatmap";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Figure, useHeatColors, type FigureLevelInfo } from "./figure";

// ───────────────────────── types (API shapes) ─────────────────────────

type ViewMode = "front" | "back";
type PeriodDays = 7 | 30;
type MetricMode = "sets" | "volume";

interface MuscleGroupLite {
  id: string;
  nameAr: string;
  nameEn: string;
  svgId: string;
  region: "front" | "back";
  weeklyTarget: number;
  sortOrder: number;
}

interface MuscleLoadEntry extends MuscleGroupLite {
  rawSets: number;
  weightedSets: number;
  volume: number;
  lastTrainedAt: string | null;
  level: HeatLevel;
}

interface LoadResponse {
  periodDays: number;
  todayKey: string;
  startKey: string;
  muscles: MuscleLoadEntry[];
}

interface GroupsResponse {
  muscles: MuscleGroupLite[];
}

interface MuscleExerciseDTO {
  id: string;
  nameAr: string;
  nameEn: string;
  equipment: string;
  role: "primary" | "secondary";
}

interface ExercisesResponse {
  exercises: MuscleExerciseDTO[];
}

type TFn = (key: string, params?: TranslateParams) => string;

// ───────────────────────── constants ─────────────────────────

const LB_PER_KG = 2.2046226218;
const TARGET_MIN = 4;
const TARGET_MAX = 40;

/** Icon per heat level — index = level (chip shows icon + label, never color-only). */
const LEVEL_ICONS = [CircleSlash, TrendingDown, CircleCheck, Flame, AlertTriangle] as const;

function displayVolume(volumeKg: number, unit: WeightUnit): number {
  return unit === "lb" ? volumeKg * LB_PER_KG : volumeKg;
}

// ───────────────────────── small building blocks ─────────────────────────

/** Big number that springs from 0 to `value` (≤350ms) and re-runs per key change. */
function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.35, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);
  const text = useTransform(mv, (v) => format(v));
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}

/** Accessible segmented control (radiogroup of pill buttons). */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex h-10 items-center gap-1 rounded-full bg-muted/60 p-1", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              haptic("light");
              onChange(opt.value);
            }}
            className={cn(
              "h-8 min-w-14 flex-1 rounded-full px-2 text-xs font-medium transition-all duration-200",
              active
                ? "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/40"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Level pill: icon + localized label + heat color (never color-only). */
function LevelChip({ level, t, color }: { level: HeatLevel; t: TFn; color: string }) {
  const Icon = LEVEL_ICONS[level];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon aria-hidden className="h-3 w-3" style={{ color }} />
      {t(`muscles.legend.l${level}`)}
    </span>
  );
}

// ───────────────────────── screen ─────────────────────────

export function MuscleMapScreen() {
  const { t, lang, dict } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();
  const weightUnit = useAppStore((s) => s.weightUnit);
  const palette = useHeatColors();

  const [view, setView] = useState<ViewMode>("front");
  const [days, setDays] = useState<PeriodDays>(7);
  const [mode, setMode] = useState<MetricMode>("sets");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── v1.13: auto-fit figure height — the space between the figure top and
  // the fixed bottom nav. Previously min(62vh,560px): on phones the lower
  // plates (quads/calves) rendered BEHIND the nav — invisible and, worse,
  // untappable because the nav swallowed the touch. Measured in DOCUMENT
  // coordinates (scroll-proof), re-measured on resize.
  const figureWrapRef = useRef<HTMLDivElement>(null);
  const [figureH, setFigureH] = useState<number | null>(null);
  useEffect(() => {
    const el = figureWrapRef.current;
    if (!el) return;
    const compute = () => {
      const nav = document.querySelector("nav");
      if (!nav) return;
      const navTopDoc = window.scrollY + nav.getBoundingClientRect().top;
      const figTopDoc = window.scrollY + el.getBoundingClientRect().top;
      const avail = navTopDoc - figTopDoc - 10;
      const h = Math.min(540, Math.max(200, Math.round(avail)));
      setFigureH((prev) => (prev === null || Math.abs(prev - h) > 2 ? h : prev));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const loadQuery = useQuery({
    queryKey: ["muscles-load", days],
    queryFn: () => apiGet<LoadResponse>(`/api/muscles/load?days=${days}`),
    // keep the previous period's data while switching 7 ↔ 30 (no skeleton flash)
    placeholderData: (prev) => prev,
  });
  const groupsQuery = useQuery({
    queryKey: ["muscle-groups"],
    queryFn: () => apiGet<GroupsResponse>("/api/muscles"),
    staleTime: 5 * 60_000,
  });

  // Load results when available; degrade to the static group list (all level 0)
  // when the aggregation fails so the map never disappears.
  const muscles = useMemo<readonly MuscleLoadEntry[] | undefined>(() => {
    if (loadQuery.data?.muscles) return loadQuery.data.muscles;
    if (groupsQuery.data?.muscles) {
      return groupsQuery.data.muscles.map((g) => ({
        ...g,
        rawSets: 0,
        weightedSets: 0,
        volume: 0,
        lastTrainedAt: null,
        level: 0 as HeatLevel,
      }));
    }
    return undefined;
  }, [loadQuery.data, groupsQuery.data]);

  const degraded = !loadQuery.data?.muscles && Boolean(loadQuery.isError);
  const isLoading = loadQuery.isPending && !muscles;
  const periodDays = loadQuery.data?.periodDays ?? days;
  const todayKey = loadQuery.data?.todayKey ?? fmt.todayKey();

  const nameOf = useCallback(
    (m: { nameAr: string; nameEn: string }) => (lang === "ar" ? m.nameAr : m.nameEn),
    [lang]
  );

  // ── derived data ──
  const byId = useMemo(() => {
    const out: Record<string, MuscleLoadEntry> = {};
    for (const m of muscles ?? []) out[m.id] = m;
    return out;
  }, [muscles]);

  const figureLevels = useMemo(() => {
    const out: Record<string, FigureLevelInfo> = {};
    for (const m of muscles ?? []) out[m.svgId] = { level: m.level, weightedSets: m.weightedSets, volume: m.volume };
    return out;
  }, [muscles]);

  const figureNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of muscles ?? []) out[m.svgId] = nameOf(m);
    return out;
  }, [muscles, nameOf]);

  const selected = openId ? (byId[openId] ?? null) : null;
  const selectedSvgId = selected?.svgId;

  const periodLabel = t("muscles.period.days", {
    count: periodDays,
    days: fmt.number(periodDays),
  });

  /** Badge number follows the active metric — the sets/volume toggle is real.
   *  Volume pills stay pill-sized: ≥ 10,000 renders in compact notation
   *  (locale-aware "١٢٫٣ ألف" / "12.3K") instead of a 7-digit monster. */
  const badgeText = useCallback(
    (info: FigureLevelInfo) =>
      mode === "volume"
        ? fmt.number(displayVolume(info.volume ?? 0, weightUnit), {
            ...(displayVolume(info.volume ?? 0, weightUnit) >= 10000
              ? { notation: "compact" as const, maximumFractionDigits: 1 }
              : { maximumFractionDigits: 0 }),
          })
        : fmt.number(info.weightedSets, { maximumFractionDigits: 1 }),
    [mode, fmt, weightUnit]
  );

  /** zero test for the active metric (muted pill on the figure). */
  const badgeZeroWhen = useCallback(
    (info: FigureLevelInfo) =>
      mode === "volume" ? (info.volume ?? 0) <= 0 : info.weightedSets <= 0,
    [mode]
  );

  /** biggest muscle volume this period — the volume-mode list bar scale. */
  const maxVolume = useMemo(
    () => Math.max(1, ...(muscles ?? []).map((m) => m.volume)),
    [muscles]
  );

  // ── actions ──
  const openMuscle = useCallback((muscleId: string) => {
    setOpenId(muscleId);
    setSheetOpen(true);
  }, []);

  const handleFigureSelect = useCallback(
    (svgId: string) => {
      const m = muscles?.find((x) => x.svgId === svgId);
      if (m) openMuscle(m.id);
    },
    [muscles, openMuscle]
  );

  const retryLoad = useCallback(() => {
    haptic("light");
    void loadQuery.refetch();
    void groupsQuery.refetch();
  }, [loadQuery, groupsQuery]);

  // ── v1.13: FAB focus suggestion — the shell FAB broadcasts "astnum:fab"
  // (same contract as habits/notes/gym). While the muscles sub-tab is
  // mounted, the press opens the most-neglected muscle: lowest done/target
  // ratio, ties by longest-since-trained. The FAB used to do literally
  // nothing here. setState inside the event handler is idiomatic — no
  // signal-prop effect needed.
  const openFocusMuscle = useCallback(() => {
    if (!muscles || muscles.length === 0) return;
    const scored = [...muscles]
      .map((m) => {
        const expected = (m.weeklyTarget * periodDays) / 7 || 1;
        return {
          m,
          ratio: m.weightedSets / expected,
          last: m.lastTrainedAt ? Date.parse(m.lastTrainedAt) : 0,
        };
      })
      .sort((a, b) => (a.ratio !== b.ratio ? a.ratio - b.ratio : a.last - b.last));
    const pick = scored[0]?.m;
    if (!pick) return;
    haptic("light");
    setView(pick.region);
    setOpenId(pick.id);
    setSheetOpen(true);
    toast(t("muscles.fab.focus", { name: nameOf(pick) }), { icon: "🎯" });
  }, [muscles, periodDays, t, nameOf]);

  useEffect(() => {
    const onFab = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab === "body" || tab === "body-muscles") openFocusMuscle();
    };
    window.addEventListener("astnum:fab", onFab);
    return () => window.removeEventListener("astnum:fab", onFab);
  }, [openFocusMuscle]);

  // ── sheet data + target stepper ──
  const exQuery = useQuery({
    queryKey: ["muscle-exercises", openId],
    queryFn: () => apiGet<ExercisesResponse>(`/api/muscles/${openId ?? ""}/exercises`),
    enabled: sheetOpen && Boolean(openId),
    staleTime: 60_000,
  });

  const targetMutation = useMutation({
    mutationFn: (patch: { muscleId: string; weeklyTarget: number }) =>
      apiPatch<{ muscle: MuscleGroupLite }>("/api/muscles/targets", patch),
    onSuccess: () => {
      haptic("success");
      void qc.invalidateQueries({ queryKey: ["muscles-load"] });
      void qc.invalidateQueries({ queryKey: ["muscle-groups"] });
    },
    onError: () => toast.error(t("muscles.error.target")),
  });

  const shownTarget =
    targetMutation.isPending && targetMutation.variables
      ? targetMutation.variables.weeklyTarget
      : (selected?.weeklyTarget ?? 0);

  const stepTarget = useCallback(
    (delta: number) => {
      if (!selected) return;
      const next = Math.min(TARGET_MAX, Math.max(TARGET_MIN, selected.weeklyTarget + delta));
      if (next === selected.weeklyTarget) return;
      haptic("light");
      targetMutation.mutate({ muscleId: selected.id, weeklyTarget: next });
    },
    [selected, targetMutation]
  );

  // ───────────────────────── render ─────────────────────────

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3 pb-10 pt-1">
      <header className="text-center">
        <h1 className="text-lg font-bold">{t("muscles.title")}</h1>
      </header>

      {/* functional load-error alert — the ONLY card under the title */}
      {degraded && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3"
        >
          <p className="text-sm text-foreground">{t("muscles.error.load")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={retryLoad}
            className="gap-1.5 rounded-full"
          >
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            {t("action.retry")}
          </Button>
        </div>
      )}

      {/* controls — one compact row: view · period · metric */}
      <div className="flex items-stretch gap-1.5">
        <Segmented
          ariaLabel={t("muscles.view.label")}
          value={view}
          onChange={setView}
          options={[
            { value: "front" as ViewMode, label: t("muscles.view.front") },
            { value: "back" as ViewMode, label: t("muscles.view.back") },
          ]}
          className="flex-1"
        />
        <Segmented
          ariaLabel={t("muscles.period.label")}
          value={days}
          onChange={setDays}
          options={[
            {
              value: 7 as PeriodDays,
              label: t("muscles.period.days", { count: 7, days: fmt.number(7) }),
            },
            {
              value: 30 as PeriodDays,
              label: t("muscles.period.days", { count: 30, days: fmt.number(30) }),
            },
          ]}
          className="flex-1"
        />
        <Segmented
          ariaLabel={t("muscles.mode.label")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "sets" as MetricMode, label: t("muscles.mode.sets") },
            { value: "volume" as MetricMode, label: t("muscles.mode.volume") },
          ]}
          className="flex-1"
        />
      </div>

      {/* anatomical figure — auto-fitted to the space above the bottom nav */}
      <div
        ref={figureWrapRef}
        className={cn("mx-auto w-full max-w-[320px]", figureH === null && "h-[min(56vh,520px)]")}
        style={figureH !== null ? { height: `${figureH}px` } : undefined}
      >
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-3xl" />
        ) : (
          <Figure
            view={view}
            levels={figureLevels}
            selected={selectedSvgId}
            onSelect={handleFigureSelect}
            names={figureNames}
            badgeText={badgeText}
            zeroWhen={badgeZeroWhen}
            ariaLabel={t("muscles.a11y.figure")}
          />
        )}
      </div>

      {/* legend */}
      <div aria-hidden>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          {[0, 1, 2, 3, 4].map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[lv] }} />
              {t(`muscles.legend.l${lv}`)}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/80">
          {mode === "volume"
            ? t("muscles.legend.noteVolume", { unit: t(`unit.${weightUnit}`) })
            : t("muscles.legend.note")}
        </p>
      </div>

      {/* accessible list — all 15 muscles, grouped by view region */}
      <section aria-labelledby="muscles-list-title" className="mt-1">
        <h2 id="muscles-list-title" className="text-sm font-semibold">
          {t("muscles.list.title")}
        </h2>
        {isLoading ? (
          <div className="mt-3 flex flex-col gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          (["front", "back"] as const).map((region) => {
            const rows = (muscles ?? []).filter((m) => m.region === region);
            if (rows.length === 0) return null;
            return (
              <div key={region} className="mt-3">
                <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`muscles.view.${region}`)}
                </h3>
                <ul className="flex flex-col">
                  {rows.map((m) => {
                    const expected = (m.weeklyTarget * periodDays) / 7;
                    const pct =
                      mode === "volume"
                        ? Math.min(100, (m.volume / maxVolume) * 100)
                        : expected > 0
                          ? Math.min(100, (m.weightedSets / expected) * 100)
                          : 0;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            haptic("light");
                            openMuscle(m.id);
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start transition-colors duration-200 hover:bg-muted/40 focus-visible:bg-muted/60 focus:outline-none"
                        >
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: palette[m.level] }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium">{nameOf(m)}</span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {mode === "volume"
                                  ? t("muscles.list.volumeRow", {
                                      value: fmt.number(
                                        displayVolume(m.volume, weightUnit),
                                        { maximumFractionDigits: 0 }
                                      ),
                                      unit: t(`unit.${weightUnit}`),
                                    })
                                  : t("muscles.list.setsOf", {
                                      done: fmt.number(m.weightedSets, { maximumFractionDigits: 1 }),
                                      target: fmt.number(expected, { maximumFractionDigits: 1 }),
                                    })}
                              </span>
                            </span>
                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full transition-[width] duration-300"
                                style={{ width: `${pct}%`, backgroundColor: palette[m.level] }}
                              />
                            </span>
                          </span>
                          <LevelChip level={m.level} t={t} color={palette[m.level]} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {/* muscle detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88vh] max-w-md rounded-t-3xl border-t-0 px-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="pb-0">
            <span aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/25" />
            <SheetTitle className="text-center text-lg">
              {selected ? nameOf(selected) : ""}
            </SheetTitle>
            <SheetDescription className="text-center text-xs">
              {t("muscles.sheet.periodNote", { period: periodLabel })}
            </SheetDescription>
          </SheetHeader>

          {!selected ? (
            <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
              <Skeleton className="mx-auto h-10 w-32" />
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : (
            <div className="max-h-[62vh] overflow-y-auto px-4 pb-8 pt-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent">
              {/* big animated number — follows the ACTIVE metric; the other
                  metric rides along as a secondary line so the sheet never
                  hides data */}
              <div className="flex flex-col items-center gap-1 pb-1">
                <span className="flex items-baseline justify-center gap-1.5">
                  {mode === "volume" ? (
                    <>
                      <AnimatedNumber
                        key={`${selected.id}-vol`}
                        value={displayVolume(selected.volume, weightUnit)}
                        format={(v) => fmt.number(v, { maximumFractionDigits: 0 })}
                        className="text-4xl font-bold leading-none"
                      />
                      <span className="text-sm font-medium text-muted-foreground">
                        {t(`unit.${weightUnit}`)}
                      </span>
                    </>
                  ) : (
                    <>
                      <AnimatedNumber
                        key={selected.id}
                        value={selected.weightedSets}
                        format={(v) => fmt.number(v, { maximumFractionDigits: 1 })}
                        className="text-4xl font-bold leading-none"
                      />
                      <span className="text-sm text-muted-foreground">
                        {t("muscles.sheet.bigRest", {
                          target: fmt.number((selected.weeklyTarget * periodDays) / 7, {
                            maximumFractionDigits: 1,
                          }),
                        })}
                      </span>
                    </>
                  )}
                </span>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Dumbbell aria-hidden className="h-4 w-4 text-primary" />
                  {mode === "volume" ? (
                    <span>
                      {t("muscles.sheet.volumeSets", {
                        done: fmt.number(selected.weightedSets, { maximumFractionDigits: 1 }),
                        target: fmt.number((selected.weeklyTarget * periodDays) / 7, {
                          maximumFractionDigits: 1,
                        }),
                      })}
                    </span>
                  ) : (
                    <span>
                      <span>{t("muscles.sheet.volumeLabel")}: </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {t("muscles.sheet.volumeValue", {
                          value: fmt.number(displayVolume(selected.volume, weightUnit), {
                            maximumFractionDigits: 0,
                          }),
                          unit: t(`unit.${weightUnit}`),
                        })}
                      </span>
                    </span>
                  )}
                </p>
              </div>

              {/* last trained */}
              <p className="flex items-center justify-center gap-1.5 text-sm">
                <History aria-hidden className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {selected.lastTrainedAt
                    ? t("muscles.sheet.lastTrained", {
                        when:
                          Math.max(0, diffDaysBetween(todayKey, selected.lastTrainedAt)) === 0
                            ? t("muscles.sheet.today")
                            : t("muscles.sheet.daysAgo", {
                                count: Math.max(0, diffDaysBetween(todayKey, selected.lastTrainedAt)),
                                days: fmt.number(
                                  Math.max(0, diffDaysBetween(todayKey, selected.lastTrainedAt))
                                ),
                              }),
                      })
                    : t("muscles.sheet.neverTrained")}
                </span>
              </p>

              {/* level row + recommendation */}
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-muted/50 px-3 py-2.5">
                {(() => {
                  const Icon = LEVEL_ICONS[selected.level];
                  return <Icon aria-hidden className="h-4 w-4" style={{ color: palette[selected.level] }} />;
                })()}
                <span className="text-sm font-medium">
                  {t("muscles.sheet.levelLabel")}: {t(`muscles.legend.l${selected.level}`)}
                </span>
              </div>
              <div className="mt-2 flex items-start gap-1.5 rounded-2xl bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
                <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-start">{t(`muscles.reco.l${selected.level}`)}</span>
              </div>

              {/* suggested exercises */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("muscles.sheet.exercises")}
                </h4>
                {exQuery.isPending ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (exQuery.data?.exercises ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("muscles.sheet.exercisesEmpty")}
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {(exQuery.data?.exercises ?? []).map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {lang === "ar" ? ex.nameAr : ex.nameEn}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              ex.role === "primary"
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {t(`muscles.role.${ex.role}`)}
                          </span>
                          {dict[`gym.equipment.${ex.equipment}`] ? (
                            <span className="text-[10px] text-muted-foreground">
                              {t(`gym.equipment.${ex.equipment}`)}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* weekly target stepper */}
              <div className="mt-4 rounded-2xl bg-muted/50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Target aria-hidden className="h-4 w-4 text-primary" />
                      {t("muscles.sheet.target")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t("muscles.sheet.targetHint")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("muscles.sheet.decreaseTarget")}
                      disabled={shownTarget <= TARGET_MIN || targetMutation.isPending}
                      onClick={() => stepTarget(-1)}
                      className="h-9 w-9 rounded-full"
                    >
                      <Minus aria-hidden />
                    </Button>
                    <span className="w-10 text-center text-xl font-bold tabular-nums">
                      {fmt.number(shownTarget)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("muscles.sheet.increaseTarget")}
                      disabled={shownTarget >= TARGET_MAX || targetMutation.isPending}
                      onClick={() => stepTarget(1)}
                      className="h-9 w-9 rounded-full"
                    >
                      <Plus aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default MuscleMapScreen;
