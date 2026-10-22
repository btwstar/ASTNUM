"use client";

import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useI18n, useFormat } from "@/lib/i18n";
import { toLocalDateKey } from "@/lib/i18n/format";
import { useAppStore } from "@/lib/store/app-store";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { ApkBanner } from "@/components/apk-download";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Dumbbell,
  Flame,
  Plus,
  Timer,
  TrendingUp,
  UtensilsCrossed,
  Activity,
  Circle,
} from "lucide-react";

/* ── DTOs (mirror module APIs) ─────────────────────────────── */

interface HabitRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  archived: boolean;
  todayDone: boolean;
  todayFrozen: boolean;
  streaks: { current: number; best: number };
  last7: Array<{ date: string; done: boolean; scheduled: boolean }>;
}

interface TaskRow {
  id: string;
  title: string;
  priority: number;
  done: boolean;
  repeating: boolean;
  dueAt: string | null;
}

interface NutritionSummary {
  consumed: { kcal: number; protein: number; carbs: number; fat: number };
  goals: { kcal: number; protein: number; carbs: number; fat: number };
}

interface WorkoutsState {
  active: { id: string; createdAt: string; name: string | null } | null;
  history: Array<{ id: string; date: string; templateId: string | null; name: string | null; volume: number; completedAt: string | null }>;
}

interface TemplateRow {
  id: string;
  name: string;
}

interface MuscleLoadRow {
  id: string;
  nameAr: string;
  nameEn: string;
  weeklyTarget: number;
  weightedSets: number;
  volume: number;
  lastTrainedAt: string | null;
}

/* ── helpers ───────────────────────────────────────────────── */

function HabitGlyph({ icon, color }: { icon: string; color: string }) {
  if (icon.startsWith("lucide:")) {
    const map: Record<string, React.ElementType> = {
      flame: Flame,
      dumbbell: Dumbbell,
      water: Plus,
      book: BookGlyph,
      moon: MoonGlyph,
      sun: SunGlyph,
      heart: HeartGlyph,
      brain: BrainGlyph,
      brush: BrushGlyph,
    };
    const Comp = map[icon.slice(7)] ?? Flame;
    return (
      <span style={{ color }} className="flex h-8 w-8 items-center justify-center">
        <Comp className="h-5 w-5" aria-hidden />
      </span>
    );
  }
  return (
    <span style={{ color }} className="flex h-8 w-8 items-center justify-center text-lg leading-none">
      {icon}
    </span>
  );
}

function BookGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function MoonGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  );
}
function SunGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
function HeartGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
function BrainGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4 17.5a2.5 2.5 0 0 1-1.98-4A2.5 2.5 0 0 1 3 7.5a2.5 2.5 0 0 1 4-4.04A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 20 17.5a2.5 2.5 0 0 0 1.98-4A2.5 2.5 0 0 0 21 7.5a2.5 2.5 0 0 0-4-4.04A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
function BrushGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function greetingKey(hour: number): string {
  if (hour < 12) return "today.greeting.morning";
  if (hour < 17) return "today.greeting.afternoon";
  if (hour < 23) return "today.greeting.evening";
  return "today.greeting.night";
}

/* ── section shell ─────────────────────────────────────────── */

function Section({
  title,
  actionLabel,
  onAction,
  children,
  testId,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="px-4" aria-label={title} data-testid={testId}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">{title}</h2>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex min-h-8 items-center gap-0.5 rounded-full px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            {actionLabel}
            <ChevronLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/* ── screen ────────────────────────────────────────────────── */

export default function TodayScreen() {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const openNotesWithSegment = useAppStore((s) => s.openNotesWithSegment);
  const openGym = useAppStore((s) => s.openGym);

  const todayKey = toLocalDateKey();

  const habitsQ = useQuery({
    queryKey: ["habits"],
    queryFn: () => apiGet<{ today: string; habits: HabitRow[] }>("/api/habits"),
  });
  const tasksQ = useQuery({
    queryKey: ["tasks-today", todayKey],
    queryFn: () => apiGet<{ today: TaskRow[] }>(`/api/tasks?date=${todayKey}&scope=today`),
  });
  const summaryQ = useQuery({
    queryKey: ["nutrition-summary", todayKey],
    queryFn: () => apiGet<NutritionSummary>(`/api/nutrition/summary?date=${todayKey}`),
  });
  const workoutsQ = useQuery({
    // SAME key + URL as the gym screen and the shell nav badge — one shared fetch
    queryKey: ["gym", "workouts"],
    queryFn: () => apiGet<WorkoutsState>("/api/gym/workouts"),
  });
  const templatesQ = useQuery({
    queryKey: ["gym-templates"],
    queryFn: () => apiGet<{ templates: TemplateRow[] }>("/api/gym/templates"),
  });
  const musclesQ = useQuery({
    queryKey: ["muscles-load", 7],
    queryFn: () => apiGet<{ muscles: MuscleLoadRow[] }>("/api/muscles/load?days=7"),
  });

  const toggleHabit = useMutation({
    mutationFn: (habit: HabitRow) =>
      apiPost<{ done: boolean; streaks: { current: number }; milestone: number | null }>(
        `/api/habits/${habit.id}/log`,
        { date: habitsQ.data?.today ?? todayKey, done: !habit.todayDone }
      ),
    onSuccess: (res, habit) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      if (res.done) {
        if (res.milestone) {
          haptic("success");
          toast.success(t("habits.milestone", { count: res.streaks.current }));
        } else {
          haptic("light");
        }
      } else {
        haptic("light");
      }
    },
    onError: () => toast.error(t("state.errorGeneric")),
  });

  const toggleTask = useMutation({
    mutationFn: (task: TaskRow) => apiPatch(`/api/tasks/${task.id}`, { done: !task.done }),
    onSuccess: () => {
      haptic("light");
      queryClient.invalidateQueries({ queryKey: ["tasks-today", todayKey] });
    },
  });

  const hour = new Date().getHours();

  const activeHabits = (habitsQ.data?.habits ?? []).filter((h) => !h.archived);
  const doneCount = activeHabits.filter((h) => h.todayDone).length;

  const openTasks = (tasksQ.data?.today ?? []).filter((task) => !task.done).slice(0, 3);
  const doneTasksCount = (tasksQ.data?.today ?? []).filter((task) => task.done).length;

  const consumed = summaryQ.data?.consumed ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = summaryQ.data?.goals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const kcalRatio = goals.kcal > 0 ? Math.min(consumed.kcal / goals.kcal, 1) : 0;
  const proteinRatio = goals.protein > 0 ? Math.min(consumed.protein / goals.protein, 1) : 0;
  const kcalLeft = Math.max(0, Math.round(goals.kcal - consumed.kcal));
  const kcalOver = Math.max(0, Math.round(consumed.kcal - goals.kcal));

  // workout suggestion: rotate templates after the last completed session
  const suggestedTemplate = useMemo(() => {
    const templates = templatesQ.data?.templates ?? [];
    if (templates.length === 0) return null;
    const lastCompleted = (workoutsQ.data?.history ?? []).find((w) => w.completedAt);
    if (!lastCompleted?.templateId) return templates[0];
    const idx = templates.findIndex((tpl) => tpl.id === lastCompleted.templateId);
    return templates[(idx + 1 + templates.length) % templates.length];
  }, [templatesQ.data, workoutsQ.data]);

  const templateName = (name: string) => {
    const parts = name.split(" | ");
    return lang === "ar" ? parts[0] : (parts[1] ?? parts[0]);
  };

  const muscleInsight = useMemo(() => {
    const muscles = musclesQ.data?.muscles ?? [];
    const trained = muscles.filter((m) => m.weightedSets > 0);
    if (trained.length === 0) return null;
    const top = trained.reduce((a, b) => (b.weightedSets > a.weightedSets ? b : a));
    return { top, trainedCount: trained.length, total: muscles.length };
  }, [musclesQ.data]);

  const muscleName = (m: MuscleLoadRow) => (lang === "ar" ? m.nameAr : m.nameEn);
  const activeWorkout = workoutsQ.data?.active ?? null;

  return (
    <div className="flex flex-col gap-5 pt-3 pb-6">
      {/* Greeting hero — the date opens the month calendar sheet */}
      <header className="px-4">
        <button
          type="button"
          aria-label={t("calendar.title")}
          onClick={() => {
            haptic("light");
            useAppStore.getState().openCalendarSheet();
          }}
          className="-ms-1.5 -mt-1 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          {fmt.date(new Date())}
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        </button>
        <h1 className="mt-0.5 text-2xl font-bold leading-snug">
          {t(greetingKey(hour))} <span className="text-gradient">ASTNUM</span>
        </h1>
      </header>

      {/* Android APK download — web preview only (auto-stripped from the APK build) */}
      <ApkBanner />

      {/* Habits strip */}
      <Section
        title={t("today.habits.section")}
        actionLabel={t("today.habits.viewAll")}
        onAction={() => setActiveTab("habits")}
        testId="today-habits"
      >
        {habitsQ.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : activeHabits.length === 0 ? (
          <Card className="card-hi flex items-center justify-between gap-3 rounded-2xl border-border/70 bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("today.habits.empty")}</p>
            <button
              type="button"
              onClick={() => setActiveTab("habits")}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-accent px-4 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("today.habits.add")}
            </button>
          </Card>
        ) : (
          <Card className="card-hi rounded-2xl border-border/70 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="tnum text-sm font-semibold">
                {doneCount === activeHabits.length
                  ? t("today.habits.allDone")
                  : t("today.habits.doneRatio", { done: fmt.number(doneCount), total: fmt.number(activeHabits.length) })}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="list">
              {activeHabits.map((habit) => (
                <button
                  key={habit.id}
                  type="button"
                  aria-pressed={habit.todayDone}
                  aria-label={`${habit.name} — ${habit.todayDone ? t("action.done") : t("action.add")}`}
                  onClick={() => toggleHabit.mutate(habit)}
                  className={`flex min-h-16 w-[8.5rem] shrink-0 flex-col items-start gap-1 rounded-xl border p-2.5 text-start transition-all active:scale-95 ${
                    habit.todayDone
                      ? "border-success/50 bg-success/12"
                      : "border-border bg-muted/40 hover:bg-muted"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <HabitGlyph icon={habit.icon} color={habit.color} />
                    <motion.span
                      initial={false}
                      animate={{ scale: habit.todayDone ? 1 : 0.85 }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        habit.todayDone ? "border-success bg-success text-background" : "border-muted-foreground/40 text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </motion.span>
                  </div>
                  <span className="line-clamp-1 w-full text-xs font-semibold leading-tight">{habit.name}</span>
                  {habit.streaks.current > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-warning">
                      <Flame className="h-3 w-3" aria-hidden />
                      <span className="tnum">{fmt.number(habit.streaks.current)}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Card>
        )}
      </Section>

      {/* Workout card */}
      <Section title={t("today.workout.section")} testId="today-workout">
        {workoutsQ.isLoading ? (
          <Skeleton className="h-28 rounded-2xl" />
        ) : (
          <Card className="card-hi relative overflow-hidden rounded-2xl border-border/70 bg-card p-4">
            <div aria-hidden className="pointer-events-none absolute -end-8 -top-8 h-32 w-32 rounded-full bg-grad-from/10 blur-2xl" />
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-accent text-primary-foreground shadow-lg shadow-primary/25">
                <Dumbbell className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                {activeWorkout ? (
                  <>
                    <p className="truncate text-sm font-semibold">
                      {t("today.workout.activeFor", {
                        time: fmt.number(Math.max(1, Math.round((Date.now() - new Date(activeWorkout.createdAt).getTime()) / 60000))),
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("today.workout.resume")}</p>
                  </>
                ) : suggestedTemplate ? (
                  <>
                    <p className="truncate text-sm font-semibold">{templateName(suggestedTemplate.name)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("today.workout.suggested")}</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold">{t("today.workout.restDay")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  haptic("medium");
                  openGym();
                }}
                className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-gradient-accent px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95"
              >
                {activeWorkout ? (
                  <>
                    <Timer className="h-4 w-4" aria-hidden />
                    {t("today.workout.resume")}
                  </>
                ) : (
                  <>
                    <Dumbbell className="h-4 w-4" aria-hidden />
                    {t("today.workout.start")}
                  </>
                )}
              </button>
            </div>
          </Card>
        )}
      </Section>

      {/* Nutrition ring */}
      <Section
        title={t("today.nutrition.section")}
        actionLabel={t("today.nutrition.view")}
        onAction={() => setActiveTab("body")}
        testId="today-nutrition"
      >
        {summaryQ.isLoading ? (
          <Skeleton className="h-28 rounded-2xl" />
        ) : (
          <Card className="card-hi rounded-2xl border-border/70 bg-card p-4">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90" aria-hidden>
                  <circle cx="46" cy="46" r="38" fill="none" stroke="var(--muted)" strokeWidth="9" />
                  <motion.circle
                    cx="46"
                    cy="46"
                    r="38"
                    fill="none"
                    stroke="url(#kcalGrad)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 38}
                    initial={false}
                    animate={{ strokeDashoffset: 2 * Math.PI * 38 * (1 - kcalRatio) }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                  <defs>
                    <linearGradient id="kcalGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--grad-from)" />
                      <stop offset="1" stopColor="var(--grad-to)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="tnum text-lg font-bold leading-none">{fmt.number(Math.round(consumed.kcal))}</span>
                  <span className="text-[10px] text-muted-foreground">/ {fmt.number(goals.kcal)}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-semibold">
                  {kcalLeft > 0
                    ? t("today.nutrition.remaining", { kcal: fmt.number(kcalLeft) })
                    : kcalOver > 0
                      ? t("today.nutrition.over", { kcal: fmt.number(kcalOver) })
                      : t("today.nutrition.noGoals")}
                </p>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{t("today.nutrition.protein", { current: fmt.number(Math.round(consumed.protein)), goal: fmt.number(goals.protein) })}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(proteinRatio * 100)}>
                    <motion.div
                      className="h-full rounded-full bg-success"
                      initial={false}
                      animate={{ width: `${proteinRatio * 100}%` }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                    />
                  </div>
                </div>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <UtensilsCrossed className="h-3 w-3" aria-hidden />
                  {t("nutrition.approx")}
                </p>
              </div>
            </div>
          </Card>
        )}
      </Section>

      {/* Tasks */}
      <Section
        title={t("today.tasks.section")}
        actionLabel={t("today.tasks.viewAll")}
        onAction={() => openNotesWithSegment("tasks")}
        testId="today-tasks"
      >
        {tasksQ.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : openTasks.length === 0 ? (
          <Card className="card-hi rounded-2xl border-border/70 bg-card p-4">
            <p className="text-sm text-muted-foreground">
              {doneTasksCount > 0
                ? t("today.tasks.doneCount", { count: doneTasksCount })
                : t("today.tasks.empty")}
            </p>
          </Card>
        ) : (
          <Card className="card-hi divide-y divide-border/60 rounded-2xl border-border/70 bg-card">
            {openTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => toggleTask.mutate(task)}
                aria-pressed={task.done}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-accent/50"
              >
                <span className="shrink-0">
                  <Circle className="h-5 w-5 text-muted-foreground/50" aria-hidden />
                </span>
                <span className="flex-1 truncate text-sm">{task.title}</span>
                {task.priority === 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-label={t("notes.priority.high")} />}
              </button>
            ))}
          </Card>
        )}
      </Section>

      {/* Muscle quick summary */}
      <Section
        title={t("today.muscles.section")}
        actionLabel={t("today.muscles.view")}
        onAction={() => setActiveTab("body")}
        testId="today-muscles"
      >
        {musclesQ.isLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : (
          <Card className="card-hi flex flex-wrap items-center gap-2 rounded-2xl border-border/70 bg-card p-4">
            {!muscleInsight ? (
              <p className="text-sm text-muted-foreground">{t("today.muscles.noData")}</p>
            ) : (
              <>
                <span className="flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-xs font-semibold text-success">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  {t("today.muscles.top", { name: muscleName(muscleInsight.top) })}
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-info/12 px-3 py-1.5 text-xs font-semibold text-info">
                  <Activity className="h-3.5 w-3.5" aria-hidden />
                  {t("today.muscles.trainedCount", {
                    count: muscleInsight.trainedCount,
                    n: fmt.number(muscleInsight.trainedCount),
                  })}
                </span>
              </>
            )}
          </Card>
        )}
      </Section>
    </div>
  );
}
