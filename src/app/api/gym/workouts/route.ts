/**
 * /api/gym/workouts — session start + roster.
 *
 * GET  ?today=YYYY-MM-DD
 *      → { active, history }
 *        active  = the single unfinished session (completedAt null, not
 *                  deleted, latest createdAt) or null.
 *        history = last 30 FINISHED sessions (completedAt set, not deleted),
 *                  newest first, each with volume (Σ reps×kg over WORK sets —
 *                  warmups never count as volume) + setCount (all) +
 *                  workSetCount (non-warmup).
 *
 * POST { templateId? } + ?today=YYYY-MM-DD
 *      → start a session. If an active session exists it is returned as-is
 *        (resumed: true) — there can only ever be one active session.
 *        date = local YYYY-MM-DD (client-passed ?today, DST-safe), createdAt =
 *        ISO now. name = the template's stored "AR | EN" name, or null.
 *        v1.17: starting from a template SNAPSHOTS its deferred carry
 *        (carryJson) onto the workout — the next session's planned rows put
 *        carried exercises first ("مؤجلة من جلسة سابقة").
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { bad, notFound, ok, readJson, resolveTodayKey, serverError } from "../_helpers";
import { summarizeWorkouts } from "../_workouts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const todayKey = resolveTodayKey(req);

    const activeRow = await db.workouts.findFirst({
      where: { completedAt: null, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const historyRows = await db.workouts.findMany({
      where: { completedAt: { not: null }, deletedAt: null },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
    });

    const all = await summarizeWorkouts([
      ...(activeRow ? [activeRow] : []),
      ...historyRows,
    ]);
    const active = activeRow ? all.find((w) => w.id === activeRow.id) ?? null : null;
    const history = all.filter((w) => w.id !== activeRow?.id);

    return ok({ today: todayKey, active, history });
  } catch (e) {
    console.error("gym workouts GET error", e);
    return serverError("failed_to_load_workouts");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const todayKey = resolveTodayKey(req);

    // One active session at a time — starting returns the existing one.
    const existing = await db.workouts.findFirst({
      where: { completedAt: null, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const [summary] = await summarizeWorkouts([existing]);
      return ok({ workout: summary, resumed: true });
    }

    let templateId: string | null = null;
    let name: string | null = null;
    let carryJson: string | null = null;
    if (body && body.templateId !== undefined && body.templateId !== null) {
      if (typeof body.templateId !== "string" || !body.templateId) {
        return bad("invalid_template_id");
      }
      const tpl = await db.workoutTemplates.findUnique({ where: { id: body.templateId } });
      if (!tpl || tpl.deletedAt) return notFound("template_not_found");
      templateId = tpl.id;
      name = tpl.name; // stored "AR | EN"
      carryJson = tpl.carryJson ?? null; // v1.17 carry snapshot
    }

    const now = new Date().toISOString();
    const created = await db.workouts.create({
      data: {
        id: crypto.randomUUID(),
        date: todayKey, // local YYYY-MM-DD
        templateId,
        name,
        durationSec: 0,
        notes: null,
        deferredJson: null,
        carryJson,
        completedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    const [summary] = await summarizeWorkouts([created]);
    return ok({ workout: summary, resumed: false });
  } catch (e) {
    console.error("gym workouts POST error", e);
    return serverError("failed_to_start_workout");
  }
}
