/**
 * PATCH /api/muscles/targets — edit a muscle's weekly working-set target.
 *
 * Body: { muscleId: string, weeklyTarget: number }
 * weeklyTarget is clamped to the 4..40 range and rounded to an integer.
 * Returns { muscle: updated group }.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notFound, ok, serverError, validationError } from "../_lib";

export const dynamic = "force-dynamic";

export const TARGET_MIN = 4;
export const TARGET_MAX = 40;

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { muscleId?: unknown; weeklyTarget?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return validationError("json body with muscleId and weeklyTarget required");
    }

    const muscleId = typeof body.muscleId === "string" ? body.muscleId : "";
    if (!muscleId) return validationError("muscleId required");

    const rawTarget = body.weeklyTarget;
    if (typeof rawTarget !== "number" || !Number.isFinite(rawTarget)) {
      return validationError("weeklyTarget must be a number");
    }

    const existing = await db.muscleGroups.findUnique({ where: { id: muscleId } });
    if (!existing) return notFound("muscle not found");

    const weeklyTarget = Math.min(
      TARGET_MAX,
      Math.max(TARGET_MIN, Math.round(rawTarget))
    );

    const updated = await db.muscleGroups.update({
      where: { id: muscleId },
      data: { weeklyTarget, updatedAt: new Date().toISOString() },
    });

    return ok({
      muscle: {
        id: updated.id,
        nameAr: updated.nameAr,
        nameEn: updated.nameEn,
        svgId: updated.svgId,
        region: updated.region,
        weeklyTarget: updated.weeklyTarget,
        sortOrder: updated.sortOrder,
      },
    });
  } catch (e) {
    console.error("muscles targets PATCH error", e);
    return serverError("failed_to_update_target");
  }
}
