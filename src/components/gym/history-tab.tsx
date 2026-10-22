"use client";

/**
 * History tab — past sessions + progress charts.
 *
 * Top: weekly volume bar chart (last 8 weeks, Monday-start buckets from
 * /api/gym/stats). Below: the finished-session roster (date / duration /
 * volume / sets) — tapping opens a detail sheet with the sets grouped by
 * exercise (PR crowns kept); v1.9: every set pill is TAPPABLE → the shared
 * edit sheet (fix reps/weight/type/RPE or delete — mis-logged history stays
 * fixable). Bottom: per-exercise progress — pick an exercise (searchable
 * sheet) → e1RM LineChart + maxes card. All weights convert kg → the user's
 * display unit via shared helpers.
 */
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartGate } from "@/components/ui/chart-gate";
import {
  Crown,
  Dumbbell,
  Flame,
  History,
  ListChecks,
  Search,
  Timer,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet } from "@/lib/api";
import type { WeightUnit } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  exerciseName,
  kgToDisplay,
  mmss,
  templateDisplayName,
  type GymExercise,
  type SetRow,
  type StatsData,
  type TemplateExerciseRow,
  type WorkoutDetailData,
  type WorkoutSummary,
} from "./shared";
import { ExercisePickerSheet } from "./exercise-picker-sheet";

export interface HistoryTabProps {
  history: WorkoutSummary[];
  listLoading: boolean;
  today: string;
  weightUnit: WeightUnit;
  /** tap a set pill in the detail sheet → parent opens the shared EDIT sheet */
  onEditSet: (set: SetRow, name: string) => void;
}

/** YYYY-MM-DD → localized "d/m" short label */
function useWeekLabel() {
  const { t } = useI18n();
  const fmt = useFormat();
  return (key: string) => {
    const [, m, d] = key.split("-");
    return t("gym.history.weekShort", {
      d: fmt.number(Number(d)),
      m: fmt.number(Number(m)),
    });
  };
}

export function HistoryTab({ history, listLoading, today, weightUnit, onEditSet }: HistoryTabProps) {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();
  const unitLabel = weightUnit === "lb" ? t("unit.lb") : t("unit.kg");
  const weekLabel = useWeekLabel();

  /* ── stats (weekly volume + personal records) ───────────────────────── */
  const statsQuery = useQuery({
    queryKey: ["gym", "stats"],
    queryFn: () =>
      apiGet<StatsData>(`/api/gym/stats?today=${encodeURIComponent(today)}`),
    staleTime: 30 * 1000,
  });

  /* ── exercise name map (shared ["gym","exercises"] cache) ──────────── */
  const libQuery = useQuery({
    queryKey: ["gym", "exercises"],
    queryFn: () => apiGet<{ exercises: GymExercise[] }>("/api/gym/exercises"),
    staleTime: 5 * 60 * 1000,
  });
  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of libQuery.data?.exercises ?? []) {
      map.set(ex.id, exerciseName(ex, lang));
    }
    return map;
  }, [libQuery.data, lang]);

  /* ── detail sheet ──────────────────────────────────────────────────── */
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: ["gym", "workout", detailId ?? "none"],
    enabled: detailId !== null,
    queryFn: async () => {
      const id = detailId;
      if (!id) throw new Error("no_workout_selected");
      return apiGet<WorkoutDetailData>(`/api/gym/workouts/${id}`);
    },
  });
  const detailWorkout = history.find((w) => w.id === detailId) ?? null;

  const detailRows = useMemo(() => {
    const d = detailQuery.data;
    if (!d) return [];
    const byEx = new Map<string, SetRow[]>();
    for (const s of d.sets) {
      const arr = byEx.get(s.exerciseId);
      if (arr) arr.push(s);
      else byEx.set(s.exerciseId, [s]);
    }
    const nameOf = (te: TemplateExerciseRow) =>
      te.exercise
        ? exerciseName(te.exercise, lang)
        : (nameMap.get(te.exerciseId) ?? te.exerciseId);
    const planned = d.templateExercises
      .map((te) => ({
        exerciseId: te.exerciseId,
        name: nameOf(te),
        sets: byEx.get(te.exerciseId) ?? [],
      }))
      .filter((r) => r.sets.length > 0); // finished sessions: hide unperformed prescriptions
    const plannedIds = new Set(planned.map((r) => r.exerciseId));
    const extras = [...byEx.entries()]
      .filter(([id]) => !plannedIds.has(id))
      .map(([id, sets]) => ({
        exerciseId: id,
        name: nameMap.get(id) ?? id,
        sets,
      }));
    return [...planned, ...extras];
  }, [detailQuery.data, lang, nameMap]);

  /* ── per-exercise progress ─────────────────────────────────────────── */
  const [selected, setSelected] = useState<GymExercise | null>(null);
  const [progressPickerOpen, setProgressPickerOpen] = useState(false);
  const exStatsQuery = useQuery({
    queryKey: ["gym", "stats-ex", selected?.id ?? "none"],
    enabled: selected !== null,
    queryFn: () =>
      apiGet<StatsData>(
        `/api/gym/stats?today=${encodeURIComponent(today)}&exerciseId=${encodeURIComponent(
          selected?.id ?? ""
        )}`
      ),
    placeholderData: (prev) => prev,
  });
  const personalRecord = useMemo(
    () =>
      (exStatsQuery.data?.personalRecords ?? []).find(
        (pr) => pr.exerciseId === selected?.id
      ) ?? null,
    [exStatsQuery.data, selected?.id]
  );

  /* ── charts data ───────────────────────────────────────────────────── */
  const weeklyData = useMemo(
    () =>
      (statsQuery.data?.weeklyVolume ?? []).map((b) => ({
        label: weekLabel(b.weekStart),
        volume: kgToDisplay(b.volume, weightUnit),
      })),
    [statsQuery.data, weekLabel, weightUnit]
  );

  const e1rmData = useMemo(
    () =>
      (exStatsQuery.data?.exerciseHistory ?? []).map((h) => ({
        label: weekLabel(h.date),
        e1rm: kgToDisplay(h.e1rm, weightUnit),
      })),
    [exStatsQuery.data, weekLabel, weightUnit]
  );

  /* ── delete session ────────────────────────────────────────────────── */
  const [deleteWorkout, setDeleteWorkout] = useState<WorkoutSummary | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/gym/workouts/${id}`),
    onSuccess: () => {
      haptic("medium");
      toast.success(t("gym.history.deleted"));
      void qc.invalidateQueries({ queryKey: ["gym"] });
      setDeleteWorkout(null);
      setDetailId(null);
    },
    onError: () => toast.error(t("gym.history.deleteError")),
  });

  const roundDisplay = (kg: number) => Math.round(kgToDisplay(kg, weightUnit) * 10) / 10;

  const recentForProgress = (statsQuery.data?.personalRecords ?? []).map((pr) => ({
    id: pr.exerciseId,
    nameAr: pr.nameAr,
    nameEn: pr.nameEn,
  }));

  const durationLabel = (sec: number) =>
    mmss(sec)
      .split(":")
      .map((seg) => fmt.number(Number(seg)))
      .join(":");

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4 px-4 pt-4">
      {/* weekly volume */}
      <Card className="card-hi space-y-2 border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Flame className="h-4 w-4 text-warning" aria-hidden />
          {t("gym.history.weeklyVolume")}
        </h2>
        <div dir="ltr" className="h-36 w-full">
          {/* v1.15: ChartGate waits for real layout size — no more
              "width(0) and height(0)" recharts dev warning on mount */}
          <ChartGate>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                itemStyle={{ color: "var(--foreground)" }}
                formatter={(value) => [
                  `${fmt.number(Math.round(Number(value)))} ${unitLabel}`,
                  t("gym.history.volume"),
                ]}
              />
              <Bar dataKey="volume" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </ChartGate>
        </div>
      </Card>

      {/* per-exercise progress */}
      <Card className="card-hi space-y-3 border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
          {t("gym.history.progress")}
        </h2>

        {selected ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                {exerciseName(selected, lang)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 shrink-0 gap-1 rounded-xl text-xs"
                aria-label={t("gym.history.pickExercise")}
                onClick={() => {
                  haptic("light");
                  setProgressPickerOpen(true);
                }}
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                {t("gym.picker.title")}
              </Button>
            </div>

            {personalRecord ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t("gym.history.topWeight")}
                  </p>
                  <p className="tnum text-base font-bold tabular-nums text-foreground">
                    {fmt.number(roundDisplay(personalRecord.maxWeight))}{" "}
                    <span className="text-xs font-medium">{unitLabel}</span>
                  </p>
                  <p className="tnum text-[10px] text-muted-foreground">
                    ×{fmt.number(personalRecord.maxWeightReps)} {t("gym.logger.reps")}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t("gym.history.e1rm")}
                  </p>
                  <p className="tnum text-base font-bold tabular-nums text-foreground">
                    {fmt.number(roundDisplay(personalRecord.maxE1rm))}{" "}
                    <span className="text-xs font-medium">{unitLabel}</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t("gym.history.sessionVolume")}
                  </p>
                  <p className="tnum text-base font-bold tabular-nums text-foreground">
                    {fmt.number(roundDisplay(personalRecord.maxVolume))}{" "}
                    <span className="text-xs font-medium">{unitLabel}</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t("gym.session.lastTime")}
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {fmt.date(new Date(`${personalRecord.lastDone}T00:00:00`), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ) : (
              exStatsQuery.isLoading ? (
                <Skeleton className="h-20 rounded-2xl" />
              ) : (
                <p className="py-2 text-center text-xs text-muted-foreground" role="status">
                  {t("gym.history.noExerciseData")}
                </p>
              )
            )}

            {e1rmData.length > 0 ? (
              <div dir="ltr" className="h-32 w-full">
                {/* v1.15: ChartGate waits for real layout size — no more
                    "width(0) and height(0)" recharts dev warning on mount */}
                <ChartGate>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={e1rmData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      cursor={{ stroke: "var(--border)" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      itemStyle={{ color: "var(--foreground)" }}
                      formatter={(value) => [
                        `${fmt.number(Math.round(Number(value)))} ${unitLabel}`,
                        t("gym.history.e1rm"),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="e1rm"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 2.6, fill: "var(--primary)", strokeWidth: 0 }}
                      activeDot={{
                        r: 4.5,
                        fill: "var(--primary)",
                        stroke: "var(--background)",
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                </ChartGate>
              </div>
            ) : (
              !exStatsQuery.isLoading &&
              personalRecord && (
                <p className="pt-1 text-center text-xs text-muted-foreground" role="status">
                  {t("gym.history.noExerciseData")}
                </p>
              )
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setProgressPickerOpen(true);
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Search className="h-4 w-4" aria-hidden />
            {t("gym.history.pickExercise")}
          </button>
        )}
      </Card>

      {/* sessions */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <History className="h-4 w-4 text-primary" aria-hidden />
          {t("gym.history.sessions")}
        </h2>

        {listLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("gym.loading.aria")}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center" role="status">
            <Dumbbell className="h-10 w-10 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-semibold text-foreground">{t("gym.history.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {history.map((w) => (
              <motion.li
                key={w.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setDetailId(w.id);
                  }}
                  aria-label={t("gym.history.detail")}
                  className="flex w-full flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {fmt.date(new Date(`${w.date}T00:00:00`))}
                    </span>
                    {w.name && (
                      <Badge
                        variant="outline"
                        className="max-w-[45%] truncate border-border bg-muted/50 text-[10px] text-muted-foreground"
                      >
                        {templateDisplayName(w.name, lang)}
                      </Badge>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5 text-primary" aria-hidden />
                      <span className="tnum tabular-nums text-foreground">
                        {durationLabel(w.durationSec)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-warning" aria-hidden />
                      <span className="tnum tabular-nums text-foreground">
                        {fmt.number(Math.round(kgToDisplay(w.volume, weightUnit)))} {unitLabel}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5 text-success" aria-hidden />
                      <span className="tnum tabular-nums text-foreground">
                        {fmt.number(w.setCount)} {t("unit.sets", { count: w.setCount })}
                      </span>
                    </span>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
      <div className="h-24" aria-hidden />

      {/* session detail sheet */}
      <Sheet open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
        >
          <SheetHeader className="pb-1">
            <SheetTitle className="text-start">{t("gym.history.detail")}</SheetTitle>
            <SheetDescription className="text-start">
              {detailWorkout ? fmt.date(new Date(`${detailWorkout.date}T00:00:00`)) : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="slim-scroll flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {detailQuery.isLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label={t("gym.loading.aria")}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            ) : detailQuery.isError ? (
              <p className="py-6 text-center text-sm text-muted-foreground" role="alert">
                {t("gym.history.loadError")}
              </p>
            ) : (
              <>
                {/* summary strip */}
                {detailWorkout && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-border bg-muted/40 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {t("gym.history.duration")}
                      </p>
                      <p className="tnum text-sm font-bold tabular-nums text-foreground">
                        {durationLabel(detailWorkout.durationSec)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/40 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {t("gym.history.volume")}
                      </p>
                      <p className="tnum text-sm font-bold tabular-nums text-foreground">
                        {fmt.number(Math.round(kgToDisplay(detailWorkout.volume, weightUnit)))}{" "}
                        {unitLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/40 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {t("unit.sets", { count: detailWorkout.setCount })}
                      </p>
                      <p className="tnum text-sm font-bold tabular-nums text-foreground">
                        {fmt.number(detailWorkout.setCount)}
                      </p>
                    </div>
                  </div>
                )}

                {/* notes */}
                {detailWorkout?.notes ? (
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <p className="pb-1 text-[10px] font-semibold text-muted-foreground">
                      {t("gym.history.notes")}
                    </p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {detailWorkout.notes}
                    </p>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    {t("gym.history.noNotes")}
                  </p>
                )}

                {/* sets grouped by exercise — every pill is tappable (edit) */}
                <ul className="space-y-2">
                  {detailRows.map((row) => (
                    <li
                      key={row.exerciseId}
                      className="space-y-1.5 rounded-2xl border border-border bg-card p-3"
                    >
                      <h3 className="text-sm font-bold text-foreground">{row.name}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {row.sets.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              haptic("light");
                              onEditSet(s, row.name);
                            }}
                            aria-label={t("gym.set.pillTapAria", {
                              reps: fmt.number(s.reps),
                              weight: fmt.number(roundDisplay(s.weightKg)),
                              unit: unitLabel,
                            })}
                            className={cn(
                              "tnum inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors hover:border-primary/50 active:scale-[0.98]",
                              s.isPr
                                ? "border-warning/50 bg-warning/10 text-warning"
                                : s.setType === "warmup"
                                  ? "border-border bg-muted/50 text-muted-foreground"
                                  : s.setType === "failure"
                                    ? "border-danger/40 bg-danger/10 text-danger"
                                    : "border-primary/30 bg-primary/10 text-foreground"
                            )}
                          >
                            {s.isPr && (
                              <Crown
                                className="h-3.5 w-3.5"
                                aria-label={t("gym.set.pr")}
                                aria-hidden
                              />
                            )}
                            {fmt.number(s.reps)}×
                            {fmt.number(roundDisplay(s.weightKg))}
                            <span className="text-[10px] font-medium opacity-70">{unitLabel}</span>
                            {s.setType !== "work" && (
                              <span className="text-[9px] font-bold uppercase opacity-70">
                                {t(`gym.setType.${s.setType}`)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>

                {detailRows.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground" role="status">
                    {t("gym.session.noSetsYet")}
                  </p>
                )}

                {/* delete */}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full gap-1.5 rounded-2xl text-sm font-semibold text-danger hover:bg-danger/10"
                  onClick={() => {
                    if (!detailWorkout) return;
                    haptic("light");
                    setDeleteWorkout(detailWorkout);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t("action.delete")}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* exercise picker for the progress chart */}
      {progressPickerOpen && (
        <ExercisePickerSheet
          open={progressPickerOpen}
          onOpenChange={setProgressPickerOpen}
          onPick={(ex) => {
            setSelected(ex);
          }}
          recent={recentForProgress}
        />
      )}

      {/* delete session confirm */}
      <AlertDialog
        open={deleteWorkout !== null}
        onOpenChange={(open) => !open && setDeleteWorkout(null)}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gym.history.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gym.history.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-2xl">
              {t("action.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-2xl bg-danger text-white hover:bg-danger/90"
              onClick={() => {
                if (deleteWorkout) deleteMutation.mutate(deleteWorkout.id);
              }}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
