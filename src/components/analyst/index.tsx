"use client";

/**
 * ASTNUM — الإحصائيات / Statistics (v1.10: stat TILES — a stable grid, zero flicker).
 *
 * Full-screen bottom Sheet (92vh) controlled by the store
 * (analystOpen / setAnalystOpen). Every number about the user's OWN data —
 * "كم رفعت اليوم؟ كم كيلو زدت؟ كم مهمة أنجزت؟" — rendered instantly as a
 * STAT TILE in a two-column grid, deterministic and 100% offline
 * (GET /api/analyst → pure @/lib/logic/analyst engine).
 *
 * UX contract (user-specified): the board is a grid of SQUARE tiles —
 * NO dismiss buttons, NO hiding, NO restoring: every stat is always
 * visible, always in the same place, always stable (nothing ever
 * appears/disappears). Stats carrying a breakdown bar set span the full
 * row so the bars keep breathing room. Category chips narrow the grid.
 * No consent gate, no quota, no network model — just math.
 * No questions, no judgment: only what you DID.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  ChartNoAxesCombined,
  Dumbbell,
  ListChecks,
  PersonStanding,
  SquareCheckBig,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, useFormat } from "@/lib/i18n";
import { useAppStore } from "@/lib/store/app-store";
import { apiGet } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type {
  AnalystBreakdownBar,
  AnalystCategory,
  AnalystInsight,
  AnalystUnit,
} from "@/lib/logic/analyst";

/* ────────────────────────── data ────────────────────────────── */

interface AnalystResponse {
  insights: AnalystInsight[];
}

const CATEGORY_ORDER: AnalystCategory[] = [
  "gym",
  "habits",
  "tasks",
  "body",
  "nutrition",
];

const CATEGORY_ICON: Record<AnalystCategory, React.ElementType> = {
  gym: Dumbbell,
  habits: SquareCheckBig,
  tasks: ListChecks,
  body: PersonStanding,
  nutrition: UtensilsCrossed,
};

function unitKey(unit: AnalystUnit): string | null {
  switch (unit) {
    case "kg":
      return "analyst.unit.kg";
    case "sets":
      return "analyst.unit.sets";
    case "kcal":
      return "analyst.unit.kcal";
    case "g":
      return "analyst.unit.g";
    case "pct":
      return "analyst.unit.pct";
    case "day":
      return "analyst.unit.day";
    case "week":
      return "analyst.unit.week";
    default:
      return null; // count / null → the bare number says it all
  }
}

/* ─────────────────────── stat tile ─────────────────────────── */

function TrendChip({ insight }: { insight: AnalystInsight }) {
  const { t } = useI18n();
  const fmt = useFormat();
  if (!insight.trend) return null;
  const Icon =
    insight.trend === "up" ? TrendingUp : insight.trend === "down" ? TrendingDown : Activity;
  const tone =
    insight.trend === "up"
      ? "bg-success/12 text-success"
      : insight.trend === "down"
        ? "bg-danger/12 text-danger"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`tnum flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {insight.trendPct !== undefined && insight.trend !== "flat" && insight.trendPct !== 0
        ? `${insight.trendPct > 0 ? "+" : ""}${fmt.number(insight.trendPct)}%`
        : t("analyst.trend.flat")}
    </span>
  );
}

function BreakdownBars({ bars }: { bars: AnalystBreakdownBar[] }) {
  const { t } = useI18n();
  const fmt = useFormat();
  return (
    <div className="mt-2.5 flex flex-col gap-1.5" role="img" aria-label="breakdown">
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] font-medium text-foreground/90">
              {bar.nameKey ? t(bar.nameKey) : bar.name}
            </span>
            <span className="tnum shrink-0 text-[11px] text-muted-foreground">
              {fmt.number(bar.value)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${i === 0 ? "bg-gradient-accent" : "bg-primary/45"}`}
              style={{ width: `${Math.max(4, Math.round(bar.ratio * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatTile({ insight, index }: { insight: AnalystInsight; index: number }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const CatIcon = CATEGORY_ICON[insight.category];
  const unit = unitKey(insight.unit);
  // breakdown stats (top muscle / consistency / total completions) span the
  // full row so their bars keep breathing room — everything else is a square
  const breakdown =
    insight.breakdown && insight.breakdown.length > 0 ? insight.breakdown : null;
  const wide = breakdown !== null;

  // context params: numbers formatted, the one date param humanized
  const params = useMemo(() => {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(insight.params)) {
      if (k === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        out[k] = fmt.date(`${v}T00:00:00`);
      } else if (typeof v === "number") {
        out[k] = fmt.number(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }, [insight.params, fmt]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: Math.min(index * 0.03, 0.24) }}
      className={`card-hi rounded-2xl border border-border/70 bg-card p-3.5 ${wide ? "col-span-2" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <CatIcon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="min-w-0 text-xs font-semibold leading-snug text-foreground/80">
          {t(insight.labelKey)}
        </p>
      </div>

      {insight.hasData && insight.value !== null ? (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-x-1.5 gap-y-1">
            <span className="tnum text-2xl font-extrabold leading-none text-foreground">
              {insight.unit === "kg" && insight.value < 0 ? "−" : ""}
              {fmt.number(Math.abs(insight.value))}
            </span>
            {unit && (
              <span className="pb-0.5 text-xs font-semibold text-muted-foreground">
                {t(unit)}
              </span>
            )}
            <span className="pb-0.5">
              <TrendChip insight={insight} />
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {t(insight.detailKey, params)}
          </p>
          {breakdown && <BreakdownBars bars={breakdown} />}
        </>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
          {t("analyst.noData")}
        </p>
      )}
    </motion.article>
  );
}

/* ────────────────────────── overlay ─────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 px-5 py-5" aria-busy="true">
      <div className="flex gap-1.5">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={`h-32 rounded-2xl ${i % 3 === 0 ? "col-span-2" : ""}`} />
        ))}
      </div>
    </div>
  );
}

export default function AnalystOverlay() {
  const analystOpen = useAppStore((s) => s.analystOpen);
  const setAnalystOpen = useAppStore((s) => s.setAnalystOpen);
  const { t, lang } = useI18n();

  // stay mounted ~380ms while closing so the Sheet exit animation finishes
  const [exiting, setExiting] = useState(false);
  const render = analystOpen || exiting;

  const handleOpenChange = (open: boolean) => {
    setAnalystOpen(open);
    if (!open) {
      setExiting(true);
      window.setTimeout(() => setExiting(false), 380);
    } else {
      setExiting(false);
    }
  };

  const [filter, setFilter] = useState<"all" | AnalystCategory>("all");

  const query = useQuery({
    queryKey: ["analyst", lang],
    enabled: render,
    queryFn: () => apiGet<AnalystResponse>(`/api/analyst?lang=${lang}`),
    staleTime: 30_000,
  });

  const insights = useMemo(() => query.data?.insights ?? [], [query.data]);
  const visibleInsights = useMemo(
    () => insights.filter((i) => filter === "all" || i.category === filter),
    [insights, filter]
  );

  if (!render) return null;

  return (
    <Sheet open={analystOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        showCloseButton={false}
        className="inset-x-0 bottom-0 mx-auto flex h-[92vh] max-w-md flex-col gap-0 overflow-hidden rounded-t-3xl border-t border-border bg-background p-0 pb-safe"
      >
        {/* drag handle */}
        <div
          aria-hidden
          className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
        />

        {/* header */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-accent text-primary-foreground shadow-lg shadow-primary/25"
          >
            <ChartNoAxesCombined className="h-5.5 w-5.5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg font-bold leading-none">
              {t("analyst.title")}
            </SheetTitle>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            <Zap className="h-3 w-3" aria-hidden />
            {t("analyst.instant")}
          </span>
        </div>

        {/* body */}
        {query.isPending && query.isFetching ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-sm text-muted-foreground">{t("state.errorGeneric")}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="min-h-11 rounded-xl bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              {t("action.retry")}
            </button>
          </div>
        ) : (
          <div className="slim-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-1">
            {/* category filter — narrows the tile grid */}
            <div
              className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 bg-background/95 px-1 pb-2 pt-1 backdrop-blur"
              role="tablist"
              aria-label={t("analyst.categories")}
            >
              {(["all", ...CATEGORY_ORDER] as const).map((cat) => {
                const active = filter === cat;
                const Icon = cat === "all" ? ChartNoAxesCombined : CATEGORY_ICON[cat];
                const labelKey = cat === "all" ? "analyst.category.all" : `analyst.category.${cat}`;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      haptic("light");
                      setFilter(cat);
                    }}
                    className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow"
                        : "bg-muted/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>

            {/* the tile grid — every stat, grouped by category when "all".
                Nothing is dismissable: tiles are stable, same place, no flicker. */}
            {visibleInsights.length === 0 ? (
              <p className="px-2 pt-1 text-center text-[13px] leading-relaxed text-muted-foreground/70">
                {t("analyst.noData")}
              </p>
            ) : filter === "all" ? (
              CATEGORY_ORDER.map((cat) => {
                const group = visibleInsights.filter((i) => i.category === cat);
                if (group.length === 0) return null;
                const Icon = CATEGORY_ICON[cat];
                return (
                  <section key={cat} aria-label={t(`analyst.category.${cat}`)}>
                    <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {t(`analyst.category.${cat}`)}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {group.map((insight, i) => (
                        <StatTile key={insight.id} insight={insight} index={i} />
                      ))}
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {visibleInsights.map((insight, i) => (
                  <StatTile key={insight.id} insight={insight} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
