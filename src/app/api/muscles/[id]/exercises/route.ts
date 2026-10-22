/**
 * GET /api/muscles/[id]/exercises — suggested exercises for one muscle.
 *
 * Used by the muscle-map bottom sheet: the ExerciseMuscles join for one muscle,
 * primary mappings first, capped at 8, seed + custom, never deleted.
 * Response: { exercises: [{ id, nameAr, nameEn, equipment, role }] }
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notFound, ok, serverError } from "../../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    const muscle = await db.muscleGroups.findUnique({ where: { id } });
    if (!muscle) return notFound("muscle not found");

    const mappings = await db.exerciseMuscles.findMany({ where: { muscleId: id } });
    if (mappings.length === 0) return ok({ exercises: [] });

    const exercises = await db.exercises.findMany({
      where: { id: { in: mappings.map((m) => m.exerciseId) }, deletedAt: null },
    });
    const roleById = new Map(mappings.map((m) => [m.exerciseId, m.role]));

    const list = exercises
      .map((e) => ({
        id: e.id,
        nameAr: e.nameAr,
        nameEn: e.nameEn,
        equipment: e.equipment,
        role: roleById.get(e.id) === "primary" ? ("primary" as const) : ("secondary" as const),
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "primary" ? -1 : 1; // primary first
        return a.nameEn.localeCompare(b.nameEn);
      })
      .slice(0, 8);

    return ok({ exercises: list });
  } catch (e) {
    console.error("muscle exercises GET error", e);
    return serverError("failed_to_load_exercises");
  }
}
