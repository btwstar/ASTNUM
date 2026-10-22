/**
 * GET /api/muscles — the 15 canonical muscle groups.
 *
 * Returns { muscles: [{ id, nameAr, nameEn, svgId, region, weeklyTarget, sortOrder }] }
 * ordered by sortOrder. Idempotent seed guard included (dynamic import, safe).
 */
import { db } from "@/lib/db";
import { ensureSeeded, ok, serverError, type MuscleGroupDTO } from "./_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const groups = await db.muscleGroups.findMany({
      orderBy: { sortOrder: "asc" },
    });

    const muscles: MuscleGroupDTO[] = groups.map((g) => ({
      id: g.id,
      nameAr: g.nameAr,
      nameEn: g.nameEn,
      svgId: g.svgId,
      region: g.region === "back" ? "back" : "front",
      weeklyTarget: g.weeklyTarget,
      sortOrder: g.sortOrder,
    }));

    return ok({ muscles });
  } catch (e) {
    console.error("muscles GET error", e);
    return serverError("failed_to_load_muscles");
  }
}
