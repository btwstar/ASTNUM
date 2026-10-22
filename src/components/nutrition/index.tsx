"use client";

/**
 * قسم الأكل / Nutrition day view .
 * Rings header (kcal + macros) + 4 meal cards (items, delete, repeat-yesterday)
 * + weekly kcal bar chart with goal line + the whole sheet stack
 * (quick add / food search / portion / goals calculator / barcode).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ChartGate } from "@/components/ui/chart-gate";
import {
  Barcode,
  Coffee,
  Cookie,
  Info,
  MoonStar,
  PencilLine,
  Plus,
  RotateCcw,
  Sandwich,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { addDaysToKey, toLocalDateKey } from "@/lib/i18n/format";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MainRing, MacroRings } from "@/components/nutrition/rings";
import { WaterCard } from "@/components/nutrition/water-card";
import { QuickAddSheet } from "@/components/nutrition/quick-add-sheet";
import { FoodSearchSheet } from "@/components/nutrition/food-search-sheet";
import { PortionSheet } from "@/components/nutrition/portion-sheet";
import { GoalsSheet } from "@/components/nutrition/goals-sheet";
import { BarcodeSheet } from "@/components/nutrition/barcode-sheet";
import {
  MEAL_ORDER,
  ZERO_TOTALS,
  mealTypeByHour,
  type FoodLogRow,
  type FoodRow,
  type MealType,
  type SummaryResponse,
  type Totals,
} from "@/components/nutrition/shared";

const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sandwich,
  dinner: MoonStar,
  snack: Cookie,
};

const MACRO_CHIPS: Array<{
  key: keyof Totals;
  labelKey: string;
  cls: string;
}> = [
  { key: "kcal", labelKey: "unit.kcal", cls: "bg-primary/10 text-primary" },
  { key: "protein", labelKey: "nutrition.protein", cls: "bg-success/15 text-success" },
  { key: "carbs", labelKey: "nutrition.carbs", cls: "bg-warning/15 text-warning" },
  { key: "fat", labelKey: "nutrition.fat", cls: "bg-danger/15 text-danger" },
];

export function NutritionScreen({ openSignal }: { openSignal: number }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();

  const today = toLocalDateKey();
  const yesterday = useMemo(() => addDaysToKey(today, -1), [today]);

  const summaryQuery = useQuery({
    queryKey: ["nutrition-summary", today],
    queryFn: () => apiGet<SummaryResponse>(`/api/nutrition/summary?date=${today}&week=1`),
  });
  const logsQuery = useQuery({
    queryKey: ["nutrition-logs", today],
    queryFn: () => apiGet<{ logs: FoodLogRow[] }>(`/api/nutrition/logs?date=${today}`),
  });

  const [meal, setMeal] = useState<MealType>(() => mealTypeByHour(new Date().getHours()));
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [portionOpen, setPortionOpen] = useState(false);
  const [portionFood, setPortionFood] = useState<FoodRow | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  // v2.4: set when the hydration card's goal chip opens the calculator —
  // GoalsSheet then scrolls its water preview row into view once.
  const [goalsFocusWater, setGoalsFocusWater] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [repeatingMeal, setRepeatingMeal] = useState<MealType | null>(null);

  const openQuickAdd = useCallback((target?: MealType) => {
    if (target) setMeal(target);
    setQuickOpen(true);
  }, []);

  // FAB contract from body/index.tsx: signal increments → open quick add.
  useEffect(() => {
    if (openSignal > 0) openQuickAdd();
  }, [openSignal, openQuickAdd]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["nutrition-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["nutrition-logs"] }),
    ]);
  }, [queryClient]);

  const deleteLog = useCallback(
    async (row: FoodLogRow) => {
      haptic("light");
      setDeletingId(row.id);
      try {
        await apiDelete(`/api/nutrition/logs/${row.id}`);
        toast.success(t("nutrition.itemDeleted"));
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
      } finally {
        setDeletingId(null);
      }
    },
    [refresh, t]
  );

  /** Copy yesterday's same-meal logs to today. */
  const repeatYesterday = useCallback(
    async (target: MealType) => {
      haptic("light");
      setRepeatingMeal(target);
      try {
        const result = await apiGet<{ logs: FoodLogRow[] }>(`/api/nutrition/logs?date=${yesterday}`);
        const items = result.logs.filter((l) => l.mealType === target);
        if (items.length === 0) {
          toast.info(t("nutrition.repeatEmpty"));
          return;
        }
        for (const item of items) {
          await apiPost("/api/nutrition/logs", {
            date: today,
            mealType: target,
            foodId: item.foodId,
            name: item.name,
            quantity: item.quantity,
            grams: item.grams,
            kcal: item.kcal,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          });
        }
        haptic("success");
        toast.success(t("nutrition.repeated", { count: items.length }));
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
      } finally {
        setRepeatingMeal(null);
      }
    },
    [refresh, t, today, yesterday]
  );

  const summary = summaryQuery.data;
  const consumed = summary?.consumed ?? ZERO_TOTALS;
  const goals = summary?.goals;

  const logsByMeal = useMemo(() => {
    const map: Record<MealType, FoodLogRow[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const log of logsQuery.data?.logs ?? []) {
      map[log.mealType]?.push(log);
    }
    return map;
  }, [logsQuery.data]);

  const weekData = useMemo(() => {
    return (summary?.week ?? []).map((day) => ({
      ...day,
      label: fmt.date(`${day.date}T00:00:00`, { weekday: "short" }),
      isToday: day.date === today,
    }));
  }, [summary, fmt, today]);

  const weekAvg = useMemo(() => {
    const entries = summary?.week ?? [];
    if (entries.length === 0) return 0;
    return entries.reduce((sum, d) => sum + d.kcal, 0) / entries.length;
  }, [summary]);

  const loading = summaryQuery.isLoading || logsQuery.isLoading;
  const failed = summaryQuery.isError || logsQuery.isError;

  const retry = useCallback(() => {
    haptic("light");
    void summaryQuery.refetch();
    void logsQuery.refetch();
  }, [summaryQuery, logsQuery]);

  return (
    <section aria-label={t("nutrition.title")} className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-6">
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-48 rounded-3xl" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
          <Skeleton className="h-44 rounded-3xl" />
        </div>
      ) : failed ? (
        <Card className="items-center gap-3 rounded-3xl p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("nutrition.loadError")}</p>
          <Button onClick={retry} variant="outline" className="h-11 rounded-2xl">
            {t("action.retry")}
          </Button>
        </Card>
      ) : (
        <>
          {/* ── goals header: rings + edit/barcode ── */}
          <Card className="gap-0 rounded-3xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">{t("nutrition.goals.title")}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    haptic("light");
                    setBarcodeOpen(true);
                  }}
                  aria-label={t("nutrition.barcode.title")}
                  className="h-9 rounded-xl px-3 text-xs"
                >
                  <Barcode className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{t("nutrition.barcode.title")}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    haptic("light");
                    setGoalsOpen(true);
                  }}
                  aria-label={t("nutrition.goals.edit")}
                  className="h-9 rounded-xl px-3 text-xs"
                >
                  <PencilLine className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{t("nutrition.goals.edit")}</span>
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              <MainRing consumed={consumed.kcal} goal={goals?.kcal ?? 0} />
              <MacroRings
                consumed={consumed}
                goals={
                  goals
                    ? { kcal: goals.kcal, protein: goals.protein, carbs: goals.carbs, fat: goals.fat }
                    : ZERO_TOTALS
                }
              />
            </div>
          </Card>

          {/* ── hydration card (v2.4): rings stay untouched in the header ── */}
          <WaterCard
            date={today}
            onOpenGoals={() => {
              setGoalsFocusWater(true);
              setGoalsOpen(true);
            }}
          />

          {/* ── 4 meal cards ── */}
          {MEAL_ORDER.map((m) => {
            const Icon = MEAL_ICONS[m];
            const totals = summary?.meals[m] ?? ZERO_TOTALS;
            const items = logsByMeal[m];
            const repeating = repeatingMeal === m;
            return (
              <Card key={m} className="gap-0 overflow-hidden rounded-3xl py-0">
                <div className="flex items-center justify-between gap-2 p-4 pb-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{t(`nutrition.meal.${m}`)}</p>
                      <p className="tnum text-[11px] text-muted-foreground">
                        {t("nutrition.items", { count: items.length })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void repeatYesterday(m)}
                    disabled={repeating}
                    aria-label={t("nutrition.repeatLast")}
                    className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {repeating ? (
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    )}
                    <span className="hidden sm:inline">{t("nutrition.repeatLast")}</span>
                  </button>
                </div>

                {/* totals chips */}
                <div className="tnum flex flex-wrap gap-1.5 px-4">
                  {MACRO_CHIPS.map(({ key, labelKey, cls }) => (
                    <span
                      key={key}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}
                    >
                      {key === "kcal"
                        ? `${fmt.number(Math.round(totals.kcal))} ${t(labelKey)}`
                        : `${t(labelKey)} ${fmt.number(Math.round(totals[key]))}`}
                    </span>
                  ))}
                </div>

                {/* logged items */}
                {items.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">{t("nutrition.meal.empty")}</p>
                ) : (
                  <ul className="mt-1 divide-y divide-border/50" role="list">
                    {items.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <p className="tnum text-[11px] text-muted-foreground">
                            ×{fmt.number(row.quantity, { maximumFractionDigits: 2 })}
                            {row.grams != null ? ` · ${fmt.number(row.grams)} ${t("unit.gram")}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="tnum text-xs font-semibold">
                            {fmt.number(Math.round(row.kcal))} {t("unit.kcal")}
                          </span>
                          <button
                            type="button"
                            onClick={() => void deleteLog(row)}
                            disabled={deletingId === row.id}
                            aria-label={t("nutrition.deleteItemConfirm.title")}
                            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-danger/10 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* actions */}
                <div className="flex gap-2 p-4 pt-3">
                  <Button
                    onClick={() => openQuickAdd(m)}
                    className="h-11 flex-1 rounded-2xl bg-gradient-accent font-semibold text-primary-foreground shadow-lg shadow-primary/25"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {t("nutrition.addFood")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      haptic("light");
                      setMeal(m);
                      setSearchOpen(true);
                    }}
                    className="h-11 rounded-2xl px-3 text-xs"
                    aria-label={t("nutrition.addFromDb")}
                  >
                    {t("nutrition.addFromDb")}
                  </Button>
                </div>
              </Card>
            );
          })}

          {/* ── weekly kcal chart ── */}
          <Card className="gap-0 rounded-3xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">{t("nutrition.weekly.title")}</h3>
              <p className="tnum text-[11px] text-muted-foreground">
                {t("nutrition.weekly.avg", { value: fmt.number(Math.round(weekAvg)) })}
                {" · "}
                {t("nutrition.weekly.goal")}: {fmt.number(Math.round(goals?.kcal ?? 0))}
              </p>
            </div>
            <div className="mt-3 h-36" dir="ltr">
              {/* v1.15: ChartGate waits for real layout size — no more
                  "width(0) and height(0)" recharts dev warning on mount */}
              <ChartGate>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "var(--foreground)",
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(value) => [
                      `${fmt.number(Math.round(Number(value ?? 0)))} ${t("unit.kcal")}`,
                      t("nutrition.consumed"),
                    ]}
                  />
                  {goals != null &&
                    Number.isFinite(goals.kcal) &&
                    goals.kcal > 0 &&
                    weekData.some((d) => d.kcal > 0) && (
                      <ReferenceLine
                        y={goals.kcal}
                        stroke="var(--primary)"
                        strokeDasharray="6 4"
                        ifOverflow="extendDomain"
                      />
                    )}
                  <Bar dataKey="kcal" radius={[6, 6, 0, 0]} maxBarSize={36}>
                    {weekData.map((day) => (
                      <Cell
                        key={day.date}
                        fill={day.isToday ? "var(--primary)" : "var(--muted-foreground)"}
                        opacity={day.isToday ? 1 : 0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </ChartGate>
            </div>
          </Card>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("nutrition.disclaimer")}
          </p>
        </>
      )}

      {/* ── sheets ── */}
      <QuickAddSheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        date={today}
        meal={meal}
        onMealChange={setMeal}
        onSaved={() => void refresh()}
        onOpenFoodSearch={() => {
          setQuickOpen(false);
          setSearchOpen(true);
        }}
        onOpenBarcode={() => {
          setQuickOpen(false);
          setBarcodeOpen(true);
        }}
      />
      <FoodSearchSheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPickFood={(food) => {
          setPortionFood(food);
          setSearchOpen(false);
          setPortionOpen(true);
        }}
      />
      <PortionSheet
        open={portionOpen}
        onOpenChange={setPortionOpen}
        date={today}
        food={portionFood}
        meal={meal}
        onMealChange={setMeal}
        onSaved={() => void refresh()}
      />
      <GoalsSheet
        open={goalsOpen}
        onOpenChange={(o) => {
          setGoalsOpen(o);
          if (!o) setGoalsFocusWater(false);
        }}
        focusWater={goalsFocusWater}
      />
      <BarcodeSheet
        open={barcodeOpen}
        onOpenChange={setBarcodeOpen}
        onFoundFood={(food) => {
          setPortionFood(food);
          setBarcodeOpen(false);
          setPortionOpen(true);
        }}
      />
    </section>
  );
}

export default NutritionScreen;
