/**
 * ASTNUM — pure Statistics engine (v1.9: the Analyst became الإحصائيات).
 *
 * Computes concrete STATISTICS about the user's OWN data — "كم كيلو رفعت
 * اليوم؟ / كم مهمة أنجزت؟ / كم كيلو زدت؟" — as pure numbers with a label,
 * a context line and optional trend/breakdown. Deterministic, offline,
 * instant — no model, no network, no quota, and NO judgment: the stats
 * report what you DID, never what you skipped.
 *
 * Design invariants (frozen module contract):
 *  - ZERO database imports: works on a plain AnalystSnapshot that BOTH the
 *    web route (Prisma) and the offline adapter (local-api) build. Pure
 *    date-key math reuses @/lib/logic/streak (UTC, DST-safe).
 *  - No i18n strings here: every stat carries i18n KEYS + interpolation
 *    params. Entity names (exercises, muscles, habits) are resolved to the
 *    requested language inside the snapshot builder — the engine only
 *    passes them through. Synthetic breakdown rows carry `nameKey` instead
 *    (the UI translates those).
 *  - Weights are KILOGRAMS (display converts via store weightUnit).
 *  - hasData=false stats still return (the UI shows an honest empty state
 *    per stat) — the engine never invents numbers.
 */

import {
  addDaysToKey,
  computeStreaks,
  gymPlanDue,
  isScheduledOn,
  keyToWeekday,
  parseSchedule,
} from "@/lib/logic/streak";
import { isArabicDigitsLang } from "@/lib/i18n/languages";

/* ─────────────────────────── types ─────────────────────────── */

export type AnalystCategory = "gym" | "habits" | "tasks" | "body" | "nutrition";
export type AnalystLang = string;
export type AnalystUnit = "kg" | "sets" | "count" | "kcal" | "g" | "pct" | "day" | "week" | null;

export interface AnalystHabit {
  id: string;
  name: string;
  scheduleJson: string;
}
export interface AnalystHabitLog {
  habitId: string;
  date: string;
  done: boolean;
}
export interface AnalystWorkout {
  id: string;
  date: string;
  completedAt: string | null;
  durationSec: number;
}
export interface AnalystSet {
  workoutId: string;
  exerciseId: string;
  /** "work" | "failure" count toward volume; "warmup" never does */
  setType: string;
  reps: number;
  weight: number;
}
export interface AnalystNameRow {
  id: string;
  nameAr: string;
  nameEn: string;
}
export interface AnalystExerciseMuscle {
  exerciseId: string;
  muscleId: string;
  role: string;
  weight: number;
}
export interface AnalystMeasurement {
  date: string;
  weight: number;
}
export interface AnalystFoodLog {
  date: string;
  kcal: number;
  protein: number;
}
export interface AnalystTask {
  done: boolean;
  /** ISO timestamp of completion (null = done without a known time) */
  doneAt: string | null;
}

/** Everything the engine needs — built by the web route / offline adapter. */
export interface AnalystSnapshot {
  /** local "YYYY-MM-DD" of "now" (the caller's today) */
  nowKey: string;
  /** live (non-deleted, non-archived) habits */
  habits: AnalystHabit[];
  habitLogs: AnalystHabitLog[];
  /** freeze date keys per habit id */
  freezesByHabit: Record<string, string[]>;
  /** live workouts (deletedAt filtered by the builder) */
  workouts: AnalystWorkout[];
  sets: AnalystSet[];
  exercises: AnalystNameRow[];
  muscleGroups: AnalystNameRow[];
  exerciseMuscles: AnalystExerciseMuscle[];
  /** weight measurements sorted by date ASC */
  measurements: AnalystMeasurement[];
  foodLogs: AnalystFoodLog[];
  goals: { kcal: number; protein: number } | null;
  /** live (non-deleted) tasks */
  tasks: AnalystTask[];
}

export interface AnalystBreakdownBar {
  /** resolved entity name (already localized) — used when nameKey is absent */
  name: string;
  /** i18n key alternative for synthetic rows (translated by the UI) */
  nameKey?: string;
  value: number;
  /** 0..1 relative to the largest bar */
  ratio: number;
}

export interface AnalystInsight {
  id: string;
  category: AnalystCategory;
  /** i18n key of the statistic's LABEL (e.g. "حجم اليوم") */
  labelKey: string;
  hasData: boolean;
  /** primary stat number (null when hasData=false) */
  value: number | null;
  unit: AnalystUnit;
  /** i18n key of the context line (interpolates params) */
  detailKey: string;
  params: Record<string, string | number>;
  trend?: "up" | "down" | "flat";
  /** signed percentage for the trend chip (e.g. 12.5 → "+12.5%") */
  trendPct?: number;
  breakdown?: AnalystBreakdownBar[];
}

/* ─────────────────────── pure helpers ─────────────────────── */

/** Monday-based week start (mirrors the gym module's convention). */
function weekStartOf(dateKey: string): string {
  const wd = keyToWeekday(dateKey); // 0 = Sunday
  const mondayOffset = (wd + 6) % 7;
  return addDaysToKey(dateKey, -mondayOffset);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return round1((part / whole) * 100);
}

/* ───────────────────────── the engine ─────────────────────── */

export function computeAnalystInsights(
  snap: AnalystSnapshot,
  lang: AnalystLang
): AnalystInsight[] {
  const name = (row: { nameAr: string; nameEn: string }) =>
    isArabicDigitsLang(lang) ? row.nameAr : row.nameEn;

  /* ── GYM ─────────────────────────────────────────────────── */

  // live workouts → per-set lookup of the owning workout's date
  const liveWorkoutIds = new Set(snap.workouts.map((w) => w.id));
  const dateByWorkout = new Map(snap.workouts.map((w) => [w.id, w.date]));
  const workSets = snap.sets.filter(
    (s) => liveWorkoutIds.has(s.workoutId) && s.setType !== "warmup"
  );

  // 1) TODAY — volume lifted today + today's work-set count
  let todayVolume = 0;
  let todaySets = 0;
  for (const s of workSets) {
    const wDate = dateByWorkout.get(s.workoutId);
    if (wDate === snap.nowKey) {
      todayVolume += s.reps * s.weight;
      todaySets += 1;
    }
  }

  // 2) total volume lifted, all-time (+ this month's share)
  let totalVolume = 0;
  let monthVolume = 0;
  const monthStart = snap.nowKey.slice(0, 8) + "01";
  for (const s of workSets) {
    const vol = s.reps * s.weight;
    totalVolume += vol;
    const wDate = dateByWorkout.get(s.workoutId);
    if (wDate && wDate >= monthStart) monthVolume += vol;
  }
  const completedWorkouts = snap.workouts.filter((w) => w.completedAt !== null);

  // 3) workouts count + averages (needs a first-workout anchor)
  const workoutDates = [...new Set(snap.workouts.map((w) => w.date))].sort();
  const firstDate = workoutDates[0] ?? null;
  const weeksActive = firstDate
    ? Math.max(1, daysBetween(firstDate, snap.nowKey) / 7)
    : 0;
  const avgPerWeek = firstDate ? round1(completedWorkouts.length / weeksActive) : 0;
  const durations = completedWorkouts
    .map((w) => w.durationSec)
    .filter((d) => d > 0);
  const avgMinutes = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
    : 0;

  // 4) strongest lift — best Epley e1RM with its source set
  const exName = new Map(snap.exercises.map((e) => [e.id, name(e)]));
  let bestE1rm = 0;
  let bestSet: { exerciseId: string; weight: number; reps: number } | null = null;
  for (const s of workSets) {
    if (s.weight <= 0) continue;
    const e1rm = s.weight * (1 + s.reps / 30);
    if (e1rm > bestE1rm) {
      bestE1rm = e1rm;
      bestSet = { exerciseId: s.exerciseId, weight: s.weight, reps: s.reps };
    }
  }

  // 5) most-trained muscle — weighted set volume, last 60 days
  const cutoff60 = addDaysToKey(snap.nowKey, -59);
  const muscleName = new Map(snap.muscleGroups.map((m) => [m.id, name(m)]));
  const exToMuscles = new Map<string, AnalystExerciseMuscle[]>();
  for (const em of snap.exerciseMuscles) {
    const arr = exToMuscles.get(em.exerciseId);
    if (arr) arr.push(em);
    else exToMuscles.set(em.exerciseId, [em]);
  }
  const muscleLoad = new Map<string, number>();
  for (const s of workSets) {
    const wDate = dateByWorkout.get(s.workoutId);
    if (!wDate || wDate < cutoff60) continue;
    for (const em of exToMuscles.get(s.exerciseId) ?? []) {
      muscleLoad.set(em.muscleId, (muscleLoad.get(em.muscleId) ?? 0) + em.weight);
    }
  }
  const muscleRanking = [...muscleLoad.entries()]
    .filter(([id]) => muscleName.has(id))
    .sort((a, b) => b[1] - a[1]);

  // 6) this week vs last week volume
  const thisWeekStart = weekStartOf(snap.nowKey);
  const lastWeekStart = addDaysToKey(thisWeekStart, -7);
  let thisWeekVolume = 0;
  let lastWeekVolume = 0;
  for (const s of workSets) {
    const wDate = dateByWorkout.get(s.workoutId);
    if (!wDate) continue;
    if (wDate >= thisWeekStart) thisWeekVolume += s.reps * s.weight;
    else if (wDate >= lastWeekStart) lastWeekVolume += s.reps * s.weight;
  }
  const weekTrendPct =
    lastWeekVolume > 0
      ? pctOf(thisWeekVolume - lastWeekVolume, lastWeekVolume)
      : thisWeekVolume > 0
        ? 100
        : 0;

  const gymHasData = workSets.length > 0;

  /* ── HABITS ──────────────────────────────────────────────── */

  const doneByHabit = new Map<string, Set<string>>();
  let habitsDoneTotal = 0;
  for (const l of snap.habitLogs) {
    if (!l.done) continue;
    habitsDoneTotal += 1;
    let set = doneByHabit.get(l.habitId);
    if (!set) {
      set = new Set<string>();
      doneByHabit.set(l.habitId, set);
    }
    set.add(l.date);
  }

  // 7) best current streak across live habits
  // (gymPlan habits skipped: their "streak" counts completed workouts, not
  //  consecutive days — it would be mislabeled as a day/week streak here)
  let bestStreak = { value: 0, unit: "day" as AnalystUnit, habitName: "" };
  for (const h of snap.habits) {
    const schedule = parseSchedule(h.scheduleJson);
    if (schedule.type === "gymPlan") continue;
    const done = doneByHabit.get(h.id) ?? new Set<string>();
    const freezes = new Set(snap.freezesByHabit[h.id] ?? []);
    const { current } = computeStreaks(schedule, done, freezes, snap.nowKey);
    if (current > bestStreak.value) {
      bestStreak = {
        value: current,
        unit: schedule.type === "timesPerWeek" ? "week" : "day",
        habitName: h.name,
      };
    }
  }

  // 8) overall consistency across the last 30 days
  // Gym-plan habits are EXCLUDED: they have no fixed weekday schedule, so a
  // "consistency %" over scheduled days is meaningless for them (their
  // rotation + postponement semantics live in the habits-today stat).
  const cutoff30 = addDaysToKey(snap.nowKey, -29);
  const habitRates: Array<{ name: string; doneCount: number; scheduled: number; rate: number }> =
    [];
  let sumDone = 0;
  let sumScheduled = 0;
  for (const h of snap.habits) {
    const schedule = parseSchedule(h.scheduleJson);
    if (schedule.type === "gymPlan") continue;
    const done = doneByHabit.get(h.id) ?? new Set<string>();
    let doneCount = 0;
    let scheduled = 0;
    for (let i = 0; i < 30; i++) {
      const k = addDaysToKey(cutoff30, i);
      if (isScheduledOn(schedule, k)) {
        scheduled += 1;
        if (done.has(k)) doneCount += 1;
      } else if (done.has(k)) {
        doneCount += 1; // extra logs on unscheduled days still count
      }
    }
    sumDone += doneCount;
    sumScheduled += scheduled;
    if (scheduled > 0 || doneCount > 0) {
      habitRates.push({
        name: h.name,
        doneCount,
        scheduled: Math.max(1, scheduled),
        rate: scheduled > 0 ? doneCount / scheduled : 1,
      });
    }
  }
  const consistency = sumScheduled > 0 ? pctOf(sumDone, sumScheduled) : 0;
  habitRates.sort((a, b) => b.rate - a.rate);

  // 9) habits done today — gym-plan habits count when they are the ROTATION
  // head ("due today", postponed until done), not by the calendar.
  const gymRotation = gymPlanDue(
    snap.habits
      .filter((h) => parseSchedule(h.scheduleJson).type === "gymPlan")
      .map((h) => ({
        id: h.id,
        sortOrder: 0,
        createdAt: "",
        doneDates: doneByHabit.get(h.id) ?? new Set<string>(),
        todayDone: (doneByHabit.get(h.id) ?? new Set<string>()).has(snap.nowKey),
      })),
    snap.nowKey
  );
  let scheduledToday = 0;
  let doneToday = 0;
  for (const h of snap.habits) {
    const schedule = parseSchedule(h.scheduleJson);
    const done = doneByHabit.get(h.id) ?? new Set<string>();
    const isDone = done.has(snap.nowKey);
    if (
      isScheduledOn(schedule, snap.nowKey) ||
      isDone ||
      (schedule.type === "gymPlan" && gymRotation.turn.get(h.id) === "due")
    ) {
      scheduledToday += 1;
      if (isDone) doneToday += 1;
    }
  }

  /* ── TASKS ───────────────────────────────────────────────── */

  const cutoff7 = addDaysToKey(snap.nowKey, -6);
  const tasksTotal = snap.tasks.length;
  const tasksDone = snap.tasks.filter((t) => t.done);
  const tasksOpen = tasksTotal - tasksDone.length;
  // completions in the last 7 days (doneAt is ISO; compare date parts)
  const tasksDoneWeek = tasksDone.filter(
    (t) => t.doneAt && t.doneAt.slice(0, 10) >= cutoff7
  ).length;

  // grand total: everything the user ever completed in the app
  const allCompletions = habitsDoneTotal + tasksDone.length + completedWorkouts.length;

  /* ── BODY ────────────────────────────────────────────────── */

  const weights = snap.measurements; // sorted asc by the builder
  const firstW = weights[0] ?? null;
  const lastW = weights[weights.length - 1] ?? null;
  const weightDelta =
    firstW && lastW && firstW.weight > 0 && lastW.weight > 0
      ? round1(lastW.weight - firstW.weight)
      : null;

  /* ── NUTRITION ───────────────────────────────────────────── */

  const recentLogs = snap.foodLogs.filter((l) => l.date >= cutoff7);
  const loggedDays = new Set(recentLogs.map((l) => l.date)).size;
  const avgKcal = loggedDays
    ? Math.round(recentLogs.reduce((a, l) => a + l.kcal, 0) / loggedDays)
    : 0;
  const avgProtein = loggedDays
    ? Math.round(recentLogs.reduce((a, l) => a + l.protein, 0) / loggedDays)
    : 0;

  /* ── assemble ──────────────────────────────── */

  const insights: AnalystInsight[] = [
    {
      id: "volume-today",
      category: "gym",
      labelKey: "analyst.stat.volumeToday",
      hasData: gymHasData,
      value: gymHasData ? Math.round(todayVolume) : null,
      unit: "kg",
      detailKey:
        todayVolume > 0 ? "analyst.a.volumeToday.detail" : "analyst.a.volumeToday.none",
      params: { sets: todaySets },
    },
    {
      id: "week-volume",
      category: "gym",
      labelKey: "analyst.stat.weekVolume",
      hasData: thisWeekVolume > 0 || lastWeekVolume > 0,
      value: thisWeekVolume > 0 ? Math.round(thisWeekVolume) : 0,
      unit: "kg",
      detailKey: "analyst.a.weekVolume.detail",
      params: { last: Math.round(lastWeekVolume) },
      trend:
        lastWeekVolume === 0 && thisWeekVolume > 0
          ? "up"
          : thisWeekVolume > lastWeekVolume
            ? "up"
            : thisWeekVolume < lastWeekVolume
              ? "down"
              : "flat",
      trendPct: weekTrendPct,
    },
    {
      id: "volume-total",
      category: "gym",
      labelKey: "analyst.stat.volumeTotal",
      hasData: gymHasData,
      value: gymHasData ? Math.round(totalVolume) : null,
      unit: "kg",
      detailKey: "analyst.a.volumeTotal.detail",
      params: {
        pct: pctOf(monthVolume, totalVolume),
        n: completedWorkouts.length,
      },
    },
    {
      id: "workouts-count",
      category: "gym",
      labelKey: "analyst.stat.workoutsCount",
      hasData: completedWorkouts.length > 0,
      value: completedWorkouts.length > 0 ? completedWorkouts.length : null,
      unit: "count",
      detailKey:
        avgMinutes > 0
          ? "analyst.a.workoutsCount.detailFull"
          : "analyst.a.workoutsCount.detail",
      params: {
        perWeek: avgPerWeek,
        mins: avgMinutes,
      },
    },
    {
      id: "strongest-lift",
      category: "gym",
      labelKey: "analyst.stat.strongestLift",
      hasData: bestSet !== null,
      value: bestSet ? Math.round(bestE1rm) : null,
      unit: "kg",
      detailKey: "analyst.a.strongestLift.detail",
      params: bestSet
        ? {
            name: exName.get(bestSet.exerciseId) ?? "",
            weight: round1(bestSet.weight),
            reps: bestSet.reps,
          }
        : {},
    },
    {
      id: "top-muscle",
      category: "gym",
      labelKey: "analyst.stat.topMuscle",
      hasData: muscleRanking.length > 0,
      value: muscleRanking.length > 0 ? Math.round(muscleRanking[0][1]) : null,
      unit: "sets",
      detailKey: "analyst.a.topMuscle.detail",
      params: {},
      breakdown: toBars(muscleRanking.slice(0, 4), (id) => muscleName.get(id) ?? id),
    },
    {
      id: "best-streak",
      category: "habits",
      labelKey: "analyst.stat.bestStreak",
      hasData: bestStreak.value > 0,
      value: bestStreak.value > 0 ? bestStreak.value : null,
      unit: bestStreak.unit,
      detailKey: "analyst.a.bestStreak.detail",
      params: { name: bestStreak.habitName },
    },
    {
      id: "consistency-30",
      category: "habits",
      labelKey: "analyst.stat.consistency30",
      hasData: sumScheduled > 0,
      value: sumScheduled > 0 ? consistency : null,
      unit: "pct",
      detailKey: "analyst.a.consistency30.detail",
      params: { done: sumDone, scheduled: sumScheduled },
      breakdown:
        habitRates.length > 0
          ? habitRates
              .slice(0, 4)
              .map((r) => ({ name: r.name, value: Math.round(r.rate * 100), ratio: r.rate }))
          : undefined,
    },
    {
      id: "habits-today",
      category: "habits",
      labelKey: "analyst.stat.habitsToday",
      hasData: scheduledToday > 0 || doneToday > 0,
      value: doneToday,
      unit: "count",
      detailKey: "analyst.a.habitsToday.detail",
      params: { total: scheduledToday },
    },
    {
      id: "tasks-done",
      category: "tasks",
      labelKey: "analyst.stat.tasksDone",
      hasData: tasksDone.length > 0,
      value: tasksDone.length > 0 ? tasksDone.length : null,
      unit: "count",
      detailKey:
        tasksDoneWeek > 0 ? "analyst.a.tasksDone.detail" : "analyst.a.tasksDone.detailOld",
      params: { week: tasksDoneWeek },
    },
    {
      id: "tasks-open",
      category: "tasks",
      labelKey: "analyst.stat.tasksOpen",
      hasData: tasksTotal > 0,
      value: tasksOpen,
      unit: "count",
      detailKey:
        tasksOpen > 0 ? "analyst.a.tasksOpen.detail" : "analyst.a.tasksOpen.clear",
      params: { total: tasksTotal },
    },
    {
      id: "all-completions",
      category: "tasks",
      labelKey: "analyst.stat.allCompletions",
      hasData: allCompletions > 0,
      value: allCompletions > 0 ? allCompletions : null,
      unit: "count",
      detailKey: "analyst.a.allCompletions.detail",
      params: {},
      breakdown:
        allCompletions > 0
          ? [
              { name: "", nameKey: "analyst.source.habits", value: habitsDoneTotal, ratio: 0 },
              { name: "", nameKey: "analyst.source.tasks", value: tasksDone.length, ratio: 0 },
              {
                name: "",
                nameKey: "analyst.source.workouts",
                value: completedWorkouts.length,
                ratio: 0,
              },
            ].map((b) => ({ ...b, ratio: b.value / Math.max(1, allCompletions) }))
          : undefined,
    },
    {
      id: "weight-change",
      category: "body",
      labelKey: "analyst.stat.weightChange",
      hasData: weightDelta !== null,
      value: weightDelta,
      unit: "kg",
      detailKey: "analyst.a.weightChange.detail",
      params:
        firstW && lastW
          ? {
              first: round1(firstW.weight),
              latest: round1(lastW.weight),
              days: daysBetween(firstW.date, lastW.date),
            }
          : {},
      // no trend chip: the ± sign + from→to context carry the direction;
      // a %-based chip would be misleading without a baseline.
    },
    {
      id: "latest-weight",
      category: "body",
      labelKey: "analyst.stat.latestWeight",
      hasData: lastW !== null,
      value: lastW ? round1(lastW.weight) : null,
      unit: "kg",
      detailKey: "analyst.a.latestWeight.detail",
      params: lastW ? { date: lastW.date } : {},
    },
    {
      id: "calories-week",
      category: "nutrition",
      labelKey: "analyst.stat.caloriesWeek",
      hasData: loggedDays > 0,
      value: loggedDays > 0 ? avgKcal : null,
      unit: "kcal",
      detailKey: snap.goals
        ? "analyst.a.caloriesWeek.detailGoal"
        : "analyst.a.caloriesWeek.detail",
      params: {
        goal: snap.goals ? Math.round(snap.goals.kcal) : 0,
        days: loggedDays,
      },
    },
    {
      id: "protein-week",
      category: "nutrition",
      labelKey: "analyst.stat.proteinWeek",
      hasData: loggedDays > 0,
      value: loggedDays > 0 ? avgProtein : null,
      unit: "g",
      detailKey: snap.goals
        ? "analyst.a.proteinWeek.detailGoal"
        : "analyst.a.proteinWeek.detail",
      params: {
        goal: snap.goals ? Math.round(snap.goals.protein) : 0,
        days: loggedDays,
      },
    },
  ];

  return insights;
}

/* ─────────────────────── small internals ──────────────────── */

function toBars(
  ranking: Array<[string, number]>,
  resolveName: (id: string) => string
): AnalystBreakdownBar[] | undefined {
  if (ranking.length === 0) return undefined;
  const max = ranking[0][1] || 1;
  return ranking.map(([id, v]) => ({
    name: resolveName(id),
    value: Math.round(v * 10) / 10,
    ratio: Math.max(0.04, v / max),
  }));
}

/** Signed whole-day distance (b - a) — pure UTC math. */
function daysBetween(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
