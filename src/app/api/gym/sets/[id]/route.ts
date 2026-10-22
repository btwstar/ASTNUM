/**
 * DELETE /api/gym/sets/[id] — remove a mis-logged set.
 * PATCH  /api/gym/sets/[id] — EDIT a logged set (v1.9: تعديل السجل).
 *
 * DELETE: hard delete (the Sets table has no deletedAt by schema design).
 * Deleting a set does NOT retroactively recompute other rows' isPr flags —
 * isPr is the historical "this set broke a record at its moment" marker;
 * future PR detection re-derives records from the remaining rows on every log.
 *
 * PATCH body: { reps, weightKg, setType?, rpe? } — the set itself is the
 * anchor (its exercise/workout never change; move-set is out of scope).
 * Works on BOTH active-session sets and finished-session sets — editing
 * history is the whole point (mis-logged reps a week ago stay fixable).
 * isPr is recomputed HONESTLY for the edited row: the set is re-evaluated
 * against every other live set of the same exercise (itself excluded),
 * same rules as POST — warmups can never hold records.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { detectPrs, type PrType } from "@/lib/logic/pr";
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
} from "../../_helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Shape shared by the PATCH response (`set` mirrors the SetRow contract). */
function setPayload(set: {
  id: string;
  workoutId: string;
  exerciseId: string;
  setType: string;
  reps: number;
  weight: number;
  rpe: number | null;
  isPr: boolean;
  createdAt: string;
}) {
  return {
    id: set.id,
    workoutId: set.workoutId,
    exerciseId: set.exerciseId,
    setType: set.setType,
    reps: set.reps,
    weightKg: set.weight,
    rpe: set.rpe,
    isPr: set.isPr,
    createdAt: set.createdAt,
  };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const set = await db.sets.findUnique({ where: { id } });
    if (!set) return notFound("set_not_found");

    // guard: the owning workout must still be live (soft-delete respected)
    const workout = await db.workouts.findUnique({ where: { id: set.workoutId } });
    if (!workout || workout.deletedAt) return notFound("workout_not_found");

    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

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

    // PR history: all OTHER live sets of this exercise (the edited row
    // excluded — it is being re-evaluated, not compared against itself).
    const liveWorkouts = await db.workouts.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    const history = await db.sets.findMany({
      where: {
        exerciseId: set.exerciseId,
        workoutId: { in: liveWorkouts.map((w) => w.id) },
        id: { not: set.id },
      },
      select: { reps: true, weight: true, setType: true, createdAt: true },
    });

    const prs: PrType[] =
      setType === "warmup"
        ? [] // warmups never hold records
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
    const updated = await db.sets.update({
      where: { id },
      data: { reps, weight: weightKg, setType, rpe, isPr: prs.length > 0, updatedAt: now },
    });

    return ok({ set: setPayload(updated), prs });
  } catch (e) {
    console.error("gym set PATCH error", e);
    return serverError("failed_to_edit_set");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const set = await db.sets.findUnique({ where: { id } });
    if (!set) return notFound("set_not_found");
    await db.sets.delete({ where: { id } });
    return ok({ deleted: id });
  } catch (e) {
    console.error("gym set DELETE error", e);
    return serverError("failed_to_delete_set");
  }
}
