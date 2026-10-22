/**
 * Pure-logic tests for the habits streak engine.
 * Run: bun test tests/streak.test.ts
 *
 * All fixtures use fixed "today" keys so the suite is deterministic.
 * Handy reference: 2025-01-01 was a Wednesday (weekday 3).
 */
import { test, expect } from "bun:test";
import {
  addDaysToKey,
  keyToWeekday,
  isScheduledOn,
  computeStreaks,
  weeklyCompletion,
  monthFreezeCount,
  parseSchedule,
  normalizeSchedule,
  type HabitSchedule,
} from "../src/lib/logic/streak";

const DAILY: HabitSchedule = { type: "daily" };
const MON_WED_FRI: HabitSchedule = { type: "weekdays", days: [1, 3, 5] };
const THREE_PER_WEEK: HabitSchedule = { type: "timesPerWeek", times: 3 };

/** 2025-01-10 is a Friday; used as "today" across most fixtures. */
const TODAY = "2025-01-10";

function setOf(...keys: string[]): Set<string> {
  return new Set(keys);
}

/* ── isScheduledOn ─────────────────────────────────────────────── */

test("isScheduledOn: daily is scheduled every day", () => {
  expect(isScheduledOn(DAILY, "2025-01-10")).toBe(true);
  expect(isScheduledOn(DAILY, "2024-07-07")).toBe(true);
});

test("isScheduledOn: weekdays only on chosen days", () => {
  expect(isScheduledOn(MON_WED_FRI, "2025-01-10")).toBe(true); // Friday
  expect(isScheduledOn(MON_WED_FRI, "2025-01-08")).toBe(true); // Wednesday
  expect(isScheduledOn(MON_WED_FRI, "2025-01-06")).toBe(true); // Monday
  expect(isScheduledOn(MON_WED_FRI, "2025-01-07")).toBe(false); // Tuesday
  expect(isScheduledOn(MON_WED_FRI, "2025-01-05")).toBe(false); // Sunday
});

test("isScheduledOn: timesPerWeek is flexible (any day)", () => {
  expect(isScheduledOn(THREE_PER_WEEK, "2025-01-10")).toBe(true);
  expect(isScheduledOn(THREE_PER_WEEK, "2025-01-04")).toBe(true);
});

/* ── daily habits ──────────────────────────────────────────────── */

test("daily streak: simple consecutive run counts every day", () => {
  // Done today and the 4 previous days → current 5.
  const done = setOf("2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10");
  const r = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(r.current).toBe(5);
  expect(r.best).toBe(5);
});

test("daily streak: a pending today does not break the streak", () => {
  // Today not done yet (day is still running), yesterday + before are done.
  const done = setOf("2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09");
  const r = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(r.current).toBe(4);
  expect(r.best).toBe(4);
});

test("daily streak: a missed day breaks the current streak but best survives", () => {
  // Done today; yesterday missed; a 3-day run before that.
  const done = setOf("2025-01-10", "2025-01-06", "2025-01-07", "2025-01-08");
  const r = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(r.current).toBe(1);
  expect(r.best).toBe(3);
});

test("daily streak: a freeze on the missed day saves the chain (but is not counted as done)", () => {
  // Done today + yesterday; the day before yesterday was MISSED but frozen.
  const done = setOf("2025-01-10", "2025-01-09", "2025-01-07");
  const freezes = setOf("2025-01-08");
  const r = computeStreaks(DAILY, done, freezes, TODAY);
  // today(1) + yesterday(2); 01-08 forgiven (no count); 01-07 done(3).
  expect(r.current).toBe(3);
  expect(r.best).toBe(3);

  // Same history WITHOUT the freeze → broken at 01-08.
  const broken = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(broken.current).toBe(2);
});

test("daily streak: freeze directly on yesterday keeps a pending today intact", () => {
  const done = setOf("2025-01-10");
  const freezes = setOf("2025-01-09");
  const r = computeStreaks(DAILY, done, freezes, TODAY);
  expect(r.current).toBe(1);
});

test("weekday streak: unscheduled days are transparent in both directions", () => {
  // Fri 10, Wed 8, Mon 6 all done; Tue/Thu/Sun/Sat are transparent.
  const done = setOf("2025-01-10", "2025-01-08", "2025-01-06");
  const r = computeStreaks(MON_WED_FRI, done, new Set(), TODAY);
  expect(r.current).toBe(3);
  expect(r.best).toBe(3);

  // Walking backward through an unscheduled weekend: Fri done, weekend
  // transparent, previous Friday (2025-01-03) missed → break.
  const partial = setOf("2025-01-10", "2025-01-08", "2025-01-06", "2025-01-02");
  const rp = computeStreaks(MON_WED_FRI, partial, new Set(), TODAY);
  expect(rp.current).toBe(3); // Fri 10, Wed 8, Mon 6 — then Fri 3 missed breaks
  expect(rp.best).toBe(3);
});

test("weekday streak: a pending scheduled today does not break", () => {
  // Friday today not yet done; Wed + Mon done.
  const done = setOf("2025-01-08", "2025-01-06");
  const r = computeStreaks(MON_WED_FRI, done, new Set(), TODAY);
  expect(r.current).toBe(2);
});

test("timesPerWeek: counts target-meeting WEEKS (2 weeks met = streak 2)", () => {
  // Week 0 (in progress): 01-04..01-10 → only 1 done → not met yet, no break.
  // Week 1: 12-28..01-03 → 3 done → met.
  // Week 2: 12-21..12-27 → 3 done → met.
  const done = setOf(
    "2024-12-22", "2024-12-24", "2024-12-26", // week 2 met
    "2024-12-29", "2024-12-31", "2025-01-02", // week 1 met
    "2025-01-05" // week 0 partially done
  );
  const r = computeStreaks(THREE_PER_WEEK, done, new Set(), TODAY);
  expect(r.current).toBe(2);
  expect(r.best).toBe(2);
});

test("timesPerWeek: an already-met current week adds +1", () => {
  const done = setOf(
    "2024-12-22", "2024-12-24", "2024-12-26", // week 2 met
    "2024-12-29", "2024-12-31", "2025-01-02", // week 1 met
    "2025-01-05", "2025-01-07", "2025-01-09" // week 0 met too
  );
  const r = computeStreaks(THREE_PER_WEEK, done, new Set(), TODAY);
  expect(r.current).toBe(3);
  expect(r.best).toBe(3);
});

test("timesPerWeek: an unmet elapsed week breaks the current streak", () => {
  const done = setOf(
    "2024-12-29", "2024-12-31", "2025-01-02", // week 1 met
    "2024-12-22", "2024-12-24" // week 2 only 2 done → missed
  );
  const r = computeStreaks(THREE_PER_WEEK, done, new Set(), TODAY);
  expect(r.current).toBe(1);
  expect(r.best).toBe(1);
});

test("timesPerWeek: a frozen day counts as one forgiven time toward the weekly target", () => {
  // Week 1 has only 2 real completions + 1 frozen day → still met (documented policy).
  const done = setOf("2024-12-29", "2024-12-31", "2025-01-05", "2025-01-06", "2025-01-07");
  const freezes = setOf("2025-01-02");
  const r = computeStreaks(THREE_PER_WEEK, done, freezes, TODAY);
  expect(r.current).toBe(2); // week 0 met (3 done) + week 1 met (2 done + 1 frozen)
});

test("best streak spans the whole history, not just the current run", () => {
  // Long run in early January, a gap, then a short run at the end.
  const done = setOf(
    "2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", // 4-day run
    "2025-01-07", "2025-01-08", "2025-01-09", // 3-day run (today pending)
    "2025-01-10"
  );
  const r = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(r.current).toBe(4); // 01-07..01-10
  expect(r.best).toBe(4); // hmm: the first run is 4 too — see the stricter case below
});

test("best streak strictly larger than current when history has a longer old run", () => {
  const done = setOf(
    "2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05", // 5-day run
    "2025-01-09", "2025-01-10" // 2-day current run
  );
  const r = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(r.current).toBe(2);
  expect(r.best).toBe(5);
});

test("retroactive edit: adding the missing day fixes the current streak", () => {
  // Before: gap at 01-09.
  const before = setOf("2025-01-10", "2025-01-08", "2025-01-07");
  const rBefore = computeStreaks(DAILY, before, new Set(), TODAY);
  expect(rBefore.current).toBe(1);

  // After the user retroactively logs 01-09 (pure recompute → always correct).
  const after = setOf("2025-01-10", "2025-01-09", "2025-01-08", "2025-01-07");
  const rAfter = computeStreaks(DAILY, after, new Set(), TODAY);
  expect(rAfter.current).toBe(4);
});

test("empty history yields zero streaks", () => {
  const r = computeStreaks(DAILY, new Set(), new Set(), TODAY);
  expect(r.current).toBe(0);
  expect(r.best).toBe(0);
});

test("future logs never inflate the current streak", () => {
  const done = setOf("2025-01-10", "2025-01-11", "2025-01-12");
  const r = computeStreaks(DAILY, done, new Set(), TODAY);
  expect(r.current).toBe(1);
});

/* ── DST correctness (pure string math) ────────────────────────── */

test("DST: date-key math is unaffected by daylight-saving transitions", () => {
  // EU spring-forward night: 2025-03-30 (Sunday) → 03-31.
  expect(addDaysToKey("2025-03-30", 1)).toBe("2025-03-31");
  expect(addDaysToKey("2025-03-31", -1)).toBe("2025-03-30");
  // US spring-forward: 2025-03-09 → 03-10.
  expect(addDaysToKey("2025-03-09", 1)).toBe("2025-03-10");
  // Autumn fall-back nights.
  expect(addDaysToKey("2025-10-26", 1)).toBe("2025-10-27"); // EU
  expect(addDaysToKey("2025-11-02", 1)).toBe("2025-11-03"); // US
  // Weekday of the EU switch day (Sunday) computed via UTC.
  expect(keyToWeekday("2025-03-30")).toBe(0);
});

test("DST: a daily streak crossing a DST night counts every calendar day", () => {
  // Today = 2025-03-31 (Monday, the day after the EU switch).
  const done = setOf("2025-03-28", "2025-03-29", "2025-03-30", "2025-03-31");
  const r = computeStreaks(DAILY, done, new Set(), "2025-03-31");
  expect(r.current).toBe(4);
  expect(r.best).toBe(4);
});

/* ── weeklyCompletion ───────────────────────────────────────────── */

test("weeklyCompletion: daily habit — done days over 7", () => {
  const weekStart = "2025-01-04"; // 01-04..01-10
  const done = setOf("2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10");
  expect(weeklyCompletion(DAILY, done, weekStart)).toBeCloseTo(5 / 7, 10);
});

test("weeklyCompletion: weekday habit — denominator is scheduled days only", () => {
  const weekStart = "2025-01-04"; // contains Mon 06, Wed 08, Fri 10 → 3 scheduled
  const done = setOf("2025-01-06", "2025-01-08"); // 2 of 3
  expect(weeklyCompletion(MON_WED_FRI, done, weekStart)).toBeCloseTo(2 / 3, 10);
});

test("weeklyCompletion: timesPerWeek — denominator is the weekly target, capped at 1", () => {
  const weekStart = "2025-01-04";
  const done = setOf("2025-01-05", "2025-01-07"); // 2 of 3
  expect(weeklyCompletion(THREE_PER_WEEK, done, weekStart)).toBeCloseTo(2 / 3, 10);
  const over = setOf("2025-01-05", "2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09");
  expect(weeklyCompletion(THREE_PER_WEEK, over, weekStart)).toBe(1);
});

/* ── freeze policy + schedule parsing ──────────────────────────── */

test("monthFreezeCount counts only freezes inside the given calendar month", () => {
  const freezes = ["2025-01-02", "2025-01-15", "2024-12-31", "2025-02-01"];
  expect(monthFreezeCount(freezes, "2025-01")).toBe(2);
  expect(monthFreezeCount(freezes, "2024-12")).toBe(1);
  expect(monthFreezeCount(freezes, "2030-05")).toBe(0);
});

test("parseSchedule: happy paths and defensive fallbacks", () => {
  expect(parseSchedule('{"type":"daily"}')).toEqual({ type: "daily" });
  expect(parseSchedule('{"type":"weekdays","days":[3,1]}')).toEqual({
    type: "weekdays",
    days: [1, 3],
  });
  expect(parseSchedule('{"type":"timesPerWeek","times":4}')).toEqual({
    type: "timesPerWeek",
    times: 4,
  });
  expect(parseSchedule("not json")).toEqual({ type: "daily" });
  expect(parseSchedule(null)).toEqual({ type: "daily" });
  expect(parseSchedule('{"type":"weekdays","days":[]}')).toEqual({ type: "daily" });
});

test("normalizeSchedule: rejects illegal payloads", () => {
  expect(normalizeSchedule({ type: "weekdays", days: [9] })).toBeNull();
  expect(normalizeSchedule({ type: "timesPerWeek", times: 8 })).toBeNull();
  expect(normalizeSchedule({ type: "timesPerWeek" })).toBeNull();
  expect(normalizeSchedule({ type: "weekly" })).toBeNull();
  expect(normalizeSchedule("daily")).toBeNull();
  expect(normalizeSchedule({ type: "weekdays", days: [0, 0, 6] })).toEqual({
    type: "weekdays",
    days: [0, 6],
  });
});
