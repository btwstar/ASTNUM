/**
 * POST /api/gym/workouts/[id]/sets — log a set.
 *
 * Body: { exerciseId, reps, weightKg, rpe?, setType? ('warmup'|'work'|'failure') }
 *
 * Server-side PR detection: every previous set of this exercise inside
 * NON-DELETED workouts (including earlier sets of the current session) is fed
 * to the pure detectPrs(); warmup candidates never set records. The set row is
 * persisted with isPr = prs.length > 0 and the response carries
 * { set, prs } so the UI can celebrate without a second round-trip.
 *
 * v1.17: logging a set of an exercise FULFILLS its pending deferral — the
 * exercise is no longer postponed, so both markers clear (the workout's
 * deferredJson and the template's carryJson, keeping the “deferred until
 * actually performed” rotation semantics).
 *
 * 404 workout_not_found / exercise_not_found · 400 VALIDATION ·
 * 400 workout_already_finished (retro-logging into finished sessions is not
 * allowed — it would corrupt PR ordering semantics).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { detectPrs, type PrType } from "@/lib/logic/pr";
import {
  encodeIdsJson,
  parseIdsJson,
  removeId,
} from "@/lib/logic/gym-smart";
import {
  bad,
  notFound,
  ok,
  readJson,
  serverError,
  validReps,
  validRpe,
  validSetType,
  validWeight,
} from "../../../_helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const workout = await db.workouts.findUnique({ where: { id } });
    if (!workout || workout.deletedAt) return notFound("workout_not_found");
    if (workout.completedAt) return bad("workout_already_finished");

    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

    if (typeof body.exerciseId !== "string" || !body.exerciseId) {
      return bad("exercise_id_required");
    }
    const exercise = await db.exercises.findUnique({ where: { id: body.exerciseId } });
    if (!exercise || exercise.deletedAt) return notFound("exercise_not_found");

    const reps = validReps(body.reps);
    if (reps === null) return bad("invalid_reps");
    const weightKg = validWeight(body.weightKg);
    if (weightKg === null) return bad("invalid_weight");
    const setType = validSetType(body.setType);
    let rpe: number | null = null;
    if (body.rpe !== undefined && body.rpe !== null && body.rpe !== "") {
      rpe = validRpe(body.rpe);
      if (rpe === null) return bad("invalid_rpe");
    }

    // PR history: all previous sets of this exercise in non-deleted workouts.
    // (Single query set — a personal tracker's DB stays tiny; SQLite `in` on
    // workout ids keeps soft-deleted sessions out of the record books.)
    const liveWorkouts = await db.workouts.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    const history = await db.sets.findMany({
      where: {
        exerciseId: exercise.id,
        workoutId: { in: liveWorkouts.map((w) => w.id) },
      },
      select: { reps: true, weight: true, setType: true, createdAt: true },
    });

    const prs: PrType[] =
      setType === "warmup"
        ? [] // warmups never set records
        : detectPrs({
            reps,
            weightKg,
            pastSets: history.map((s) => ({
              reps: s.reps,
              weightKg: s.weight,
              setType: s.setType,
              createdAt: s.createdAt,
            })),
          });

    const now = new Date().toISOString();
    const set = await db.sets.create({
      data: {
        id: crypto.randomUUID(),
        workoutId: id,
        exerciseId: exercise.id,
        setType,
        reps,
        weight: weightKg,
        rpe,
        isPr: prs.length > 0,
        createdAt: now,
        updatedAt: now,
      },
    });

    // v1.17 — the deferral is fulfilled: clear it from this workout AND the
    // template's carry (non-fatal bookkeeping; failures never block the log).
    try {
      const stillDeferred = removeId(parseIdsJson(workout.deferredJson), exercise.id);
      const changed =
        (workout.deferredJson ?? "") !== (encodeIdsJson(stillDeferred) ?? "");
      if (changed) {
        await db.workouts.update({
          where: { id },
          data: { deferredJson: encodeIdsJson(stillDeferred), updatedAt: now },
        });
      }
      if (workout.templateId) {
        const tpl = await db.workoutTemplates.findUnique({
          where: { id: workout.templateId },
          select: { carryJson: true },
        });
        const carry = parseIdsJson(tpl?.carryJson);
        if (carry.includes(exercise.id)) {
          await db.workoutTemplates.update({
            where: { id: workout.templateId },
            data: {
              carryJson: encodeIdsJson(removeId(carry, exercise.id)),
              updatedAt: now,
            },
          });
        }
      }
    } catch (bookkeeping) {
      console.warn("gym sets POST defer-clear skipped", bookkeeping);
    }

    return ok({
      set: {
        id: set.id,
        workoutId: set.workoutId,
        exerciseId: set.exerciseId,
        setType: set.setType,
        reps: set.reps,
        weightKg: set.weight,
        rpe: set.rpe,
        isPr: set.isPr,
        createdAt: set.createdAt,
      },
      prs,
    });
  } catch (e) {
    console.error("gym sets POST error", e);
    return serverError("failed_to_log_set");
  }
}
