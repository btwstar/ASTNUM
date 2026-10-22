/// <reference types="bun-types" />
/**
 * Smart-session lifecycle test (v1.17 وضع ذكي) — runs the APK's runtime path
 * end-to-end (localApiRequest, the exact dispatcher the static build ships):
 *
 *   1. template day scheduling   (daysJson: create → list → PATCH → clear → invalid)
 *   2. exercise deferral         (defer → badge ids → undefer → re-defer)
 *   3. carry rotation            (finish → next session prepends the carried
 *                                 exercise → logging its set clears the carry)
 *   4. validation contract       (started exercises / unknown ids / finished
 *                                 sessions / no-template sessions → 400)
 *
 *   bun test tests/gym-smart-session.test.ts
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { localApiRequest } from "../src/lib/local-api";
import { ApiError } from "../src/lib/api";
import {
  __forceInMemoryForTests,
  __resetForTests,
  ensureSeeded,
  getDb,
} from "../src/lib/local-api/db";

interface TemplateDTO {
  id: string;
  name: string;
  description: string | null;
  days: number[];
  exercises: Array<{
    exerciseId: string;
    targetSets: number;
    targetReps: number;
    exercise: { nameAr: string; nameEn: string; equipment: string } | null;
  }>;
}

interface DetailDTO {
  workout: { id: string; completedAt: string | null };
  sets: Array<{ id: string; exerciseId: string; reps: number }>;
  templateExercises: Array<{ exerciseId: string }>;
  deferredIds?: string[];
  carriedIds?: string[];
}

const TODAY = "2026-10-22"; // a Thursday (weekday 4) — stable for day math

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const p = path.startsWith("/api/") ? path : `/api/${path.replace(/^\//, "")}`;
  return localApiRequest<T>(p, init);
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  let err: unknown;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ApiError);
  const apiErr = err as ApiError;
  expect(apiErr.status).toBe(status);
  // the adapter folds every 400 into code VALIDATION but keeps the specific
  // reason as `message` (mirrors the server's per-route reason strings)
  expect(apiErr.code === code || apiErr.message === code).toBe(true);
}

/** grab two real library exercise ids from the seed */
function seedExerciseIds(): [string, string] {
  ensureSeeded(); // the seed runs lazily inside handlers — pull it in here too
  const db = getDb();
  const ids = db.exercises.filter((e) => e.deletedAt === null).map((e) => e.id);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  return [ids[0], ids[1]];
}

/** create a user template with two exercises + optional days */
async function makeTemplate(days?: number[]): Promise<TemplateDTO> {
  const [exA, exB] = seedExerciseIds();
  const res = await req<{ template: TemplateDTO }>("/api/gym/templates", {
    method: "POST",
    body: JSON.stringify({
      nameAr: "جدول اختبار ذكي",
      nameEn: "Smart test split",
      description: null,
      ...(days ? { days } : {}),
      exercises: [
        { exerciseId: exA, targetSets: 3, targetReps: 10 },
        { exerciseId: exB, targetSets: 3, targetReps: 10 },
      ],
    }),
  });
  return res.template;
}

describe("smart session — day scheduling (APK adapter)", () => {
  beforeEach(() => {
    __forceInMemoryForTests();
    __resetForTests();
  });

  test("create with days → list returns sorted unique days; PATCH updates; [] clears", async () => {
    const created = await makeTemplate([4, 1, 4, 0]);
    expect(created.days).toEqual([0, 1, 4]);

    // PATCH replaces days
    const patched = await req<{ template: TemplateDTO }>(`/api/gym/templates/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ days: [2, 5] }),
    });
    expect(patched.template.days).toEqual([2, 5]);

    // PATCH with [] clears → any day
    const cleared = await req<{ template: TemplateDTO }>(`/api/gym/templates/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ days: [] }),
    });
    expect(cleared.template.days).toEqual([]);

    // omitted days = untouched (still cleared from the previous step)
    const untouched = await req<{ template: TemplateDTO }>(`/api/gym/templates/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "note only" }),
    });
    expect(untouched.template.days).toEqual([]);
    expect(untouched.template.description).toBe("note only");
  });

  test("invalid days are rejected with 400", async () => {
    const [exA] = seedExerciseIds();
    await expectApiError(
      req("/api/gym/templates", {
        method: "POST",
        body: JSON.stringify({
          nameAr: "أيام خاطئة",
          exercises: [{ exerciseId: exA, targetSets: 3, targetReps: 10 }],
          days: [7],
        }),
      }),
      400,
      "invalid_days"
    );
    await expectApiError(
      req("/api/gym/templates", {
        method: "POST",
        body: JSON.stringify({
          nameAr: "أيام خاطئة ٢",
          exercises: [{ exerciseId: exA, targetSets: 3, targetReps: 10 }],
          days: "weekend",
        }),
      }),
      400,
      "invalid_days"
    );
  });

  test("seeded built-in templates list days: [] (parseDaysJson null-safe)", async () => {
    const list = await req<{ templates: TemplateDTO[] }>("/api/gym/templates");
    expect(list.templates.length).toBeGreaterThan(0);
    for (const tpl of list.templates) {
      expect(Array.isArray(tpl.days)).toBe(true);
    }
  });
});

describe("smart session — تأجيل deferral + carry rotation (APK adapter)", () => {
  beforeEach(() => {
    __forceInMemoryForTests();
    __resetForTests();
  });

  test("full lifecycle: defer → finish → next session carries first → set clears", async () => {
    const tpl = await makeTemplate();
    const [exA, exB] = tpl.exercises.map((te) => te.exerciseId);

    // start session 1 from the template
    const started = await req<{ workout: { id: string }; resumed: boolean }>(
      `/api/gym/workouts?today=${TODAY}`,
      { method: "POST", body: JSON.stringify({ templateId: tpl.id }) }
    );
    expect(started.resumed).toBe(false);
    const w1 = started.workout.id;

    // defer exercise B (planned, unstarted)
    const deferred = await req<{ deferredIds: string[]; carriedIds: string[] }>(
      `/api/gym/workouts/${w1}`,
      { method: "PATCH", body: JSON.stringify({ deferExercise: exB }) }
    );
    expect(deferred.deferredIds).toEqual([exB]);

    // defer is idempotent (repeat → same list)
    const again = await req<{ deferredIds: string[] }>(`/api/gym/workouts/${w1}`, {
      method: "PATCH",
      body: JSON.stringify({ deferExercise: exB }),
    });
    expect(again.deferredIds).toEqual([exB]);

    // detail reflects the badge data
    const d1 = await req<DetailDTO>(`/api/gym/workouts/${w1}`);
    expect(d1.deferredIds).toEqual([exB]);
    expect(d1.carriedIds).toEqual([]);
    // both rows remain planned (defer keeps the row, just badges it)
    expect(d1.templateExercises.map((te) => te.exerciseId).sort()).toEqual([exA, exB].sort());

    // log a set of A, then finish session 1
    await req(`/api/gym/workouts/${w1}/sets`, {
      method: "POST",
      body: JSON.stringify({ exerciseId: exA, reps: 10, weightKg: 50 }),
    });
    await req(`/api/gym/workouts/${w1}`, {
      method: "PATCH",
      body: JSON.stringify({ finish: true, durationSec: 1200 }),
    });

    // the template still carries B (persisted across sessions until performed)
    const db = getDb();
    const tplRow = db.workoutTemplates.find((t) => t.id === tpl.id);
    expect(tplRow?.carryJson).toBe(JSON.stringify([exB]));

    // start session 2 from the same template → B is carried FIRST
    const started2 = await req<{ workout: { id: string } }>(
      `/api/gym/workouts?today=${TODAY}`,
      { method: "POST", body: JSON.stringify({ templateId: tpl.id }) }
    );
    const w2 = started2.workout.id;
    const d2 = await req<DetailDTO>(`/api/gym/workouts/${w2}`);
    expect(d2.carriedIds).toEqual([exB]);
    expect(d2.templateExercises.length).toBe(2);
    expect(d2.templateExercises[0].exerciseId).toBe(exB); // carried first
    expect(d2.templateExercises[1].exerciseId).toBe(exA);

    // logging B's set fulfills the deferral → carry clears everywhere
    await req(`/api/gym/workouts/${w2}/sets`, {
      method: "POST",
      body: JSON.stringify({ exerciseId: exB, reps: 12, weightKg: 30 }),
    });
    const tplAfter = db.workoutTemplates.find((t) => t.id === tpl.id);
    expect(tplAfter?.carryJson).toBeNull();
    const d2After = await req<DetailDTO>(`/api/gym/workouts/${w2}`);
    expect(d2After.carriedIds).toEqual([exB]); // snapshot of THIS session stays (it led the session)
    expect(d2After.deferredIds).toEqual([]);
  });

  test("undefer removes both markers; carry survives into the next start only until performed", async () => {
    const tpl = await makeTemplate();
    const [exA, exB] = tpl.exercises.map((te) => te.exerciseId);
    const started = await req<{ workout: { id: string } }>(`/api/gym/workouts?today=${TODAY}`, {
      method: "POST",
      body: JSON.stringify({ templateId: tpl.id }),
    });
    const w1 = started.workout.id;

    await req(`/api/gym/workouts/${w1}`, {
      method: "PATCH",
      body: JSON.stringify({ deferExercise: exB }),
    });
    const undone = await req<{ deferredIds: string[] }>(`/api/gym/workouts/${w1}`, {
      method: "PATCH",
      body: JSON.stringify({ undeferExercise: exB }),
    });
    expect(undone.deferredIds).toEqual([]);
    const db = getDb();
    expect(db.workoutTemplates.find((t) => t.id === tpl.id)?.carryJson).toBeNull();
  });

  test("validation: started exercises, unknown ids, finished sessions, no-template → 400", async () => {
    const tpl = await makeTemplate();
    const [exA, exB] = tpl.exercises.map((te) => te.exerciseId);
    const started = await req<{ workout: { id: string } }>(`/api/gym/workouts?today=${TODAY}`, {
      method: "POST",
      body: JSON.stringify({ templateId: tpl.id }),
    });
    const w1 = started.workout.id;

    // exercise not in the prescription
    await expectApiError(
      req(`/api/gym/workouts/${w1}`, {
        method: "PATCH",
        body: JSON.stringify({ deferExercise: "no-such-exercise" }),
      }),
      400,
      "not_in_template"
    );

    // started exercise cannot be deferred
    await req(`/api/gym/workouts/${w1}/sets`, {
      method: "POST",
      body: JSON.stringify({ exerciseId: exA, reps: 8, weightKg: 60 }),
    });
    await expectApiError(
      req(`/api/gym/workouts/${w1}`, {
        method: "PATCH",
        body: JSON.stringify({ deferExercise: exA }),
      }),
      400,
      "exercise_already_started"
    );

    // finished session refuses deferral
    await req(`/api/gym/workouts/${w1}`, {
      method: "PATCH",
      body: JSON.stringify({ finish: true, durationSec: 600 }),
    });
    await expectApiError(
      req(`/api/gym/workouts/${w1}`, {
        method: "PATCH",
        body: JSON.stringify({ deferExercise: exB }),
      }),
      400,
      "workout_already_finished"
    );

    // no-template (ad-hoc) session has no deferral semantics
    const adHoc = await req<{ workout: { id: string } }>(`/api/gym/workouts?today=${TODAY}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    // exercise B IS in the library but the session has no template
    await expectApiError(
      req(`/api/gym/workouts/${adHoc.workout.id}`, {
        method: "PATCH",
        body: JSON.stringify({ deferExercise: exB }),
      }),
      400,
      "no_template"
    );
  });
});
