/**
 * /api/gym/workouts/[id] — the active-session screen data.
 *
 * GET    → { workout, sets, templateExercises, lastPerformance,
 *            deferredIds, carriedIds }
 *   workout           — summary (volume over work sets, setCount, workSetCount)
 *   sets              — every logged set (createdAt asc) with its exercise names
 *   templateExercises — the prescription rows when started from a template
 *                       [{exerciseId, targetSets, targetReps, sortOrder,
 *                         exercise:{nameAr,nameEn,equipment}}] — planned rows
 *                       the client merges with performed sets. v1.17: carried
 *                       (deferred-from-last-time) exercises come FIRST; the
 *                       rest follow in template order (no duplicates).
 *   lastPerformance   — { [exerciseId]: {reps, weightKg, date} | null } — the
 *                       last WORK set of each involved exercise in any OTHER
 *                       non-deleted session (autofill + "last time" display).
 *   deferredIds       — v1.17: exercises deferred FROM THIS session.
 *   carriedIds        — v1.17: exercises carried INTO this session (snapshot
 *                       of the template's carry when it started).
 *
 * PATCH  { finish?: true, durationSec?, notes?, deferExercise?,
 *          undeferExercise? }
 *   → finish stamps completedAt=now (idempotent when already finished — the
 *     first finish time is kept); durationSec/notes update when present.
 *     FIRST finish of a template session also AUTO-COMPLETES the gym-plan
 *     habit linked to that template (user request: "في إبداء التمرين يرتبط
 *     بقائمة عادات") — a done log is upserted on the workout's date and the
 *     response carries linkedHabit {id, name} for a friendly toast.
 *     v1.17 deferExercise/undeferExercise: postpone a planned-but-unstarted
 *     exercise of this session to the NEXT session of the template — marked
 *     on the workout (deferredJson → "مؤجلة" badge) AND on the template
 *     (carryJson → prepended to the next session). Logging any set of the
 *     exercise clears both markers (the deferral is fulfilled).
 *
 * DELETE → soft delete (deletedAt). Its sets stay in the DB but disappear from
 *          every history/PR/stat query.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  bad,
  notFound,
  ok,
  readJson,
  serverError,
  validInt,
} from "../../_helpers";
import { summarizeWorkouts } from "../../_workouts";
import {
  appendIdUnique,
  encodeIdsJson,
  parseIdsJson,
  removeId,
} from "@/lib/logic/gym-smart";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const workout = await db.workouts.findUnique({ where: { id } });
    if (!workout || workout.deletedAt) return notFound("workout_not_found");

    const sets = await db.sets.findMany({
      where: { workoutId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    // v1.17 — deferral bookkeeping for this session
    const deferredIds = parseIdsJson(workout.deferredJson);
    const carriedIds = parseIdsJson(workout.carryJson);

    // template prescription (planned rows) — carried exercises FIRST, the
    // rest in template order (a carried id not in the current prescription
    // is dropped: the template was edited since, the deferral is obsolete)
    let templateExercises: unknown[] = [];
    if (workout.templateId) {
      const rows = await db.templateExercises.findMany({
        where: { templateId: workout.templateId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      const exIds = [...new Set(rows.map((r) => r.exerciseId))];
      const exercises = exIds.length
        ? await db.exercises.findMany({ where: { id: { in: exIds } } })
        : [];
      const nameById = new Map(exercises.map((e) => [e.id, e]));
      const toDTO = (r: (typeof rows)[number]) => {
        const ex = nameById.get(r.exerciseId);
        return {
          id: r.id,
          exerciseId: r.exerciseId,
          targetSets: r.targetSets,
          targetReps: r.targetReps,
          sortOrder: r.sortOrder,
          exercise: ex
            ? { nameAr: ex.nameAr, nameEn: ex.nameEn, equipment: ex.equipment }
            : null,
        };
      };
      const carriedSet = new Set(carriedIds);
      templateExercises = [
        ...carriedIds
          .map((exId) => rows.find((r) => r.exerciseId === exId))
          .filter((r): r is (typeof rows)[number] => Boolean(r))
          .map(toDTO),
        ...rows.filter((r) => !carriedSet.has(r.exerciseId)).map(toDTO),
      ];
    }

    // last performance per involved exercise — latest work set in any OTHER
    // non-deleted workout (single query over that workout-id set, JS reduce).
    const involvedIds = [
      ...new Set([
        ...templateExercises.map((te) => (te as { exerciseId: string }).exerciseId),
        ...sets.map((s) => s.exerciseId),
      ]),
    ];
    const lastPerformance: Record<
      string,
      { reps: number; weightKg: number; date: string } | null
    > = {};
    if (involvedIds.length > 0) {
      const otherWorkouts = await db.workouts.findMany({
        where: { deletedAt: null, id: { not: id } },
        select: { id: true, date: true },
      });
      const dateByWorkout = new Map(otherWorkouts.map((w) => [w.id, w.date]));
      const priorSets = await db.sets.findMany({
        where: {
          exerciseId: { in: involvedIds },
          workoutId: { in: [...dateByWorkout.keys()] },
          setType: { not: "warmup" },
        },
        orderBy: { createdAt: "desc" },
      });
      const seen = new Set<string>();
      for (const s of priorSets) {
        if (seen.has(s.exerciseId)) continue; // first hit = latest
        seen.add(s.exerciseId);
        lastPerformance[s.exerciseId] = {
          reps: s.reps,
          weightKg: s.weight,
          date: dateByWorkout.get(s.workoutId) ?? "",
        };
      }
    }
    for (const exId of involvedIds) {
      if (!(exId in lastPerformance)) lastPerformance[exId] = null;
    }

    const [summary] = await summarizeWorkouts([workout]);
    return ok({
      workout: summary,
      sets: sets.map((s) => ({
        id: s.id,
        workoutId: s.workoutId,
        exerciseId: s.exerciseId,
        setType: s.setType,
        reps: s.reps,
        weightKg: s.weight,
        rpe: s.rpe,
        isPr: s.isPr,
        createdAt: s.createdAt,
      })),
      templateExercises,
      lastPerformance,
      deferredIds,
      carriedIds,
    });
  } catch (e) {
    console.error("gym workout GET error", e);
    return serverError("failed_to_load_workout");
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const workout = await db.workouts.findUnique({ where: { id } });
    if (!workout || workout.deletedAt) return notFound("workout_not_found");

    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

    const now = new Date().toISOString();
    const data: {
      durationSec?: number;
      notes?: string | null;
      completedAt?: string;
      deferredJson?: string | null;
      updatedAt: string;
    } = { updatedAt: now };

    let justFinished = false;
    if (body.durationSec !== undefined) {
      const duration = validInt(body.durationSec, 0, 24 * 60 * 60);
      if (duration === null) return bad("invalid_duration");
      data.durationSec = duration;
    }
    if (body.notes !== undefined) {
      if (typeof body.notes !== "string") return bad("invalid_notes");
      data.notes = body.notes.trim().slice(0, 2000) || null;
    }
    if (body.finish === true && workout.completedAt === null) {
      data.completedAt = now; // first finish wins — re-PATCH is idempotent
      justFinished = true;
    }
    if (body.finish !== undefined && body.finish !== true) {
      return bad("finish_must_be_true");
    }

    /* ── v1.17 تأجيل: defer / undefer a planned exercise ─────────────────
     * Defer rules (400s): finished session, no template, id not in the
     * prescription, or the exercise already has sets this session (started
     * exercises are performed, not postponed). Idempotent on repeat. */
    if (body.deferExercise !== undefined || body.undeferExercise !== undefined) {
      if (workout.completedAt !== null) return bad("workout_already_finished");
      if (!workout.templateId) return bad("no_template");
      const exId =
        typeof body.deferExercise === "string" && body.deferExercise
          ? body.deferExercise
          : typeof body.undeferExercise === "string" && body.undeferExercise
            ? body.undeferExercise
            : "";
      if (!exId) return bad("invalid_exercise_id");
      const inTemplate = await db.templateExercises.findFirst({
        where: { templateId: workout.templateId, exerciseId: exId },
      });
      if (!inTemplate) return bad("not_in_template");

      if (body.deferExercise !== undefined) {
        const hasSets = await db.sets.findFirst({
          where: { workoutId: id, exerciseId: exId },
        });
        if (hasSets) return bad("exercise_already_started");
        data.deferredJson = encodeIdsJson(
          appendIdUnique(parseIdsJson(workout.deferredJson), exId)
        );
        await db.workoutTemplates.update({
          where: { id: workout.templateId },
          data: {
            carryJson: encodeIdsJson(
              appendIdUnique(
                parseIdsJson(
                  (
                    await db.workoutTemplates.findUnique({
                      where: { id: workout.templateId },
                      select: { carryJson: true },
                    })
                  )?.carryJson
                ),
                exId
              )
            ),
            updatedAt: now,
          },
        });
      } else {
        data.deferredJson = encodeIdsJson(removeId(parseIdsJson(workout.deferredJson), exId));
        const tpl = await db.workoutTemplates.findUnique({
          where: { id: workout.templateId },
          select: { carryJson: true },
        });
        await db.workoutTemplates.update({
          where: { id: workout.templateId },
          data: {
            carryJson: encodeIdsJson(removeId(parseIdsJson(tpl?.carryJson), exId)),
            updatedAt: now,
          },
        });
      }
    }

    const updated = await db.workouts.update({ where: { id }, data });

    // ── auto-complete the linked gym-plan habit (first finish only) ──────
    let linkedHabit: { id: string; name: string } | null = null;
    if (justFinished && workout.templateId) {
      const habit = await db.habits.findFirst({
        where: { gymTemplateId: workout.templateId, deletedAt: null, archived: false },
      });
      if (habit) {
        await db.habitLogs.upsert({
          where: { habitId_date: { habitId: habit.id, date: workout.date } },
          create: {
            id: crypto.randomUUID(),
            habitId: habit.id,
            date: workout.date,
            done: true,
            updatedAt: now,
          },
          update: { done: true, updatedAt: now },
        });
        linkedHabit = { id: habit.id, name: habit.name };
      }
    }

    const [summary] = await summarizeWorkouts([updated]);
    return ok({
      workout: summary,
      linkedHabit,
      deferredIds: parseIdsJson(updated.deferredJson),
      carriedIds: parseIdsJson(updated.carryJson),
    });
  } catch (e) {
    console.error("gym workout PATCH error", e);
    return serverError("failed_to_update_workout");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const workout = await db.workouts.findUnique({ where: { id } });
    if (!workout || workout.deletedAt) return notFound("workout_not_found");
    await db.workouts.update({
      where: { id },
      data: { deletedAt: new Date().toISOString() },
    });
    return ok({ deleted: id });
  } catch (e) {
    console.error("gym workout DELETE error", e);
    return serverError("failed_to_delete_workout");
  }
}
