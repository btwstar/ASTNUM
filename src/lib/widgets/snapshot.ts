/**
 * Widget snapshot builder v2 — collects everything the 13 Android
 * home-screen widgets show and formats it EXACTLY like the app (locale
 * digits, plurals, units, the Arabic ٪ sign). Runs outside React (uses the
 * zustand store directly + translateKey) so it can be called from api.ts
 * mutation hooks and app-lifecycle events.
 *
 * Data source: the same apiGet contract as every screen — in the APK this
 * dispatches to the offline localStorage adapter, so the widgets reflect
 * the on-device data with zero network. The muscle-heat PNG is rendered by
 * the app's own anatomy paths (heat-image.ts) — widgets show the REAL map.
 *
 * Failure discipline: every section is independent — a failing fetch
 * degrades that one widget to its empty state and NEVER breaks the rest.
 */

import { apiGet } from "@/lib/api";
import { useAppStore } from "@/lib/store/app-store";
import {
  formatDate,
  formatNumber,
  formatTime,
  toLocalDateKey,
  addDaysToKey,
  dayKeyToWeekday,
} from "@/lib/i18n/format";
import { translateKey } from "@/lib/i18n";
import { ensureDict } from "@/lib/i18n/dictionaries";
import { isArabicDigitsLang, isRtlLang } from "@/lib/i18n/languages";
import { isScheduledOn, parseSchedule } from "@/lib/logic/streak";
import { weightToDisplay } from "@/components/body/units";
import { templateDisplayName } from "@/components/gym/shared";
import { renderHeatImage } from "./heat-image";
import type {
  WidgetSnapshot,
  WidgetMacro,
  WidgetMealItem,
  WidgetTaskItem,
  WidgetPinItem,
  WidgetEventItem,
  WidgetCalendarCell,
} from "./types";

/* ── API row shapes (subsets — only what the widgets read) ───────────── */

interface HabitRow {
  id: string;
  name: string;
  archived: boolean;
  scheduleJson: string | null;
  todayDone: boolean;
  todayFrozen: boolean;
  streaks: { current: number };
}

interface TaskRow {
  id: string;
  title: string;
  done: boolean;
  doneToday: boolean;
  overdue: boolean;
  /** ISO-8601 deadline — powers the upcoming-events + calendar marks */
  dueAt: string | null;
  repeating: boolean;
}

interface TemplateRow {
  id: string;
  name: string | null;
  days: number[];
  exercises: Array<{ targetSets: number }>;
}

/** A «عنصر مثبّت» config row as stored in the settings DB. */
interface PinConfig {
  type: "habit" | "session" | "note";
  id: string;
}

/** Note fields the pin widget reads (GET /api/notes/[id] subset). */
interface PinNoteRow {
  title: string;
  body: string;
  updatedAt: string;
  deletedAt: string | null;
  archived: boolean;
}

interface ActiveWorkoutRow {
  id: string;
  name: string | null;
  templateId: string | null;
  createdAt: string;
  volume: number;
  workSetCount: number;
}

interface WorkoutDetailRow {
  workout: ActiveWorkoutRow;
  sets: Array<{ exerciseId: string; setType: string }>;
  templateExercises: Array<{
    id: string;
    exerciseId: string;
    targetSets: number;
    exercise: { nameAr: string; nameEn: string } | null;
  }>;
  deferredIds?: string[];
}

interface MealTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface SummaryRow {
  consumed: MealTotals;
  goals: { kcal: number; protein: number; carbs: number; fat: number };
  meals: Record<string, MealTotals>;
}

interface HeatMuscleRow {
  id: string;
  nameAr: string;
  nameEn: string;
  svgId: string;
  level: number;
  volume: number;
  weightedSets: number;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Truncate on code-point boundaries (never splits an emoji). */
function truncateCp(text: string, max: number): string {
  const cps = Array.from(text);
  return cps.length <= max ? text : `${cps.slice(0, max).join("")}…`;
}

function clampBar(done: number, total: number): { barDone: number; barTotal: number } {
  if (!Number.isFinite(done) || done < 0) done = 0;
  if (!Number.isFinite(total) || total < 1) return { barDone: 0, barTotal: 0 };
  return { barDone: Math.min(Math.round(done), Math.round(total)), barTotal: Math.round(total) };
}

/** 0..100 clamped share. */
function share(done: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const v = Math.round((done / total) * 100);
  return Math.max(0, Math.min(100, v));
}

/** "٦٤٪" / "64%" — the REAL value (may exceed 100). Arabic-script UIs get ٪. */
function pctLabel(value: number, lang: string): string {
  const shown = !Number.isFinite(value) || value < 0 ? 0 : Math.min(999, Math.round(value));
  return `${formatNumber(shown, lang)}${isArabicDigitsLang(lang) ? "٪" : "%"}`;
}

/**
 * The widget card follows the SYSTEM dark/light mode (values/values-night
 * auto-switch), so the heat PNG must match the SYSTEM scheme too — even
 * when the app's own theme mode differs (e.g. app pinned dark, system light).
 */
function isLightTheme(): boolean {
  try {
    return typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
      : false;
  } catch {
    return false;
  }
}

function macroName(lang: string, key: "calories" | "carb" | "protein" | "fat"): string {
  const i18nKey =
    key === "calories"
      ? "widgets.s.calories"
      : key === "carb"
        ? "widgets.s.carb"
        : key === "protein"
          ? "widgets.s.protein"
          : "widgets.s.fat";
  return translateKey(lang, i18nKey);
}

/* ── section builders (each returns [data, ok]) ──────────────────────── */

/** All habit rows for today (shared by the habits section + the pins). */
function fetchHabits(todayKey: string): Promise<[HabitRow[], boolean]> {
  return apiGet<{ habits: HabitRow[] }>(`/api/habits?today=${todayKey}`)
    .then((res) => [(res.habits ?? []) as HabitRow[], true] as [HabitRow[], boolean])
    .catch(() => [[] as HabitRow[], false] as [HabitRow[], boolean]);
}

function buildHabits(
  lang: string,
  todayKey: string,
  rows: HabitRow[],
  ok: boolean
): [WidgetSnapshot["habits"], boolean] {
  if (!ok) {
    return [
      { done: 0, total: 0, label: "—", bar: { barDone: 0, barTotal: 0 }, items: [], emptyHint: "" },
      false,
    ];
  }
  const list = rows.filter((h) => !h.archived);
  const scheduled = list.filter((h) => isScheduledOn(parseSchedule(h.scheduleJson), todayKey));
  const done = scheduled.filter((h) => h.todayDone || h.todayFrozen).length;
  const items = scheduled.slice(0, 6).map((h, i) => ({
    id: h.id,
    name: truncateCp(h.name, 22),
    done: h.todayDone || h.todayFrozen,
    streakLabel: formatNumber(h.streaks?.current ?? 0, lang),
    hasStreak: (h.streaks?.current ?? 0) > 0,
    counterLabel: `${formatNumber(i + 1, lang)}/${formatNumber(Math.min(scheduled.length, 6), lang)}`,
  }));
  return [
    {
      done,
      total: scheduled.length,
      label: translateKey(lang, "widgets.s.habitsOf", {
        done: formatNumber(done, lang),
        total: formatNumber(scheduled.length, lang),
      }),
      bar: clampBar(done, scheduled.length),
      items,
      emptyHint: translateKey(lang, "widgets.s.habitsEmpty"),
    },
    true,
  ];
}

function buildTasks(
  lang: string,
  payload: TasksPayload
): [WidgetSnapshot["tasks"], boolean] {
  if (!payload.ok) {
    return [
      { label: "", pending: 0, doneToday: 0, totalToday: 0, items: [], emptyHint: "" },
      false,
    ] as [WidgetSnapshot["tasks"], boolean];
  }
  const today = payload.today;
  const overdue = payload.overdue;
  const completed = payload.completedToday;
  const pending = today.length + overdue.length;
  const doneToday = completed.length;
  const totalToday = doneToday + pending;
  const combined = [...today, ...overdue];
  const items: WidgetTaskItem[] = combined.slice(0, 6).map((t, i) => ({
    id: t.id,
    title: truncateCp(t.title, 26),
    done: !!(t.doneToday || t.done),
    overdue: !!t.overdue,
    counterLabel: `${formatNumber(i + 1, lang)}/${formatNumber(Math.min(pending, 6), lang)}`,
  }));
  const label =
    pending === 0
      ? translateKey(lang, "widgets.s.tasksNone")
      : `${translateKey(lang, "widgets.s.tasksPending", {
          count: today.length,
          n: formatNumber(today.length, lang),
        })}${
          overdue.length > 0
            ? " " +
              translateKey(lang, "widgets.s.tasksOverdue", {
                count: overdue.length,
                n: formatNumber(overdue.length, lang),
              })
            : ""
        }`;
  return [
    {
      label,
      pending,
      doneToday,
      totalToday,
      items,
      emptyHint: translateKey(lang, "widgets.s.tasksEmpty"),
    },
    true,
  ] as [WidgetSnapshot["tasks"], boolean];
}

/** Tasks fetch shared by the tasks list + upcoming events + calendar marks. */
interface TasksPayload {
  today: TaskRow[];
  overdue: TaskRow[];
  upcoming: TaskRow[];
  completedToday: TaskRow[];
  ok: boolean;
}

function fetchTasks(todayKey: string): Promise<TasksPayload> {
  return apiGet<{ today: TaskRow[]; overdue: TaskRow[]; upcoming: TaskRow[]; completedToday: TaskRow[] }>(`/api/tasks?scope=today&date=${todayKey}`)
    .then((res) => ({
      today: res.today ?? [],
      overdue: res.overdue ?? [],
      upcoming: res.upcoming ?? [],
      completedToday: res.completedToday ?? [],
      ok: true,
    }))
    .catch(() => ({ today: [], overdue: [], upcoming: [], completedToday: [], ok: false }));
}

function buildNutrition(
  lang: string
): Promise<[WidgetSnapshot["macros"], WidgetSnapshot["meals"], boolean]> {
  return apiGet<SummaryRow>(`/api/nutrition/summary?date=${toLocalDateKey()}`)
    .then((res) => {
      const consumed = res.consumed ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      const goals = res.goals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      const unit = useAppStore.getState().weightUnit;

      const macro = (
        key: "calories" | "carb" | "protein" | "fat",
        value: number,
        goal: number
      ): WidgetMacro => {
        const pct = share(value, goal);
        const real = goal > 0 ? (value / goal) * 100 : 0;
        const valueLabel =
          key === "calories"
            ? translateKey(lang, "widgets.s.kcalValue", {
                value: formatNumber(value, lang),
              })
            : translateKey(lang, "widgets.s.gramValue", {
                value: formatNumber(value, lang, { maximumFractionDigits: 0 }),
              });
        void unit; // kcal/grams are unit-free; kept for future weight-based macros
        return {
          name: macroName(lang, key),
          pct,
          pctLabel: pctLabel(real, lang),
          valueLabel,
        };
      };

      const kcalTotal = consumed.kcal;
      const mealKey = (k: string, fallbackName: string) =>
        translateKey(lang, `nutrition.meal.${k}`) === `nutrition.meal.${k}`
          ? fallbackName
          : translateKey(lang, `nutrition.meal.${k}`);

      const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
      const items: WidgetMealItem[] = MEAL_ORDER.map((k) => {
        const m = res.meals?.[k] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
        return {
          key: k,
          name: mealKey(k, k),
          kcal: m.kcal,
          kcalLabel: translateKey(lang, "widgets.s.mealKcal", {
            value: formatNumber(m.kcal, lang),
          }),
          detailLabel:
            m.kcal > 0
              ? translateKey(lang, "widgets.s.mealProtein", {
                  value: formatNumber(m.protein, lang, { maximumFractionDigits: 0 }),
                })
              : "",
          pct: share(m.kcal, kcalTotal),
        };
      });

      const totalLabel = translateKey(lang, "widgets.s.consumedOf", {
        consumed: formatNumber(consumed.kcal, lang),
        target: formatNumber(goals.kcal, lang),
      });

      const macros = {
        calories: macro("calories", consumed.kcal, goals.kcal),
        carb: macro("carb", consumed.carbs, goals.carbs),
        protein: macro("protein", consumed.protein, goals.protein),
        fat: macro("fat", consumed.fat, goals.fat),
      };
      const meals = {
        has: (res.meals && Object.values(res.meals).some((m) => m.kcal > 0)) || consumed.kcal > 0,
        items,
        totalLabel,
        emptyHint: translateKey(lang, "widgets.s.mealsEmpty"),
        bar: clampBar(consumed.kcal, goals.kcal),
      };
      return [macros, meals, true] as [WidgetSnapshot["macros"], WidgetSnapshot["meals"], boolean];
    })
    .catch(() => {
      const dead = (name: string): WidgetMacro => ({
        name,
        pct: 0,
        pctLabel: "",
        valueLabel: "",
      });
      return [
        {
          calories: dead(macroName(lang, "calories")),
          carb: dead(macroName(lang, "carb")),
          protein: dead(macroName(lang, "protein")),
          fat: dead(macroName(lang, "fat")),
        },
        { has: false, items: [], totalLabel: "", emptyHint: "", bar: { barDone: 0, barTotal: 0 } },
        false,
      ] as [WidgetSnapshot["macros"], WidgetSnapshot["meals"], boolean];
    });
}

/**
 * Active session detail — the current exercise is the first prescription
 * exercise that is not fully done AND not deferred (mirrors the app's
 * session order; carried exercises come first in the template list).
 */
function buildActiveWorkout(
  lang: string
): Promise<[WidgetSnapshot["workout"], number, boolean]> {
  return apiGet<{ active: ActiveWorkoutRow | null }>("/api/gym/workouts")
    .then(async (roster) => {
      const active = roster.active;
      if (!active) {
        return [
          {
            active: false,
            name: "",
            startedAtMs: 0,
            volumeLabel: "",
            currentExercise: null,
            nextLabel: "",
          },
          0,
          true,
        ] as [WidgetSnapshot["workout"], number, boolean];
      }
      const unit = useAppStore.getState().weightUnit;
      const detail = await apiGet<WorkoutDetailRow>(`/api/gym/workouts/${active.id}`).catch(
        () => null
      );
      const deferred = new Set(detail?.deferredIds ?? []);
      const workDone = new Map<string, number>();
      for (const s of detail?.sets ?? []) {
        if (s.setType === "work") workDone.set(s.exerciseId, (workDone.get(s.exerciseId) ?? 0) + 1);
      }
      const current =
        (detail?.templateExercises ?? []).find((te) => {
          if (deferred.has(te.exerciseId)) return false;
          if (workDone.has(te.exerciseId) && (workDone.get(te.exerciseId) ?? 0) >= te.targetSets)
            return false;
          // never-due prescription (target 0) → skip
          return te.targetSets > 0 || !workDone.has(te.exerciseId);
        }) ?? null;
      const nextIdx = current
        ? (detail?.templateExercises ?? []).findIndex((te) => te.exerciseId === current.exerciseId) + 1
        : -1;
      const nextTe = nextIdx >= 0 ? detail?.templateExercises?.[nextIdx] ?? null : null;

      const setsTarget = (detail?.templateExercises ?? []).reduce((s, te) => s + te.targetSets, 0);

      return [
        {
          active: true,
          name: templateDisplayName(active.name, lang),
          startedAtMs: Date.parse(active.createdAt) || Date.now(),
          volumeLabel: translateKey(lang, "widgets.s.volume", {
            value: `${formatNumber(weightToDisplay(active.volume, unit), lang)} ${translateKey(lang, unit === "lb" ? "unit.lb" : "unit.kg")}`,
          }),
          currentExercise: current
            ? {
                id: current.exerciseId,
                name: templateDisplayName(current.exercise?.nameAr ? current.exercise.nameAr : current.exercise?.nameEn ?? "", lang),
                setsDone: workDone.get(current.exerciseId) ?? 0,
                setsTarget: current.targetSets,
                setsLabel: translateKey(lang, "widgets.s.progressSets", {
                  done: formatNumber(workDone.get(current.exerciseId) ?? 0, lang),
                  total: formatNumber(current.targetSets, lang),
                }),
              }
            : null,
          nextLabel: nextTe
            ? translateKey(lang, "widgets.s.activeNext", {
                name: templateDisplayName(nextTe.exercise?.nameAr ?? nextTe.exercise?.nameEn ?? "", lang),
              })
            : "",
        },
        setsTarget > 0 ? share(active.workSetCount, setsTarget) : 0,
        true,
      ] as [WidgetSnapshot["workout"], number, boolean];
    })
    .catch(
      () =>
        [
          {
            active: false,
            name: "",
            startedAtMs: 0,
            volumeLabel: "",
            currentExercise: null,
            nextLabel: "",
          },
          0,
          false,
        ] as [WidgetSnapshot["workout"], number, boolean]
    );
}

/** All workout templates (shared by the sessions section + the pins). */
function fetchTemplates(): Promise<[TemplateRow[], boolean]> {
  return apiGet<{ templates: TemplateRow[] }>("/api/gym/templates")
    .then((res) => [(res.templates ?? []) as TemplateRow[], true] as [TemplateRow[], boolean])
    .catch(() => [[] as TemplateRow[], false] as [TemplateRow[], boolean]);
}

/** Scheduled sessions per the user's own day assignments (≤4, today first). */
function buildSessions(
  lang: string,
  templates: TemplateRow[],
  ok: boolean
): [WidgetSnapshot["sessions"], boolean] {
  if (!ok) return [{ items: [], emptyHint: "" }, false];
  const weekday = dayKeyToWeekday(toLocalDateKey());
  const dayName = (offset: number) =>
    offset <= 0
      ? translateKey(lang, "widgets.s.sessionToday")
      : offset === 1
        ? translateKey(lang, "widgets.s.sessionTomorrow")
        : translateKey(lang, `gym.dayShort.${(weekday + offset) % 7}`);
  const detailOf = (t: TemplateRow) => {
    const sets = t.exercises.reduce((s, e) => s + e.targetSets, 0);
    return `${translateKey(lang, "widgets.s.exercises", {
      count: t.exercises.length,
      n: formatNumber(t.exercises.length, lang),
    })} • ${translateKey(lang, "widgets.s.sets", { count: sets, n: formatNumber(sets, lang) })}`;
  };

  const items: WidgetSnapshot["sessions"]["items"] = [];
  for (const t of templates) {
    if (!t.days.includes(weekday)) continue;
    items.push({
      templateId: t.id,
      name: templateDisplayName(t.name, lang),
      dayLabel: dayName(0),
      isToday: true,
      detail: detailOf(t),
    });
  }
  const upcoming = templates
    .flatMap((t) => t.days.map((d) => ({ t, offset: (d - weekday + 7) % 7 || 7 })))
    .filter((x) => x.offset > 0)
    .sort((a, b) => a.offset - b.offset);
  for (const x of upcoming) {
    if (items.length >= 4) break;
    if (items.some((i) => i.templateId === x.t.id)) continue;
    items.push({
      templateId: x.t.id,
      name: templateDisplayName(x.t.name, lang),
      dayLabel: dayName(x.offset),
      isToday: false,
      detail: detailOf(x.t),
    });
  }

  return [
    { items: items.slice(0, 4), emptyHint: translateKey(lang, "widgets.s.sessionsEmpty") },
    true,
  ];
}

/** Muscle-heat figure PNG (app-rendered) + top-muscle caption. */
function buildHeat(lang: string): Promise<[WidgetSnapshot["heat"], boolean]> {
  return apiGet<{ muscles: HeatMuscleRow[] }>("/api/muscles/load?days=30")
    .then(async (res) => {
      const muscles = res.muscles ?? [];
      if (muscles.length === 0) {
        return [{ has: false, periodLabel: "", image: "", topLabel: "" }, false] as [
          WidgetSnapshot["heat"],
          boolean,
        ];
      }
      const image = await renderHeatImage(muscles, isLightTheme());
      const top = [...muscles].sort((a, b) => b.volume - a.volume)[0];
      const topLabel =
        top && top.volume > 0
          ? translateKey(lang, "widgets.s.heatTop", {
              name: isArabicDigitsLang(lang) ? top.nameAr : top.nameEn,
            })
          : "";
      return [
        {
          has: image != null,
          periodLabel: translateKey(lang, "widgets.s.heat30"),
          image: image ?? "",
          topLabel,
        },
        image != null,
      ] as [WidgetSnapshot["heat"], boolean];
    })
    .catch(() => [{ has: false, periodLabel: "", image: "", topLabel: "" }, false] as [
      WidgetSnapshot["heat"],
      boolean,
    ]);
}

/* ── quick-add buttons + native dialog labels (pure — no data) ─────── */

function buildQuickAdd(lang: string): WidgetSnapshot["quickAdd"] {
  return {
    habitLabel: translateKey(lang, "widgets.s.qaHabitLabel"),
    habitHint: translateKey(lang, "widgets.s.qaHabitHint"),
    noteLabel: translateKey(lang, "widgets.s.qaNoteLabel"),
    noteHint: translateKey(lang, "widgets.s.qaNoteHint"),
    // native quick-add dialog (v1.22): reuses SHARED base keys — every
    // registered language already carries them, so the dialog is fully
    // translated from day one with no extra pipeline work
    titleHabit: translateKey(lang, "habits.editor.addTitle"),
    titleNote: translateKey(lang, "notes.editor.newTitle"),
    inputHintHabit: translateKey(lang, "habits.editor.namePlaceholder"),
    inputHintNote: translateKey(lang, "notes.editor.titlePlaceholder"),
    save: translateKey(lang, "action.save"),
    cancel: translateKey(lang, "action.cancel"),
    saved: translateKey(lang, "state.saved"),
    errorEmpty: translateKey(lang, "error.validation"),
    rtl: isRtlLang(lang),
    // v2.4 — the dialog's third mode: one-tap drinks (same shared-key trick)
    waterLabel: translateKey(lang, "widgets.s.qaWaterLabel"),
    waterHint: translateKey(lang, "widgets.s.qaWaterHint"),
    juiceLabel: translateKey(lang, "widgets.s.qaJuiceLabel"),
    otherLabel: translateKey(lang, "widgets.s.qaDrinkLabel"),
    titleWater: translateKey(lang, "widgets.s.qaTitleWater"),
    amountLabel: translateKey(lang, "widgets.s.qaAmountLabel"),
    unitMl: translateKey(lang, "widgets.s.qaUnitMl"),
    amountHint: translateKey(lang, "widgets.s.qaAmountHint"),
    amounts: WATER_AMOUNTS.map((ml) =>
      formatNumber(ml, lang, { maximumFractionDigits: 0 })
    ),
  };
}

/* ── hydration («ماء اليوم» 1×1 ring + «المشروبات» 2×1 quick-add) ───── */

/** Preset amount chips shared by the card UI + the native dialog + the
 *  drinks widget buttons (ml; formatted per language on their way out). */
const WATER_AMOUNTS = [100, 250, 330, 500, 750] as const;

/**
 * Today's hydration totals vs the active ml goal. All drinks count toward
 * the goal (water, juice, tea…), matching the hydration card's contract.
 * Falls back to a goal-less placeholder — the widgets then render their
 * branded hint, never a broken number.
 */
function buildWater(lang: string): Promise<[WidgetSnapshot["water"], boolean]> {
  return apiGet<{ consumedMl: number; goal: { waterMl: number } }>(
    `/api/nutrition/water?date=${toLocalDateKey()}`
  )
    .then((res) => {
      const consumed = Number.isFinite(res.consumedMl) ? res.consumedMl : 0;
      const goal = Number.isFinite(res.goal?.waterMl) ? res.goal.waterMl : 0;

      const pct = share(consumed, goal);
      const real = goal > 0 ? (consumed / goal) * 100 : 0;
      const liters = (ml: number) =>
        formatNumber(ml / 1000, lang, { maximumFractionDigits: 1 });
      const goalDone = goal > 0 && consumed >= goal;

      return [
        {
          name: translateKey(lang, "widgets.s.water"),
          pct,
          pctLabel: pctLabel(real, lang),
          valueLabel:
            goal > 0
              ? translateKey(lang, "widgets.s.waterValueCompact", {
                  value: liters(consumed),
                  goal: liters(goal),
                })
              : translateKey(lang, "widgets.s.waterGoalOnly", {
                  goal: liters(Math.max(consumed, 0) || 0),
                }),
          headerLabel:
            goal > 0
              ? `${translateKey(lang, "widgets.s.drinksOf", {
                  consumed: formatNumber(Math.round(consumed), lang),
                  target: formatNumber(Math.round(goal), lang),
                })} ${translateKey(lang, "widgets.s.qaUnitMl")}`
              : "",
          headerDone: translateKey(lang, "widgets.s.drinksGoalDone"),
          goalDone,
          bar: clampBar(consumed, goal),
          plusWater: `+${formatNumber(250, lang)} ${translateKey(lang, "widgets.s.qaUnitMl")}`,
          plusJuice: `+${formatNumber(200, lang)} ${translateKey(lang, "widgets.s.qaUnitMl")}`,
          plusOther: `+${formatNumber(250, lang)} ${translateKey(lang, "widgets.s.qaUnitMl")}`,
        },
        true,
      ] as [WidgetSnapshot["water"], boolean];
    })
    .catch(() => {
      const dead = {
        name: translateKey(lang, "widgets.s.water"),
        pct: 0,
        pctLabel: "",
        valueLabel: "",
        headerLabel: "",
        headerDone: translateKey(lang, "widgets.s.drinksGoalDone"),
        goalDone: false,
        bar: { barDone: 0, barTotal: 0 },
        plusWater: `+${formatNumber(250, lang)} ${translateKey(lang, "widgets.s.qaUnitMl")}`,
        plusJuice: `+${formatNumber(200, lang)} ${translateKey(lang, "widgets.s.qaUnitMl")}`,
        plusOther: `+${formatNumber(250, lang)} ${translateKey(lang, "widgets.s.qaUnitMl")}`,
      };
      return [dead, false] as [WidgetSnapshot["water"], boolean];
    });
}

/* ── pinned items («عنصر مثبّت») ─────────────────────────────────────── */

const PIN_MAX = 8;

/**
 * The pin configs map from the settings DB: {"<appWidgetId>": {type,id}}.
 * Corrupt/malformed rows are dropped — the matching widget then shows its
 * tap-to-choose placeholder (the honest degraded state).
 */
function pinConfigs(): Promise<Record<string, PinConfig>> {
  return apiGet<Record<string, string>>("/api/settings")
    .then((res) => {
      const raw = res?.["widget_pins"];
      if (!raw || typeof raw !== "string") return {};
      try {
        const parsed = JSON.parse(raw) as Record<string, PinConfig>;
        const out: Record<string, PinConfig> = {};
        for (const [wid, cfg] of Object.entries(parsed)) {
          const n = Number(wid);
          if (!Number.isFinite(n) || n < 0 || !cfg || typeof cfg !== "object") continue;
          if (cfg.type !== "habit" && cfg.type !== "session" && cfg.type !== "note") continue;
          if (typeof cfg.id !== "string" || !cfg.id) continue;
          out[String(n)] = { type: cfg.type, id: cfg.id };
        }
        return out;
      } catch {
        return {};
      }
    })
    .catch(() => ({} as Record<string, PinConfig>));
}

/** Strip light markdown → a readable single-line preview. */
function plainPreview(body: string, max: number): string {
  const text = (body ?? "")
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/[#>*_~`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return truncateCp(text, max);
}

/** Resolve every configured pin into a fully-formatted item row. */
async function buildPins(
  lang: string,
  todayKey: string,
  habitRows: HabitRow[],
  templates: TemplateRow[]
): Promise<WidgetSnapshot["pins"]> {
  const configs = await pinConfigs();
  const entries = Object.entries(configs).slice(0, PIN_MAX);
  const weekday = dayKeyToWeekday(todayKey);

  // note pins resolve in parallel (each is one cheap detail read)
  const noteIds = entries.filter(([, c]) => c.type === "note").map(([, c]) => c.id);
  const notes = new Map<string, PinNoteRow | null>();
  await Promise.all(
    noteIds.map(async (id) => {
      const n = await apiGet<PinNoteRow>(`/api/notes/${id}`).catch(() => null);
      notes.set(id, n);
    })
  );

  const items: WidgetPinItem[] = [];
  for (const [wid, cfg] of entries) {
    const widgetId = Number(wid);

    if (cfg.type === "habit") {
      const h = habitRows.find((x) => x.id === cfg.id && !x.archived);
      if (!h) continue; // habit gone → that widget shows its picker again
      const done = h.todayDone || h.todayFrozen;
      const streak = h.streaks?.current ?? 0;
      items.push({
        widgetId,
        type: "habit",
        id: h.id,
        title: truncateCp(h.name, 40),
        line1: translateKey(lang, "widgets.s.pinStreak", {
          count: streak,
          n: formatNumber(streak, lang),
        }),
        line2: translateKey(
          lang,
          done ? "widgets.s.pinDoneToday" : "widgets.s.pinDueToday"
        ),
        hasAction: true,
        buttonLabel: translateKey(lang, done ? "widgets.s.pinUndo" : "widgets.s.pinLog"),
        actionUri: `astnum://open?tab=habits&toggle=${h.id}`,
        openUri: `astnum://open?tab=habits&habit=${h.id}`,
      });
    } else if (cfg.type === "session") {
      const t = templates.find((x) => x.id === cfg.id);
      if (!t) continue;
      const hasToday = t.days.includes(weekday);
      const offset = hasToday
        ? 0
        : (t.days.map((d) => (d - weekday + 7) % 7).sort((a, b) => a - b)[0] ?? 7);
      const dayLabel =
        offset === 0
          ? translateKey(lang, "widgets.s.sessionToday")
          : offset === 1
            ? translateKey(lang, "widgets.s.sessionTomorrow")
            : translateKey(lang, `gym.dayShort.${(weekday + offset) % 7}`);
      const sets = t.exercises.reduce((s, e) => s + e.targetSets, 0);
      items.push({
        widgetId,
        type: "session",
        id: t.id,
        title: templateDisplayName(t.name, lang),
        line1: `${translateKey(lang, "widgets.s.exercises", {
          count: t.exercises.length,
          n: formatNumber(t.exercises.length, lang),
        })} • ${translateKey(lang, "widgets.s.sets", { count: sets, n: formatNumber(sets, lang) })}`,
        line2: dayLabel,
        hasAction: true,
        buttonLabel: translateKey(lang, "widgets.s.pinStart"),
        actionUri: `astnum://open?tab=gym&start=${t.id}`,
        openUri: `astnum://open?tab=gym&start=${t.id}`,
      });
    } else {
      const n = notes.get(cfg.id) ?? null;
      if (!n || n.deletedAt) continue; // deleted → picker again
      const title = truncateCp((n.title ?? "").trim() || "—", 40);
      items.push({
        widgetId,
        type: "note",
        id: cfg.id,
        title,
        line1: plainPreview(n.body, 90),
        line2: translateKey(lang, "widgets.s.pinNoteUpdated", {
          date: formatDate(new Date(n.updatedAt), lang, { day: "numeric", month: "short" }),
        }),
        hasAction: false,
        buttonLabel: "",
        actionUri: `astnum://open?tab=notes&note=${cfg.id}`,
        openUri: `astnum://open?tab=notes&note=${cfg.id}`,
      });
    }
  }

  return {
    items,
    labelHabit: translateKey(lang, "widgets.s.pinTypeHabit"),
    labelSession: translateKey(lang, "widgets.s.pinTypeSession"),
    labelNote: translateKey(lang, "widgets.s.pinTypeNote"),
    chooseCta: translateKey(lang, "widgets.s.pinChooseCta"),
    chooseHint: translateKey(lang, "widgets.s.pinChooseHint"),
  };
}

/* ── v2.3: the shared title block («عناوين الودجات») ────────────────── */

/**
 * EVERY widget title/hint, pre-formatted in the app's language — the native
 * layer renders zero hardcoded strings, so all 160 languages get fully
 * localized widget UIs (v2.2 still hardcoded EN/AR titles in 13 widgets).
 */
function buildTitles(lang: string): WidgetSnapshot["t"] {
  const k = (key: string) => translateKey(lang, key);
  return {
    brand: k("widgets.s.brand"),
    openApp: k("widgets.s.openApp"),
    noData: k("widgets.s.noData"),
    habitsTitle: k("widgets.s.habitsTitle"),
    habitsEmpty: k("widgets.s.habitsEmpty"),
    habitFlipTitle: k("widgets.s.habitFlipTitle"),
    tasksTitle: k("widgets.s.tasksTitle"),
    tasksEmpty: k("widgets.s.tasksEmpty"),
    taskFlipTitle: k("widgets.s.taskFlipTitle"),
    mealsTitle: k("widgets.s.mealsTitle"),
    mealsEmpty: k("widgets.s.mealsEmpty"),
    sessionsTitle: k("widgets.s.sessionsTitle"),
    sessionsEmpty: k("widgets.s.sessionsEmpty"),
    activeTitle: k("widgets.s.activeTitle"),
    activeNone: k("widgets.s.activeNone"),
    activeStartHint: k("widgets.s.activeStartHint"),
    activeLogSet: k("widgets.s.activeLogSet"),
    activeNext: k("widgets.s.activeNextExercise"),
    activeAllDone: k("widgets.s.activeAllDone"),
    heatTitle: k("widgets.s.heatTitle"),
    heatRegen: k("widgets.s.heatEmpty"),
    percentTitle: k("widgets.s.percentTitle"),
    flipHint: k("widgets.s.flipHint"),
    eventsTitle: k("widgets.s.eventsTitle"),
    eventsEmpty: k("widgets.s.eventsEmpty"),
  };
}

/* ── v2.3: «الأحداث القادمة» upcoming events ───────────────────────── */

/** ISO timestamp → local YYYY-MM-DD key (DST-safe, never throws). */
function isoToLocalKey(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Whole days from today to key (negative when key is in the past). */
function daysFromToday(todayKey: string, key: string): number {
  const ms = Date.parse(`${key}T12:00:00`) - Date.parse(`${todayKey}T12:00:00`);
  return Math.round(ms / 86_400_000);
}

/** "اليوم" | "غدًا" | weekday short — same vocabulary as the sessions widget. */
function whenLabelFor(lang: string, offset: number, todayKey: string): string {
  if (offset <= 0) return translateKey(lang, "widgets.s.sessionToday");
  if (offset === 1) return translateKey(lang, "widgets.s.sessionTomorrow");
  const wd = dayKeyToWeekday(addDaysToKey(todayKey, offset));
  return translateKey(lang, `gym.dayShort.${wd}`);
}

/**
 * The next ≤4 things ahead across the coming week: scheduled workout
 * sessions (template day assignments) + dated pending tasks, sorted by day.
 */
function buildEvents(
  lang: string,
  todayKey: string,
  tasks: TasksPayload,
  templates: TemplateRow[]
): WidgetSnapshot["events"] {
  const weekday = dayKeyToWeekday(todayKey);
  const evs: Array<{ at: number; item: WidgetEventItem }> = [];

  // scheduled sessions across the next 7 days (0 = today)
  for (let off = 0; off < 7; off++) {
    const wd = (weekday + off) % 7;
    for (const t of templates) {
      if (!t.days.includes(wd)) continue;
      evs.push({
        at: off,
        item: {
          kind: "session",
          title: truncateCp(templateDisplayName(t.name, lang), 26),
          whenLabel: whenLabelFor(lang, off, todayKey),
          isToday: off === 0,
          openUri: `astnum://open?tab=gym&start=${t.id}`,
        },
      });
    }
  }

  // dated pending tasks within the next 7 days
  if (tasks.ok) {
    for (const t of tasks.upcoming) {
      if (t.done || t.repeating || !t.dueAt) continue;
      const key = isoToLocalKey(t.dueAt);
      if (!key) continue;
      const off = daysFromToday(todayKey, key);
      if (off < 0 || off > 6) continue;
      evs.push({
        at: off,
        item: {
          kind: "task",
          title: truncateCp(t.title, 26),
          whenLabel: whenLabelFor(lang, off, todayKey),
          isToday: off === 0,
          openUri: "astnum://open?tab=notes&sub=tasks",
        },
      });
    }
  }

  evs.sort((a, b) => a.at - b.at || (a.item.kind === "session" ? -1 : 1));
  return {
    title: translateKey(lang, "widgets.s.eventsTitle"),
    emptyHint: translateKey(lang, "widgets.s.eventsEmpty"),
    items: evs.slice(0, 4).map((e) => e.item),
  };
}

/* ── v2.3: «التقويم» the 31-day month grid ──────────────────────────── */

/** Days in the month of a YYYY-MM-DD key. */
function daysInMonthOf(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * The current month as a 6×7 Sunday-first grid with per-day marks:
 *   • session dot — a workout template is assigned to that weekday
 *   • task dot — a dated pending task is due that day
 *   • habit dot — at least one habit was completed that day
 * Day taps deep-link astnum://open?tab=today&cal=<date> → the app's calendar
 * sheet focused on that day. Out-of-month cells render empty.
 */
/** (dayKeyToWeekday is Sunday-first 0..6; the editor shifts the grid.) */
function weekOffset(firstKey: string, weekStart: number): number {
  return (dayKeyToWeekday(firstKey) - weekStart + 7) % 7;
}

async function buildCalendar(
  lang: string,
  todayKey: string,
  tasks: TasksPayload,
  templates: TemplateRow[]
): Promise<WidgetSnapshot["calendar"]> {
  const [y, m] = todayKey.split("-").map(Number);
  const monthPrefix = `${y}-${String(m).padStart(2, "0")}-`;
  const firstKey = `${monthPrefix}01`;

  // v2.4 calendar editor: persisted week start + day-mark toggles
  const { calendarWeekStart, calendarMarks } = useAppStore.getState();
  const gridStart = addDaysToKey(firstKey, -weekOffset(firstKey, calendarWeekStart));

  // session weekdays (the user's own template day assignments)
  const sessionWds = new Set<number>();
  for (const t of templates) for (const d of t.days) sessionWds.add(d);

  // pending dated tasks due inside this month (repeating tasks surface via
  // the today view only — their occurrence grid is not day-mapped here)
  const taskDays = new Set<string>();
  if (tasks.ok) {
    for (const t of [...tasks.today, ...tasks.overdue, ...tasks.upcoming]) {
      if (t.done || t.repeating || !t.dueAt) continue;
      const key = isoToLocalKey(t.dueAt);
      if (key && key.startsWith(monthPrefix)) taskDays.add(key);
    }
  }

  // habit completion days (one cheap stats read over the month)
  const habitDays = new Set<string>();
  const monthEnd = `${monthPrefix}${String(daysInMonthOf(todayKey)).padStart(2, "0")}`;
  const stats = await apiGet<{ days: Array<{ date: string; done: number }> }>(
    `/api/habits/stats?from=${firstKey}&to=${monthEnd}`
  ).catch(() => null);
  for (const d of stats?.days ?? []) {
    if (d.done > 0) habitDays.add(d.date);
  }

  const cells: WidgetCalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const key = addDaysToKey(gridStart, i);
    const inMonth = key.startsWith(monthPrefix);
    cells.push({
      dayLabel: inMonth ? formatNumber(Number(key.slice(8, 10)), lang) : "",
      inMonth,
      isToday: key === todayKey,
      hasSession: inMonth && calendarMarks.session && sessionWds.has(dayKeyToWeekday(key)),
      hasTask: inMonth && calendarMarks.task && taskDays.has(key),
      hasHabit: inMonth && calendarMarks.habit && habitDays.has(key),
      openUri: inMonth ? `astnum://open?tab=today&cal=${key}` : "",
    });
  }

  // weekday headers — the SAME translated vocabulary the gym uses, rotated
  // so the user-chosen week start is the first column (0=Sun · 1=Mon · 6=Sat)
  const dow = Array.from({ length: 7 }, (_, i) =>
    translateKey(lang, `gym.dayShort.${(i + calendarWeekStart) % 7}`)
  );
  const monthLabel = formatDate(new Date(y, m - 1, 1, 12), lang, {
    month: "long",
    year: "numeric",
  });

  return {
    monthLabel,
    dow,
    cells,
    todayUri: `astnum://open?tab=today&cal=${todayKey}`,
  };
}

/* ── the snapshot ────────────────────────────────────────────────────── */

/** Build the full widget payload (all sections, parallel cheap reads). */
export async function buildWidgetSnapshot(): Promise<WidgetSnapshot> {
  const todayKey = toLocalDateKey();
  const lang = useAppStore.getState().lang;

  /* 160-language support: make sure the merged dictionary for this language
   * is resident BEFORE any section builder formats text (lazy chunk). */
  await ensureDict(lang);

  /* shared reads: habits rows + templates + tasks feed their own sections,
   * the pinned-item resolution, the events and the calendar (one each). */
  const [[habitRows, habitsOk], [templates, templatesOk], tasksPayload] =
    await Promise.all([fetchHabits(todayKey), fetchTemplates(), fetchTasks(todayKey)]);

  const [habits, tasks, nutrition, active, sessions, heat, pins, events, calendar, water] =
    await Promise.all([
      Promise.resolve(buildHabits(lang, todayKey, habitRows, habitsOk)),
      Promise.resolve(buildTasks(lang, tasksPayload)),
      buildNutrition(lang),
      buildActiveWorkout(lang),
      Promise.resolve(buildSessions(lang, templates, templatesOk)),
      buildHeat(lang),
      buildPins(lang, todayKey, habitRows, templates),
      Promise.resolve(buildEvents(lang, todayKey, tasksPayload, templates)),
      buildCalendar(lang, todayKey, tasksPayload, templates),
      buildWater(lang),
    ]);
  const [macros, meals, nutritionOk] = nutrition;
  const [workout, workoutPct] = active;

  const okCount = [habits[1], tasks[1], nutritionOk, active[2], sessions[1], heat[1]].filter(
    Boolean
  ).length;

  /* percent rows — 7 ratios in display order */
  const rows: WidgetSnapshot["percent"]["rows"] = [
    {
      key: "habits",
      label: translateKey(lang, "widgets.s.pctHabits"),
      pct: share(habits[0].done, habits[0].total),
      pctLabel: pctLabel(habits[0].total > 0 ? (habits[0].done / habits[0].total) * 100 : 0, lang),
      bar: clampBar(habits[0].done, habits[0].total),
    },
    {
      key: "calories",
      label: translateKey(lang, "widgets.s.pctCalories"),
      pct: macros.calories.pct,
      pctLabel: macros.calories.pctLabel,
      bar: clampBar(meals.bar.barDone, meals.bar.barTotal),
    },
    {
      key: "protein",
      label: translateKey(lang, "widgets.s.protein"),
      pct: macros.protein.pct,
      pctLabel: macros.protein.pctLabel,
      bar: clampBar(macros.protein.pct, 100),
    },
    {
      key: "carb",
      label: translateKey(lang, "widgets.s.carb"),
      pct: macros.carb.pct,
      pctLabel: macros.carb.pctLabel,
      bar: clampBar(macros.carb.pct, 100),
    },
    {
      key: "fat",
      label: translateKey(lang, "widgets.s.fat"),
      pct: macros.fat.pct,
      pctLabel: macros.fat.pctLabel,
      bar: clampBar(macros.fat.pct, 100),
    },
    {
      key: "workout",
      label: translateKey(lang, "widgets.s.pctWorkout"),
      pct: workout.active ? workoutPct : 0,
      pctLabel: workout.active ? pctLabel(workoutPct, lang) : pctLabel(0, lang),
      bar: clampBar(workout.active ? workoutPct : 0, 100),
    },
    {
      key: "tasks",
      label: translateKey(lang, "widgets.s.pctTasks"),
      pct: share(tasks[0].doneToday, tasks[0].totalToday),
      pctLabel: pctLabel(
        tasks[0].totalToday > 0 ? (tasks[0].doneToday / tasks[0].totalToday) * 100 : 0,
        lang
      ),
      bar: clampBar(tasks[0].doneToday, tasks[0].totalToday),
    },
  ];

  return {
    v: 2,
    lang,
    rtl: isRtlLang(lang),
    dateLabel: formatDate(new Date(), lang, { weekday: "long", day: "numeric", month: "long" }),
    updatedAt: formatTime(new Date(), lang),
    empty: okCount === 0,
    macros,
    meals,
    habits: habits[0],
    tasks: tasks[0],
    workout,
    sessions: sessions[0],
    heat: heat[0],
    percent: { rows },
    quickAdd: buildQuickAdd(lang),
    pins,
    t: buildTitles(lang),
    water: water[0],
    events,
    calendar,
  };
}
