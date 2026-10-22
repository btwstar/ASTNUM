/**
 * ASTNUM — pure streak & schedule logic for the habits module.
 *
 * Design invariants:
 *  - ZERO database imports: everything works on plain date-key strings
 *    ("YYYY-MM-DD"), so this module is trivially testable and reusable on
 *    both the server (API routes) and the client (optimistic UI).
 *  - DST correctness: ALL calendar math happens on "YYYY-MM-DD" strings via
 *    Date.UTC — never through local-time Date objects. A 23h or 25h DST day
 *    can therefore never shift a date key; addDaysToKey("2025-03-30", 1) is
 *    always "2025-03-31" even though that night the clocks jump forward.
 *  - Retroactive edits: every function recomputes from scratch on each call,
 *    so editing a past log automatically fixes current/best streaks.
 */

/** 0 = Sunday … 6 = Saturday. */
export interface HabitSchedule {
  /**
   * "gymPlan" — a habit linked to a workout template. There is NO fixed
   * weekday schedule: the linked workouts ROTATE (complete one → the next
   * one becomes due). An unfinished workout is POSTPONED automatically —
   * it stays "your turn today" every following day until it is completed,
   * and postponement NEVER breaks the chain (see computeGymPlanStreaks).
   */
  type: "daily" | "weekdays" | "timesPerWeek" | "gymPlan";
  /** weekday numbers for `type === "weekdays"` */
  days?: number[];
  /** weekly target (1..7) for `type === "timesPerWeek"` */
  times?: number;
}

/** Streak values that trigger a celebration (in days, or weeks for timesPerWeek habits). */
export const STREAK_MILESTONES = [7, 30, 100] as const;

/** Policy: maximum streak freezes a single habit may use per calendar month. */
export const MAX_FREEZES_PER_MONTH = 2;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ────────────────────────────────────────────────────────────────
   Date-key helpers (pure UTC math — see DST note in the header)
   ──────────────────────────────────────────────────────────────── */

/** Add `days` to a "YYYY-MM-DD" key. Pure calendar math, timezone-free. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Weekday (0 = Sunday … 6 = Saturday) of a "YYYY-MM-DD" key, via UTC math. */
export function keyToWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** True when the string is a real calendar date in "YYYY-MM-DD" form. */
export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Signed whole-day distance from key a to key b (b - a). */
function daysBetween(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/* ────────────────────────────────────────────────────────────────
   Schedule helpers
   ──────────────────────────────────────────────────────────────── */

/**
 * Is the habit expected on this date?
 *  - daily            → every day
 *  - weekdays         → only the listed weekdays (defensive: an empty/missing
 *                       day list degrades to "every day" so a malformed row
 *                       can never produce a habit that can never be done)
 *  - timesPerWeek     → flexible: any day may count toward the weekly target
 */
export function isScheduledOn(schedule: HabitSchedule, dateKey: string): boolean {
  switch (schedule.type) {
    case "daily":
      return true;
    case "weekdays": {
      if (!schedule.days || schedule.days.length === 0) return true;
      return schedule.days.includes(keyToWeekday(dateKey));
    }
    case "timesPerWeek":
      return true;
    // gymPlan: no fixed schedule days — "due" is decided by the rotation
    // (gymPlanDue), never by the calendar. Day cells stay neutral unless done.
    default:
      return false;
  }
}

/**
 * Defensively parse the `scheduleJson` column. Any malformed payload falls
 * back to `{ type: "daily" }` so the app keeps working instead of crashing.
 */
export function parseSchedule(json: string | null | undefined): HabitSchedule {
  if (!json) return { type: "daily" };
  try {
    const raw: unknown = JSON.parse(json);
    return normalizeSchedule(raw) ?? { type: "daily" };
  } catch {
    return { type: "daily" };
  }
}

/**
 * Validate an unknown value as a HabitSchedule (used by the API routes).
 * Returns null when the value is not a legal schedule.
 */
export function normalizeSchedule(raw: unknown): HabitSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type === "daily") return { type: "daily" };
  if (obj.type === "weekdays") {
    if (!Array.isArray(obj.days)) return null;
    const days = [
      ...new Set(
        obj.days.filter(
          (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6
        )
      ),
    ].sort((a, b) => a - b);
    if (days.length === 0) return null;
    return { type: "weekdays", days };
  }
  if (obj.type === "timesPerWeek") {
    const times = Number(obj.times);
    if (!Number.isInteger(times) || times < 1 || times > 7) return null;
    return { type: "timesPerWeek", times };
  }
  // internal-only type: created exclusively by the template→habit converter
  // (never accepted from the public habit create/update payloads)
  if (obj.type === "gymPlan") return { type: "gymPlan" };
  return null;
}

/* ────────────────────────────────────────────────────────────────
   Streak computation
   ──────────────────────────────────────────────────────────────── */

/**
 * Compute the current and best streak of a habit.
 *
 * Unit: DAYS for daily/weekdays schedules, WEEKS for timesPerWeek schedules
 * (the UI labels weekly streaks explicitly so the number is never misleading).
 *
 * Semantics shared by both units:
 *  - A scheduled day that was done                    → keeps the chain, +1.
 *  - A scheduled day that was missed but is FROZEN    → forgiven: the chain
 *    survives, but the frozen day does NOT count as a done day (classic
 *    "streak freeze" semantics: your streak number stays, it just survives).
 *  - A scheduled day missed without a freeze          → the chain breaks.
 *  - An unscheduled day                              → transparent (skipped).
 *  - TODAY still pending (scheduled, not done, not frozen) never breaks the
 *    current streak — the day isn't over yet.
 *  - Freeze + timesPerWeek: a frozen day counts as one forgiven "time" toward
 *    the weekly target (otherwise freezes would be useless for weekly habits).
 */
export function computeStreaks(
  schedule: HabitSchedule,
  doneDates: Set<string>,
  freezes: Set<string>,
  todayKey: string
): { current: number; best: number } {
  if (schedule.type === "gymPlan") {
    return computeGymPlanStreaks(doneDates, todayKey);
  }
  if (schedule.type === "timesPerWeek") {
    return computeWeekStreaks(schedule, doneDates, freezes, todayKey);
  }
  return computeDayStreaks(schedule, doneDates, freezes, todayKey);
}

/**
 * Streaks for gymPlan habits (unit: COMPLETED WORKOUTS).
 *
 * Under rotation semantics an unfinished workout is postponed, never lost,
 * so the chain conceptually never breaks — every completion extends it.
 * The streak is therefore the number of completed workout occasions (done
 * day-keys ≤ today): "كم مرة أكملت هذا التمرين في الدورة الحالية". Freezes
 * are meaningless here (nothing can be "missed") and are ignored.
 */
function computeGymPlanStreaks(
  doneDates: Set<string>,
  todayKey: string
): { current: number; best: number } {
  let n = 0;
  for (const k of doneDates) if (k <= todayKey) n += 1;
  return { current: n, best: n };
}

/* ────────────────────────────────────────────────────────────────
   Gym-plan rotation (pure)
   ──────────────────────────────────────────────────────────────── */

export interface GymPlanHabitInput {
  id: string;
  sortOrder: number;
  createdAt: string;
  /** done day-keys of this habit (only `done: true` rows) */
  doneDates: Set<string>;
  todayDone: boolean;
}

export interface GymPlanTurn {
  /** habit id → "due" (its turn now, not completed today) | "next"
   *  (queued right behind the due one) | null (done today or far back) */
  turn: Map<string, "due" | "next">;
  /** habit id → days since its previous completion (0 when never done) —
   *  >1 on a due habit reads as "postponed N−1 days and still waiting". */
  pendingDays: Map<string, number>;
}

/**
 * Decide whose turn it is among the linked gym-plan habits.
 *
 * Order: by the LAST completion date (never-done sorts first), then by
 * sortOrder (creation order). The first habit in that order that is NOT
 * done today is DUE — completing it today hands the turn to the next one
 * in the same visit. A due workout the user keeps skipping stays due every
 * following day (automatic postponement) until it is completed.
 */
export function gymPlanDue(
  habits: Array<GymPlanHabitInput>,
  todayKey: string
): GymPlanTurn {
  const sorted = [...habits].sort((a, b) => {
    const lastA = a.doneDates.size > 0 ? maxKeyLE(a.doneDates, todayKey) : "";
    const lastB = b.doneDates.size > 0 ? maxKeyLE(b.doneDates, todayKey) : "";
    if (lastA !== lastB) return lastA < lastB ? -1 : 1; // "" (never) first
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  const turn = new Map<string, "due" | "next">();
  const pendingDays = new Map<string, number>();
  let mark: "due" | "next" | null = "due";
  for (const h of sorted) {
    const last = h.doneDates.size > 0 ? maxKeyLE(h.doneDates, todayKey) : "";
    pendingDays.set(h.id, last ? Math.max(0, daysBetween(last, todayKey)) : 0);
    if (mark && !h.todayDone) {
      turn.set(h.id, mark);
      mark = mark === "due" ? "next" : null;
    }
  }
  return { turn, pendingDays };
}

/** Largest day-key in the set that is ≤ todayKey ("" when none). */
function maxKeyLE(set: Set<string>, todayKey: string): string {
  let max = "";
  for (const k of set) if (k <= todayKey && k > max) max = k;
  return max;
}

/** Streaks for daily & weekdays schedules (unit: scheduled days). */
function computeDayStreaks(
  schedule: HabitSchedule,
  doneDates: Set<string>,
  freezes: Set<string>,
  todayKey: string
): { current: number; best: number } {
  // Earliest day worth looking at: the oldest log or freeze that is not future.
  const anchors: string[] = [];
  for (const k of doneDates) if (k <= todayKey) anchors.push(k);
  for (const k of freezes) if (k <= todayKey) anchors.push(k);
  anchors.sort();
  const historyStart = anchors.length > 0 ? anchors[0] : todayKey;

  // ── current: walk BACKWARD from today ─────────────────────────────
  let current = 0;
  let cursor = todayKey;
  // Today is still pending → it must not break the streak: skip it and judge
  // from yesterday. (A frozen or done today is judged normally below.)
  if (isScheduledOn(schedule, cursor) && !doneDates.has(cursor) && !freezes.has(cursor)) {
    cursor = addDaysToKey(cursor, -1);
  }
  while (cursor >= historyStart) {
    if (isScheduledOn(schedule, cursor)) {
      if (doneDates.has(cursor)) {
        current += 1;
      } else if (!freezes.has(cursor)) {
        break; // missed without a freeze → streak ends
      }
      // else: frozen → forgiven, chain continues without counting
    }
    // unscheduled → transparent
    cursor = addDaysToKey(cursor, -1);
  }

  // ── best: walk FORWARD over the whole history ──────────────────────
  let best = 0;
  let run = 0;
  let day = historyStart;
  while (day <= todayKey) {
    if (isScheduledOn(schedule, day)) {
      if (doneDates.has(day)) {
        run += 1;
        if (run > best) best = run;
      } else if (!freezes.has(day)) {
        run = 0;
      }
      // frozen → chain survives, not counted
    }
    day = addDaysToKey(day, 1);
  }
  if (current > best) best = current;

  return { current, best };
}

/**
 * Streaks for timesPerWeek schedules (unit: WEEKS).
 *
 * Week definition (documented choice): a week is a 7-day window ANCHORED AT
 * today — week 0 covers [today-6 … today], week 1 covers [today-13 … today-7],
 * etc. This keeps the math pure (no locale-dependent week starts, no tz data)
 * and matches the question the user actually asks: "did I hit my N times in
 * the trailing 7 days?". Because every call recomputes from today, the window
 * rolls forward automatically and retroactive edits are always honored.
 *
 * Week 0 is "in progress": if it already met the target it counts (+1), if it
 * is only partially met it must NOT break the streak (the week isn't over).
 */
function computeWeekStreaks(
  schedule: HabitSchedule,
  doneDates: Set<string>,
  freezes: Set<string>,
  todayKey: string
): { current: number; best: number } {
  const target = Math.min(7, Math.max(1, Math.round(schedule.times ?? 3)));

  const anchors: string[] = [];
  for (const k of doneDates) if (k <= todayKey) anchors.push(k);
  for (const k of freezes) if (k <= todayKey) anchors.push(k);
  anchors.sort();
  const historyStart = anchors.length > 0 ? anchors[0] : todayKey;

  /** Does the 7-day window ending at `weekEndKey` meet the target?
   *  Days before historyStart simply have no logs, so partial windows are
   *  naturally judged on their visible days. */
  const weekHasTarget = (weekEndKey: string): boolean => {
    let n = 0;
    for (let i = 0; i < 7 && n < target; i++) {
      const k = addDaysToKey(weekEndKey, -i);
      if (doneDates.has(k) || freezes.has(k)) n += 1;
    }
    return n >= target;
  };

  // ── current: week 0 (in progress) + consecutive met weeks going back ──
  // A week whose visible days already meet the target is SAFELY met (unseen
  // days can only add, never subtract), so even a partial window counts.
  // An unmet window stops the walk: fully-known unmet = real break, partial
  // unmet = unknown (we can neither credit it nor keep digging into days we
  // have no data for). Termination is guaranteed — every earlier window has
  // strictly fewer visible days, so eventually one is unmet.
  let current = 0;
  if (weekHasTarget(todayKey)) current += 1; // week 0, judged on visible days
  let w = 1;
  for (;;) {
    const weekEnd = addDaysToKey(todayKey, -7 * w);
    if (!weekHasTarget(weekEnd)) break;
    current += 1;
    w += 1;
  }

  // ── best: evaluate every week whose window intersects history, oldest → newest.
  // A fully-known unmet week resets the run; a PARTIAL unmet week (window
  // extends before historyStart) is "unknown" and is skipped — we can neither
  // credit nor blame days we have no data for.
  let best = 0;
  let run = 0;
  const diff = daysBetween(historyStart, todayKey);
  const maxW = Math.max(0, Math.floor(diff / 7));
  for (let i = maxW; i >= 0; i--) {
    const weekEnd = addDaysToKey(todayKey, -7 * i);
    const weekStart = addDaysToKey(weekEnd, -6);
    if (weekHasTarget(weekEnd)) {
      run += 1;
      if (run > best) best = run;
    } else if (weekStart >= historyStart) {
      run = 0;
    }
  }
  if (current > best) best = current;

  return { current, best };
}

/* ────────────────────────────────────────────────────────────────
   Completion & freeze policy helpers
   ──────────────────────────────────────────────────────────────── */

/**
 * Fraction (0..1) of the 7-day window STARTING at `weekStartKey` that was
 * completed. Denominator: number of scheduled days in the window for
 * daily/weekdays habits, or the weekly target for timesPerWeek habits.
 * Extra logs on unscheduled days still count toward the numerator.
 */
export function weeklyCompletion(
  schedule: HabitSchedule,
  doneDates: Set<string>,
  weekStartKey: string
): number {
  let done = 0;
  let target = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDaysToKey(weekStartKey, i);
    if (doneDates.has(k)) done += 1;
    if (isScheduledOn(schedule, k)) target += 1;
  }
  if (schedule.type === "timesPerWeek") {
    target = Math.min(7, Math.max(1, Math.round(schedule.times ?? 3)));
  }
  if (target <= 0) return 0;
  return Math.min(1, done / target);
}

/** How many freezes (dateKeys) fall inside the given "YYYY-MM" calendar month. */
export function monthFreezeCount(freezes: string[], yearMonth: string): number {
  let n = 0;
  for (const k of freezes) {
    if (k.length >= 7 && k.slice(0, 7) === yearMonth) n += 1;
  }
  return n;
}
