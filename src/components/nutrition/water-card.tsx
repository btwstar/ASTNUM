"use client";

/**
 * بطاقة الماء / Hydration card — agent W-a (v2.4).
 * One-tap drink logging (+100/+250/+330/+500 presets or a custom amount)
 * against the daily hydration goal (GET /api/nutrition/water), with a slim
 * animated progress bar, the auto-vs-manual goal chip (opens the shared
 * GoalsSheet calculator) and today's drink log with confirm-to-delete.
 * Every mutation invalidates the water + summary queries and pushes the
 * home-screen widget snapshot (lib/widgets/bridge).
 */
import React, { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Coffee,
  CupSoda,
  Droplets,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { pushWidgetSnapshot } from "@/lib/widgets/bridge";
import {
  parseFormulaMeta,
  type DrinkLogRow,
  type DrinkType,
  type Goals,
  type WaterResponse,
} from "@/components/nutrition/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** One-tap glass/bottle presets (same for every drink type). */
const PRESETS_ML = [100, 250, 330, 500] as const;

const DRINK_OPTIONS: Array<{ value: DrinkType; icon: LucideIcon }> = [
  { value: "water", icon: Droplets },
  { value: "juice", icon: CupSoda },
  { value: "other", icon: Coffee },
];

/** Tinted icon chip per drink row (water = sky, juice = amber, other = muted). */
const DRINK_CHIP_CLS: Record<DrinkType, string> = {
  water: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  juice: "bg-warning/15 text-warning",
  other: "bg-muted text-muted-foreground",
};

function isDrinkType(value: string): value is DrinkType {
  return value === "water" || value === "juice" || value === "other";
}

/** Custom-amount validation — mirrors the POST route's 50..3000 ml range. */
function parseAmountMl(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 50 || n > 3000) return null;
  return Math.round(n);
}

export function WaterCard({ date, onOpenGoals }: { date: string; onOpenGoals: () => void }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();

  const unit = t("nutrition.water.unit");
  const fmtMl = useCallback(
    (ml: number) => `${fmt.number(ml)} ${unit}`,
    [fmt, unit]
  );

  const waterQuery = useQuery({
    queryKey: ["nutrition-water", date],
    queryFn: () => apiGet<WaterResponse>(`/api/nutrition/water?date=${date}`),
  });
  // Same cache key the GoalsSheet uses — gives us formulaMeta.waterAuto.
  const goalsQuery = useQuery({
    queryKey: ["nutrition-goals"],
    queryFn: () => apiGet<{ goals: Goals }>("/api/nutrition/goals"),
  });

  const [drink, setDrink] = useState<DrinkType>("water");
  const [customText, setCustomText] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrinkLogRow | null>(null);

  const logs = useMemo(() => waterQuery.data?.logs ?? [], [waterQuery.data]);
  const goalMl = waterQuery.data?.goal.waterMl ?? 0;
  const consumedMl = waterQuery.data?.consumedMl ?? 0;
  const goalReached = goalMl > 0 && consumedMl >= goalMl;
  const progressPct = goalMl > 0 ? Math.min(100, (consumedMl / goalMl) * 100) : 0;
  const remainingMl = goalMl - consumedMl;

  const meta = useMemo(
    () => (goalsQuery.data ? parseFormulaMeta(goalsQuery.data.goals) : null),
    [goalsQuery.data]
  );
  const hasGoal = goalMl > 0;
  // Spec: "Auto" unless the stored meta explicitly opts out (waterAuto === false).
  const isAuto = meta?.waterAuto !== false;

  const refreshWater = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["nutrition-water"] }),
      queryClient.invalidateQueries({ queryKey: ["nutrition-summary"] }),
    ]);
  }, [queryClient]);

  const addDrink = useCallback(
    async (ml: number, type: DrinkType): Promise<boolean> => {
      if (adding) return false;
      setAdding(true);
      try {
        await apiPost("/api/nutrition/water", { date, drink: type, ml });
        haptic("success");
        toast.success(t("nutrition.water.added", { value: fmtMl(ml) }));
        await refreshWater();
        void pushWidgetSnapshot();
        return true;
      } catch (err) {
        haptic("heavy");
        toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
        return false;
      } finally {
        setAdding(false);
      }
    },
    [adding, date, fmtMl, refreshWater, t]
  );

  const submitCustom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ml = parseAmountMl(customText);
    if (ml === null) {
      haptic("heavy");
      toast.error(t("nutrition.water.validation"));
      return;
    }
    void addDrink(ml, drink).then((ok) => {
      if (ok) setCustomText("");
    });
  };

  const confirmDelete = useCallback(async () => {
    const row = deleteTarget;
    if (!row || deletingId !== null) return;
    setDeletingId(row.id);
    try {
      await apiDelete(`/api/nutrition/water/${row.id}`);
      haptic("medium");
      toast.success(t("nutrition.water.deleted"));
      await refreshWater();
      void pushWidgetSnapshot();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deletingId, refreshWater, t]);

  // ── goal pill state (Set goal / Auto / Custom) ──
  const pillLabel = !hasGoal ? t("nutrition.water.setGoal") : isAuto ? t("nutrition.water.auto") : t("nutrition.water.custom");
  const pillHint = !hasGoal || isAuto ? t("nutrition.water.autoHint") : t("nutrition.water.autoOff");
  const PillIcon = !hasGoal ? Target : isAuto ? Sparkles : PencilLine;
  const pillCls = !hasGoal
    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25 hover:bg-sky-600"
    : isAuto
      ? "bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:text-sky-300"
      : "bg-sky-500/10 text-sky-700 ring-1 ring-inset ring-sky-500/25 hover:bg-sky-500/20 dark:text-sky-300";

  // ── log row display helpers ──
  const rowName = useCallback(
    (row: DrinkLogRow) =>
      row.name && row.name !== row.drink ? row.name : t(`nutrition.drink.${row.drink}`),
    [t]
  );

  const failed = waterQuery.isError;

  return (
    <Card className="gap-0 rounded-3xl border-border/70 p-4 sm:p-5" aria-label={t("nutrition.water.title")}>
      {/* ── header: droplet chip + live consumed/goal value ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400"
          >
            <Droplets className="h-4.5 w-4.5" />
          </span>
          <h3 className="truncate text-sm font-bold">{t("nutrition.water.title")}</h3>
        </div>
        {waterQuery.isLoading ? (
          <Skeleton className="h-5 w-24 rounded-full" />
        ) : goalReached ? (
          <p className="shrink-0 text-xs font-bold text-sky-600 dark:text-sky-400">
            {t("nutrition.water.goalDone")}
          </p>
        ) : (
          <p className="tnum shrink-0 text-sm font-bold">
            {fmt.number(consumedMl)}
            {hasGoal ? (
              <span className="font-medium text-muted-foreground">
                {" / "}
                {fmt.number(goalMl)} {unit}
              </span>
            ) : (
              <span className="font-medium text-muted-foreground"> {unit}</span>
            )}
          </p>
        )}
      </div>

      {waterQuery.isLoading ? (
        <div className="mt-3 space-y-2.5" aria-busy="true">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-4 w-1/2 rounded-full" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : failed ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-xs text-muted-foreground">{t("state.errorGeneric")}</p>
          <Button
            variant="outline"
            onClick={() => {
              haptic("light");
              void waterQuery.refetch();
            }}
            className="h-10 rounded-2xl"
            aria-label={t("action.retry")}
          >
            {t("action.retry")}
          </Button>
        </div>
      ) : (
        <>
          {/* ── animated progress bar ── */}
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
            aria-label={t("nutrition.water")}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.65, ease: "easeOut" }}
            />
          </div>

          {/* ── remaining / over line + % ── */}
          {hasGoal ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p
                className={`text-xs font-semibold ${
                  remainingMl >= 0 ? "text-muted-foreground" : "text-sky-600 dark:text-sky-400"
                }`}
              >
                {remainingMl >= 0
                  ? t("nutrition.water.remaining", { value: fmtMl(remainingMl) })
                  : t("nutrition.water.overGoal", { value: fmtMl(-remainingMl) })}
              </p>
              <span dir="ltr" className="tnum shrink-0 text-[11px] font-medium text-muted-foreground">
                {fmt.number(Math.round(progressPct))}%
              </span>
            </div>
          ) : null}

          {/* ── goal chip: Set goal / Auto / Custom → opens the calculator ── */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptic("light");
                onOpenGoals();
              }}
              aria-label={`${pillLabel} — ${pillHint}`}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${pillCls}`}
            >
              <PillIcon className="h-3.5 w-3.5" aria-hidden />
              {pillLabel}
            </button>
            <p title={pillHint} className="min-w-0 flex-1 truncate text-[10px] leading-tight text-muted-foreground">
              {pillHint}
            </p>
          </div>

          {/* ── drink type selector (what the + presets will log) ── */}
          <ToggleGroup
            type="single"
            value={drink}
            onValueChange={(v) => {
              if (v && isDrinkType(v)) {
                haptic("light");
                setDrink(v);
              }
            }}
            aria-label={t("nutrition.water.add")}
            className="mt-3 w-full rounded-2xl bg-muted/50 p-1"
          >
            {DRINK_OPTIONS.map(({ value, icon: Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-10 flex-1 gap-1.5 rounded-xl px-2 text-xs font-medium data-[state=on]:bg-sky-500/15 data-[state=on]:text-sky-700 dark:data-[state=on]:text-sky-300 sm:text-sm"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{t(`nutrition.drink.${value}`)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* ── quick-add presets (glass/water feel) ── */}
          <div className="mt-2.5 grid grid-cols-4 gap-2" aria-busy={adding}>
            {PRESETS_ML.map((ml) => (
              <button
                key={ml}
                type="button"
                disabled={adding}
                onClick={() => {
                  haptic("light");
                  void addDrink(ml, drink);
                }}
                aria-label={`${t("nutrition.water.add")} +${fmt.number(ml)} ${unit}`}
                className="tnum flex min-h-10 items-center justify-center gap-0.5 rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/15 to-cyan-400/10 px-1 text-sm font-bold text-sky-700 transition-all hover:from-sky-500/25 hover:to-cyan-400/20 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:text-sky-300"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {fmt.number(ml)}
              </button>
            ))}
          </div>

          {/* ── custom amount ── */}
          <form onSubmit={submitCustom} className="mt-2.5 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id="water-custom-amount"
                inputMode="numeric"
                dir="ltr"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={t("nutrition.water.customHint")}
                aria-label={t("nutrition.water.custom")}
                maxLength={4}
                className="tnum h-10 rounded-2xl pe-12"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[11px] font-semibold text-muted-foreground"
              >
                {unit}
              </span>
            </div>
            <Button
              type="submit"
              disabled={adding}
              aria-label={t("nutrition.water.add")}
              className="h-10 shrink-0 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 px-3 text-xs font-semibold text-white shadow-lg shadow-sky-500/25 hover:opacity-95"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">{t("nutrition.water.add")}</span>
            </Button>
          </form>

          {/* ── today's drink log ── */}
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold">{t("nutrition.water.today")}</h4>
              {logs.length > 0 ? (
                <span className="tnum text-[11px] font-medium text-muted-foreground">
                  {fmt.number(logs.length)}
                </span>
              ) : null}
            </div>

            {logs.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("nutrition.water.empty")}</p>
            ) : (
              <ul className="slim-scroll mt-1 max-h-40 divide-y divide-border/50 overflow-y-auto" role="list">
                {logs.map((row) => {
                  const RowIcon = DRINK_OPTIONS.find((d) => d.value === row.drink)?.icon ?? Droplets;
                  const displayName = rowName(row);
                  const isCustomName = row.name !== "" && row.name !== row.drink;
                  return (
                    <li key={row.id} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${DRINK_CHIP_CLS[row.drink]}`}
                        >
                          <RowIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{displayName}</p>
                          <p className="tnum truncate text-[10px] text-muted-foreground">
                            {isCustomName ? `${t(`nutrition.drink.${row.drink}`)} · ` : ""}
                            {fmt.time(row.updatedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="tnum text-xs font-bold">{fmtMl(row.amountMl)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            haptic("light");
                            setDeleteTarget(row);
                          }}
                          aria-label={t("nutrition.water.deleteConfirm.title")}
                          className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-danger/10"
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                          ) : (
                            <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ── delete confirmation ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("nutrition.water.deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("nutrition.water.deleteConfirm.desc", {
                    name: rowName(deleteTarget),
                    value: fmtMl(deleteTarget.amountMl),
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => haptic("light")}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default WaterCard;
