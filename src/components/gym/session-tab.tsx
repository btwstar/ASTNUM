"use client";

/**
 * Session tab — the heart of the gym overlay.
 *
 * v1.17 وضع ذكي (smart session):
 *  - Empty state KNOWS the plan: templates may carry dedicated weekdays
 *    (daysJson via the template editor) — today's template gets a hero
 *    “جدول اليوم” card, and when nothing is scheduled today the NEXT
 *    scheduled template is offered with its weekday.
 *  - Active session: planned progress strip (done/planned sets), one-tap
 *    quick-repeat of the last set, and تأجيل (defer) of planned-but-unstarted
 *    exercises to the next session of the same template — deferred rows
 *    badge “مؤجلة” with undo; carried rows badge “من جلسة سابقة”. Logging a
 *    set of the exercise fulfills the deferral automatically.
 *  - Finish confirm shows a live summary (work sets, volume, duration).
 *
 * No active session → smart start cards + start-empty CTA + template grid.
 * Active session    → elapsed timer (tabular, wall-clock anchored), volume so
 *                     far, set count, finish confirm (PATCH), session options
 *                     popover (default rest seconds + keep-awake + delete),
 *                     exercise rows (template-planned merged with ad-hoc
 *                     performed) with set pills ("12×80كجم", type badges, PR
 *                     crown; tap = EDIT sheet with delete inside — v1.9) and
 *                     "+ مجموعة" opening the FAST logger.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarCheck2,
  CalendarClock,
  Crown,
  Dumbbell,
  Flame,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipForward,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { dayKeyToWeekday } from "@/lib/i18n/format";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import type { WeightUnit } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  type TemplateRow,
  type WorkoutDetailData,
  type WorkoutSummary,
} from "./shared";

const REST_CHOICES = [60, 90, 120, 150, 180];

export interface SessionTabProps {
  active: WorkoutSummary | null;
  detail: WorkoutDetailData | null;
  detailLoading: boolean;
  listLoading: boolean;
  /** /api/gym/stats payload — hero strip (week volume + PR count) */
  stats: StatsData | null;
  /** finished sessions count (roster length) — hero strip */
  sessionsTotal: number;
  /** local YYYY-MM-DD (roster `today`) — drives the جدول اليوم smart card */
  todayKey: string;
  weightUnit: WeightUnit;
  restSeconds: number;
  keepAwake: boolean;
  onRestSecondsChange: (seconds: number) => void;
  onKeepAwakeChange: (value: boolean) => void;
  onStart: (templateId?: string) => void;
  startPending: boolean;
  onFinish: (durationSec: number) => void;
  finishPending: boolean;
  onOpenLogger: (exerciseId: string, name: string) => void;
  /** tap a set pill → the parent opens the shared EDIT sheet (fix or delete) */
  onEditSet: (set: SetRow, name: string) => void;
  onOpenPicker: () => void;
  /** v1.17: one-tap re-log of the exercise's last performed set */
  onQuickRepeat: (exerciseId: string, name: string) => void;
  /** v1.17: a quick-repeat POST is in flight (disables repeat buttons) */
  quickRepeatBusy: boolean;
  /** v1.17: defer=true → postpone to next session; false → undo */
  onDefer: (exerciseId: string, name: string, defer: boolean) => void;
  /** v1.17: which row's defer/undefer POST is in flight */
  deferPending: { id: string; defer: boolean } | null;
}

export function SessionTab({
  active,
  detail,
  detailLoading,
  listLoading,
  stats,
  sessionsTotal,
  todayKey,
  weightUnit,
  restSeconds,
  keepAwake,
  onRestSecondsChange,
  onKeepAwakeChange,
  onStart,
  startPending,
  onFinish,
  finishPending,
  onOpenLogger,
  onEditSet,
  onOpenPicker,
  onQuickRepeat,
  quickRepeatBusy,
  onDefer,
  deferPending,
}: SessionTabProps) {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();
  const unitLabel = weightUnit === "lb" ? t("unit.lb") : t("unit.kg");

  /* ── hero stats (empty state) — the week's OUTPUT at a glance ────
   * weeklyVolume is Monday-start, oldest first → the LAST bucket is the
   * current week. Hidden entirely for brand-new users (all zeros). */
  const weekVolumeKg = stats?.weeklyVolume?.length
    ? stats.weeklyVolume[stats.weeklyVolume.length - 1].volume
    : 0;
  const prCount = stats?.personalRecords?.length ?? 0;
  const showHeroStats = sessionsTotal > 0 || prCount > 0 || weekVolumeKg > 0;

  const [finishOpen, setFinishOpen] = useState(false);
  const [finishElapsed, setFinishElapsed] = useState(0); // snapshot at dialog open
  const [deleteWorkoutOpen, setDeleteWorkoutOpen] = useState(false);

  /* ── v1.17 smart scheduling derived data (جدول اليوم / القادم) ───── */
  const weekday = useMemo(() => dayKeyToWeekday(todayKey), [todayKey]);

  const templatesQuery = useQuery({
    queryKey: ["gym", "templates"],
    queryFn: async () => {
      // keep the legacy envelope shape ({ ok, data }) — the cache-shape shim
      // in gym/index.tsx and this tab both read this query
      const data = await apiGet<{ templates: TemplateRow[] }>("/api/gym/templates");
      return { ok: true as const, data };
    },
    staleTime: 60 * 1000,
  });

  // name map for ad-hoc exercises (cached with the picker's query)
  const libQuery = useQuery({
    queryKey: ["gym", "exercises"],
    queryFn: async () => {
      const data = await apiGet<{ exercises: GymExercise[] }>("/api/gym/exercises");
      return { ok: true as const, data };
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(active),
  });

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of libQuery.data?.data?.exercises ?? []) {
      map.set(ex.id, exerciseName(ex, lang));
    }
    return map;
  }, [libQuery.data, lang]);

  // elapsed at interaction time — no reactive state, no per-second parent
  // re-render (the ticking display lives in <ElapsedClock> below)
  const elapsedSecNow = () =>
    active
      ? Math.max(0, Math.floor((Date.now() - new Date(active.createdAt).getTime()) / 1000))
      : 0;

  const rows = useMemo(() => {
    if (!detail) return [];
    const byEx = new Map<string, SetRow[]>();
    for (const s of detail.sets) {
      const arr = byEx.get(s.exerciseId);
      if (arr) arr.push(s);
      else byEx.set(s.exerciseId, [s]);
    }
    const templateRows = detail.templateExercises.map((te) => ({
      exerciseId: te.exerciseId,
      name: te.exercise ? exerciseName(te.exercise, lang) : (nameMap.get(te.exerciseId) ?? te.exerciseId),
      targetSets: te.targetSets,
      targetReps: te.targetReps,
      sets: byEx.get(te.exerciseId) ?? [],
    }));
    const plannedIds = new Set(templateRows.map((r) => r.exerciseId));
    const extra = [...byEx.entries()]
      .filter(([id]) => !plannedIds.has(id))
      .map(([id, sets]) => ({
        exerciseId: id,
        name: nameMap.get(id) ?? id,
        targetSets: undefined as number | undefined,
        targetReps: undefined as number | undefined,
        sets,
      }))
      .sort((a, b) => (a.sets[0].createdAt < b.sets[0].createdAt ? -1 : 1));
    return [...templateRows, ...extra];
  }, [detail, lang, nameMap]);

  const deleteWorkoutMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/gym/workouts/${id}`),
    onSuccess: () => {
      haptic("medium");
      toast.success(t("gym.session.workoutDeleted"));
      void qc.invalidateQueries({ queryKey: ["gym"] });
    },
    onError: () => toast.error(t("gym.history.deleteError")),
  });

  /* ── loading ─────────────────────────────────────────────────────── */
  if (listLoading) {
    return (
      <div className="space-y-3 px-4 pt-4" aria-busy="true" aria-label={t("gym.loading.aria")}>
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  }

  /* ── no active session — v1.17 smart start ──────────────────────── */
  if (!active) {
    const templates = templatesQuery.data?.data?.templates ?? [];
    const scheduledToday = templates.filter((tpl) => tpl.days.includes(weekday));
    const todayTpl = scheduledToday[0] ?? null;
    const alsoToday = scheduledToday.slice(1);
    const anyScheduled = templates.some((tpl) => tpl.days.length > 0);
    // next scheduled: smallest forward offset among day-assigned templates
    const nextScheduled = templates
      .filter((tpl) => tpl.days.length > 0)
      .flatMap((tpl) =>
        tpl.days.map((d) => ({
          tpl,
          day: d,
          offset: (d - weekday + 7) % 7 || 7, // today itself counts as "next week" only when not shown above
        }))
      )
      .sort((a, b) => a.offset - b.offset)[0] ?? null;

    return (
      <div className="space-y-4 px-4 pt-6">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
            <Dumbbell className="h-8 w-8 text-primary" aria-hidden />
          </div>
          <h2 className="text-lg font-bold text-foreground">{t("gym.session.none.title")}</h2>
        </div>

        {/* جدول اليوم — the app KNOWS today's dedicated template */}
        {todayTpl && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            aria-label={t("gym.smart.todayLabel")}
          >
            <div className="relative overflow-hidden rounded-3xl bg-gradient-accent p-4 shadow-lg shadow-primary/25">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-background/85">
                <CalendarCheck2 className="h-4 w-4" aria-hidden />
                {t("gym.smart.todayLabel")}
              </div>
              <p className="mt-1.5 text-xl font-extrabold leading-tight text-background">
                {templateDisplayName(todayTpl.name, lang)}
              </p>
              <p className="mt-0.5 text-xs text-background/80">
                {t("gym.templates.exerciseCount", {
                  count: todayTpl.exercises.length,
                  n: fmt.number(todayTpl.exercises.length),
                })}
              </p>
              <Button
                type="button"
                onClick={() => {
                  haptic("medium");
                  onStart(todayTpl.id);
                }}
                disabled={startPending}
                className="mt-3 min-h-12 w-full rounded-2xl bg-background text-base font-bold text-primary shadow-md hover:bg-background/90"
                aria-label={t("gym.smart.todayStartAria", {
                  name: templateDisplayName(todayTpl.name, lang),
                })}
              >
                <Play className="h-5 w-5" aria-hidden />
                {t("gym.smart.todayStart")}
              </Button>
            </div>
            {alsoToday.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {t("gym.smart.alsoToday")}
                </p>
                {alsoToday.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      haptic("medium");
                      onStart(tpl.id);
                    }}
                    disabled={startPending}
                    className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="truncate text-sm font-bold text-foreground">
                      {templateDisplayName(tpl.name, lang)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      {t("gym.templates.start")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.section>
        )}

        {/* no template dedicated to today → offer the NEXT scheduled one */}
        {!todayTpl && nextScheduled && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            type="button"
            onClick={() => {
              haptic("medium");
              onStart(nextScheduled.tpl.id);
            }}
            disabled={startPending}
            className="flex w-full items-center gap-3 rounded-3xl border border-primary/30 bg-primary/5 p-4 text-start transition-colors hover:border-primary/50 hover:bg-primary/10"
            aria-label={t("gym.smart.nextStartAria", {
              day: t(`gym.day.${nextScheduled.day}`),
              name: templateDisplayName(nextScheduled.tpl.name, lang),
            })}
          >
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-primary">
                {t("gym.smart.nextLabel", { day: t(`gym.day.${nextScheduled.day}`) })}
              </span>
              <span className="block truncate text-sm font-bold text-foreground">
                {templateDisplayName(nextScheduled.tpl.name, lang)}
              </span>
            </span>
            <Play className="h-4 w-4 shrink-0 text-primary rtl:-scale-x-100" aria-hidden />
          </motion.button>
        )}

        {/* nothing scheduled anywhere → teach the feature once */}
        {!anyScheduled && templates.length > 0 && !templatesQuery.isLoading && (
          <div className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-start text-xs leading-relaxed text-muted-foreground">
            <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{t("gym.smart.noneScheduled")}</span>
          </div>
        )}

        {showHeroStats && (
          <Card
            className="card-hi grid grid-cols-3 bg-card p-0"
            role="group"
            aria-label={t("gym.stats.aria")}
          >
            <div className="flex flex-col items-center gap-0.5 p-3">
              <span className="tnum text-xl font-bold tabular-nums text-foreground">
                {fmt.number(sessionsTotal)}
              </span>
              <span className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
                <Timer className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                {t("gym.stats.sessions")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 border-x border-border p-3">
              <span className="tnum text-xl font-bold tabular-nums text-foreground">
                {fmt.number(Math.round(kgToDisplay(weekVolumeKg, weightUnit)))}
              </span>
              <span className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
                <Flame className="h-3 w-3 shrink-0 text-warning" aria-hidden />
                {t("gym.stats.weekVolume")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 p-3">
              <span className="tnum text-xl font-bold tabular-nums text-foreground">
                {fmt.number(prCount)}
              </span>
              <span className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
                <Crown className="h-3 w-3 shrink-0 text-warning" aria-hidden />
                {t("gym.stats.prs")}
              </span>
            </div>
          </Card>
        )}

        <Button
          type="button"
          onClick={() => {
            haptic("medium");
            onStart();
          }}
          disabled={startPending}
          className="min-h-13 w-full rounded-2xl bg-gradient-accent text-base font-bold text-background shadow-lg shadow-primary/25"
        >
          <Plus className="h-5 w-5" aria-hidden />
          {t("gym.session.startEmpty")}
        </Button>

        <div>
          <h3 className="pb-2 text-xs font-semibold text-muted-foreground">
            {t("gym.session.orTemplate")}
          </h3>
          {templatesQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3" aria-busy="true">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          ) : templates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("gym.templates.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    haptic("medium");
                    onStart(tpl.id);
                  }}
                  disabled={startPending}
                  aria-label={t("gym.templates.startAria", { name: templateDisplayName(tpl.name, lang) })}
                  className={cn(
                    "flex min-h-24 flex-col items-start gap-1 rounded-2xl border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-primary/5",
                    tpl.days.includes(weekday)
                      ? "border-primary/50 ring-1 ring-primary/20"
                      : "border-border"
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="text-sm font-bold text-foreground">
                      {templateDisplayName(tpl.name, lang)}
                    </span>
                    {tpl.builtin && (
                      <Badge className="bg-primary/10 text-[9px] text-primary">
                        {t("gym.templates.builtin")}
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("gym.templates.exerciseCount", { count: tpl.exercises.length, n: fmt.number(tpl.exercises.length) })}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {tpl.days.length > 0 ? (
                      tpl.days.map((d) => (
                        <span
                          key={d}
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                            d === weekday
                              ? "bg-primary text-primary-foreground"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {t(`gym.dayShort.${d}`)}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        {t("gym.templates.daysAny")}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── active session ─────────────────────────────────────────────── */
  const volumeDisplay = kgToDisplay(detail?.workout.volume ?? active.volume ?? 0, weightUnit);

  // template name is stored "AR | EN" — show it as the timer label
  const sessionLabel = active.name
    ? templateDisplayName(active.name, lang)
    : t("gym.session.elapsed");

  /* v1.17 — planned progress (template sessions): work sets vs the sum of
   * the prescription's target sets. Ad-hoc sessions hide the strip. */
  const plannedTotal = rows
    .filter((r) => r.targetSets !== undefined)
    .reduce((sum, r) => sum + (r.targetSets ?? 0), 0);
  const doneWorkSets = detail?.workout.workSetCount ?? 0;
  const plannedPct =
    plannedTotal > 0 ? Math.min(100, (doneWorkSets / plannedTotal) * 100) : 0;

  /* v1.17 — deferral markers for THIS session (server-provided). */
  const deferredSet = new Set(detail?.deferredIds ?? []);
  const carriedSet = new Set(detail?.carriedIds ?? []);

  return (
    <div className="space-y-3 px-4 pt-4">
      {/* timer card */}
      <Card className="card-hi overflow-hidden border-border bg-card p-0">
        <div className="flex items-center justify-between gap-2 bg-gradient-accent px-4 py-3 text-background">
          <div className="min-w-0 flex-1">
            <ElapsedClock active={active} label={sessionLabel} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-medium opacity-80">{t("gym.session.volume")}</span>
            <span className="tnum text-lg font-bold tabular-nums leading-tight">
              {fmt.number(Math.round(volumeDisplay))} {unitLabel}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-9 w-9 rounded-full text-background hover:bg-white/15"
                  aria-label={t("gym.session.settings")}
                >
                  <Settings2 className="h-4.5 w-4.5" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 rounded-2xl p-4">
                <div className="space-y-4">
                  <div>
                    <p className="pb-2 text-xs font-semibold text-foreground">
                      {t("gym.rest.duration")}
                    </p>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("gym.rest.duration")}>
                      {REST_CHOICES.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          aria-pressed={restSeconds === sec}
                          onClick={() => {
                            haptic("light");
                            onRestSecondsChange(sec);
                          }}
                          className={cn(
                            "min-h-9 rounded-full border px-3 text-xs font-bold transition-colors",
                            restSeconds === sec
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-muted/50 text-muted-foreground"
                          )}
                        >
                          <span className="tnum">{fmt.number(sec)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <p className="text-xs font-semibold text-foreground">{t("gym.rest.keepAwake")}</p>
                    </div>
                    <Switch
                      checked={keepAwake}
                      onCheckedChange={(v) => {
                        haptic("light");
                        onKeepAwakeChange(v);
                      }}
                      aria-label={t("gym.rest.keepAwake")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 gap-1.5 rounded-xl text-danger hover:bg-danger/10"
                      onClick={() => {
                        haptic("light");
                        setDeleteWorkoutOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      {t("gym.session.deleteWorkout")}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              onClick={() => {
                haptic("medium");
                setFinishElapsed(elapsedSecNow());
                setFinishOpen(true);
              }}
              disabled={finishPending}
              className="min-h-11 rounded-2xl bg-white/20 px-4 text-sm font-bold text-background hover:bg-white/30"
            >
              {t("gym.session.finish")}
            </Button>
          </div>
        </div>

        {/* progress strip */}
        <div className="flex items-center justify-around px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flame className="h-4 w-4 text-warning" aria-hidden />
            <span className="tnum text-sm font-semibold tabular-nums text-foreground">
              {fmt.number(detail?.workout.workSetCount ?? 0)}
            </span>
            <span className="text-xs">{t("unit.sets", { count: detail?.workout.workSetCount ?? 0 })}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Timer className="h-4 w-4 text-primary" aria-hidden />
            <span className="tnum text-sm font-semibold tabular-nums text-foreground">
              {fmt.number(detail?.workout.setCount ?? 0)}
            </span>
            <span className="text-xs">{t("unit.set", { count: detail?.workout.setCount ?? 0 })}</span>
          </div>
        </div>

        {/* v1.17 planned progress — done vs the prescription's total sets */}
        {plannedTotal > 0 && (
          <div className="border-t border-border/60 px-4 py-2">
            <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
              <span>{t("gym.session.plannedProgress", { planned: fmt.number(plannedTotal) })}</span>
              <span className="tnum tabular-nums">
                {fmt.number(doneWorkSets)} / {fmt.number(plannedTotal)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-accent transition-[width] duration-500"
                style={{ width: `${plannedPct}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* exercise rows */}
      {detailLoading && !detail ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center" role="status">
          <Dumbbell className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("gym.session.noSetsYet")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((row) => {
              const lastPerf = detail?.lastPerformance[row.exerciseId] ?? null;
              const doneAll =
                row.targetSets !== undefined &&
                row.sets.filter((s) => s.setType !== "warmup").length >= row.targetSets;
              const isDeferred = deferredSet.has(row.exerciseId);
              const isCarried = carriedSet.has(row.exerciseId);
              const canDefer =
                row.targetSets !== undefined &&
                row.sets.length === 0 &&
                !isDeferred &&
                active.templateId !== null;
              const canRepeat = row.sets.length > 0;
              const rowDeferBusy = deferPending?.id === row.exerciseId;
              return (
                <motion.li
                  key={row.exerciseId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <Card
                    className={cn(
                      "card-hi gap-3 bg-card p-4",
                      isDeferred
                        ? "border-warning/40 opacity-80"
                        : doneAll
                          ? "border-success/40"
                          : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <h3 className={cn("text-sm font-bold text-foreground", isDeferred && "text-muted-foreground")}>
                          {row.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {row.targetSets !== undefined && (
                            <span className="text-[11px] text-muted-foreground">
                              {t("gym.templates.target")}:{" "}
                              <span className="tnum">
                                {fmt.number(row.targetSets ?? 0)}×{fmt.number(row.targetReps ?? 0)}
                              </span>
                            </span>
                          )}
                          {isDeferred ? (
                            <Badge className="bg-warning/15 text-[9px] text-warning">
                              {t("gym.defer.badge")}
                            </Badge>
                          ) : isCarried && row.sets.length === 0 ? (
                            <Badge className="bg-primary/15 text-[9px] text-primary">
                              {t("gym.defer.carriedBadge")}
                            </Badge>
                          ) : row.sets.length === 0 && row.targetSets !== undefined ? (
                            <Badge className="bg-muted text-[9px] text-muted-foreground">
                              {t("gym.session.planned")}
                            </Badge>
                          ) : null}
                        </div>
                        {lastPerf && (
                          <p className="pt-0.5 text-[11px] text-muted-foreground/80">
                            {t("gym.session.lastTime")}:{" "}
                            <span className="tnum">
                              {fmt.number(lastPerf.reps)}×{fmt.number(kgToDisplay(lastPerf.weightKg, weightUnit))}{" "}
                              {unitLabel}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* v1.17 defer (planned, unstarted) / undo (deferred) */}
                      {(canDefer || isDeferred) && (
                        <div className="flex shrink-0 items-center gap-1">
                          {isDeferred ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={rowDeferBusy}
                              onClick={() => {
                                haptic("light");
                                onDefer(row.exerciseId, row.name, false);
                              }}
                              className="h-8 gap-1 rounded-full border-warning/40 px-2.5 text-[11px] font-bold text-warning hover:bg-warning/10"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              {t("gym.defer.undo")}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t("gym.defer.action")}
                              title={t("gym.defer.action")}
                              disabled={rowDeferBusy}
                              onClick={() => {
                                haptic("light");
                                onDefer(row.exerciseId, row.name, true);
                              }}
                              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted hover:text-warning"
                            >
                              <SkipForward className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* set pills */}
                    {row.sets.length > 0 && (
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
                              weight: fmt.number(kgToDisplay(s.weightKg, weightUnit)),
                              unit: unitLabel,
                            })}
                            className={cn(
                              "tnum flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors",
                              s.isPr
                                ? "border-warning/50 bg-warning/10 text-warning"
                                : s.setType === "warmup"
                                  ? "border-border bg-muted/50 text-muted-foreground"
                                  : s.setType === "failure"
                                    ? "border-danger/40 bg-danger/10 text-danger"
                                    : "border-primary/30 bg-primary/10 text-foreground"
                            )}
                          >
                            {s.isPr && <Crown className="h-3.5 w-3.5" aria-label={t("gym.set.pr")} aria-hidden />}
                            <span>
                              {fmt.number(s.reps)}×{fmt.number(kgToDisplay(s.weightKg, weightUnit))}
                              <span className="ms-1 text-[10px] font-medium opacity-70">{unitLabel}</span>
                            </span>
                            {s.setType !== "work" && (
                              <span className="text-[9px] font-bold uppercase opacity-70">
                                {t(`gym.setType.${s.setType}`)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* v1.17 actions — one-tap repeat (at the gym speed) + add set */}
                    {isDeferred ? (
                      <p className="rounded-xl bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        {t("gym.defer.rowNote")}
                      </p>
                    ) : (
                      <div className={cn("flex gap-2", !canRepeat && "flex-col")}>
                        {canRepeat && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={quickRepeatBusy}
                            onClick={() => {
                              haptic("medium");
                              onQuickRepeat(row.exerciseId, row.name);
                            }}
                            className="min-h-11 flex-1 gap-1.5 rounded-2xl border-primary/40 text-sm font-bold text-primary hover:bg-primary/10"
                            aria-label={t("gym.quickRepeat.action")}
                          >
                            <Zap className="h-4 w-4" aria-hidden />
                            {t("gym.quickRepeat.action")}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 flex-1 rounded-2xl text-sm font-bold"
                          onClick={() => {
                            haptic("medium");
                            onOpenLogger(row.exerciseId, row.name);
                          }}
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                          {t("gym.session.addSet")}
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {/* add exercise */}
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-2xl border-dashed border-border text-sm font-semibold text-muted-foreground"
        onClick={() => {
          haptic("light");
          onOpenPicker();
        }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("gym.session.addExercise")}
      </Button>
      <div className="h-24" aria-hidden />

      {/* finish confirm — v1.17 live session summary before saving */}
      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gym.session.finishTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gym.session.finishBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div
            className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/50 p-3"
            role="group"
            aria-label={t("gym.session.finishSummaryAria")}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="tnum text-lg font-bold tabular-nums text-foreground">
                {fmt.number(detail?.workout.workSetCount ?? 0)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t("unit.sets", { count: detail?.workout.workSetCount ?? 0 })}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 border-x border-border">
              <span className="tnum text-lg font-bold tabular-nums text-foreground">
                {fmt.number(Math.round(volumeDisplay))}
              </span>
              <span className="text-[10px] text-muted-foreground">{unitLabel}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="tnum text-lg font-bold tabular-nums text-foreground">
                {mmss(finishElapsed)}
              </span>
              <span className="text-[10px] text-muted-foreground">{t("gym.session.duration")}</span>
            </div>
          </div>
          {(detail?.deferredIds?.length ?? 0) > 0 && (
            <p className="flex items-start gap-1.5 rounded-2xl bg-warning/10 px-3 py-2 text-start text-[11px] leading-relaxed text-muted-foreground">
              <SkipForward className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning rtl:-scale-x-100" aria-hidden />
              {(() => {
                const deferredCount = detail?.deferredIds?.length ?? 0;
                return t("gym.defer.finishNote", {
                  count: deferredCount,
                  n: fmt.number(deferredCount),
                });
              })()}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-2xl">{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-2xl bg-gradient-accent text-background"
              onClick={() => onFinish(finishElapsed)}
            >
              {t("action.finish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* delete active workout confirm */}
      <AlertDialog open={deleteWorkoutOpen} onOpenChange={setDeleteWorkoutOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gym.history.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gym.history.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-2xl">{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-2xl bg-danger text-white hover:bg-danger/90"
              onClick={() => deleteWorkoutMutation.mutate(active.id)}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * ElapsedClock — owns the 1-second wall-clock-anchored ticker so the heavy
 * session body (set list, templates, dialogs) does NOT re-render every tick.
 * Self-corrects after background-tab throttling because each tick re-reads
 * Date.now() against the workout's createdAt anchor.
 */
function ElapsedClock({
  active,
  label,
}: {
  active: WorkoutSummary | null;
  label: string;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  const sec = active
    ? Math.max(0, Math.floor((now - new Date(active.createdAt).getTime()) / 1000))
    : 0;

  return (
    <>
      <span className="truncate text-[10px] font-medium opacity-80">{label}</span>
      <span
        className="tnum text-2xl font-bold tabular-nums leading-tight"
        aria-label={`${t("gym.session.elapsed")} ${fmt.number(sec)}`}
      >
        {mmss(sec)}
      </span>
    </>
  );
}

export async function patchWorkoutFinish(id: string, durationSec: number) {
  return apiPatch(`/api/gym/workouts/${id}`, { finish: true, durationSec });
}
