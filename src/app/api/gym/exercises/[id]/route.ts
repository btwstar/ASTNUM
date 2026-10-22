/**
 * /api/gym/exercises/[id] — single exercise (v1.7).
 *
 * GET    → { exercise } with the FULL media (image = image/GIF/video data
 *          URL) for the form viewer. Lists only carry imageThumb.
 *
 * PATCH  { image?, imageThumb? } → attach / replace / clear the media pair.
 *          Both keys must travel together (thumb may be null when a video's
 *          frame-grab failed) — resolveExerciseMediaPair enforces the caps:
 *          image ≤300KB / GIF ≤1.5MB / video ≤2.5MB, thumb ≤48KB.
 *
 * DELETE → soft delete (deletedAt). Historical sets keep resolving because
 *          the row stays; the exercise disappears from library/picker lists.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveExerciseMediaPair } from "@/lib/image-compress";
import { bad, notFound, ok, readJson, serverError } from "../../_helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const exercise = await db.exercises.findUnique({ where: { id } });
    if (!exercise || exercise.deletedAt) return notFound("exercise_not_found");
    const muscles = await db.exerciseMuscles.findMany({ where: { exerciseId: id } });
    return ok({
      exercise: {
        id: exercise.id,
        nameAr: exercise.nameAr,
        nameEn: exercise.nameEn,
        equipment: exercise.equipment,
        custom: exercise.custom,
        image: exercise.image,
        imageThumb: exercise.imageThumb,
        muscles: muscles.map((m) => ({
          muscleId: m.muscleId,
          role: m.role,
          weight: m.weight,
        })),
      },
    });
  } catch (e) {
    console.error("gym exercise GET error", e);
    return serverError("failed_to_load_exercise");
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const exercise = await db.exercises.findUnique({ where: { id } });
    if (!exercise || exercise.deletedAt) return notFound("exercise_not_found");

    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

    const media = resolveExerciseMediaPair(body.image, body.imageThumb);
    if (media.kind === "invalid") return bad("invalid_media");
    if (media.kind === "absent") return bad("media_pair_required");

    const updated = await db.exercises.update({
      where: { id },
      data: {
        image: media.kind === "set" ? media.image : null,
        imageThumb: media.kind === "set" ? media.imageThumb : null,
        updatedAt: new Date().toISOString(),
      },
    });

    return ok({
      exercise: {
        id: updated.id,
        nameAr: updated.nameAr,
        nameEn: updated.nameEn,
        equipment: updated.equipment,
        custom: updated.custom,
        image: updated.image,
        imageThumb: updated.imageThumb,
      },
    });
  } catch (e) {
    console.error("gym exercise PATCH error", e);
    return serverError("failed_to_update_exercise");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const exercise = await db.exercises.findUnique({ where: { id } });
    if (!exercise || exercise.deletedAt) return notFound("exercise_not_found");

    // Soft delete: history/stats keep resolving names; lists filter it out.
    await db.exercises.update({
      where: { id },
      data: { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
    return ok({ deleted: id });
  } catch (e) {
    console.error("gym exercise DELETE error", e);
    return serverError("failed_to_delete_exercise");
  }
}
