import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, notFound, serverError, parseNumber, round2 } from "../../_lib";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/nutrition/water/[id] { ml } — correct an entry's amount
 * (the hydration card's row editor).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { ml?: unknown };

    const existing = await db.waterLogs.findUnique({ where: { id } });
    if (!existing) return notFound("water log not found");

    const ml = parseNumber(body.ml);
    if (ml === null || ml < 50 || ml > 3000) {
      return ok({ log: existing }); // treat a bad patch as a no-op, not a 400 storm
    }

    const log = await db.waterLogs.update({
      where: { id },
      data: { amountMl: round2(ml), updatedAt: new Date().toISOString() },
    });

    return ok({ log });
  } catch (e) {
    console.error("water PATCH error", e);
    return serverError("failed to update the drink");
  }
}

/** DELETE /api/nutrition/water/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.waterLogs.findUnique({ where: { id } });
    if (!existing) return notFound("water log not found");

    await db.waterLogs.delete({ where: { id } });
    return ok({ deleted: true, id });
  } catch (e) {
    console.error("water DELETE error", e);
    return serverError("failed to delete the drink");
  }
}
