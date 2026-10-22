/**
 * POST /api/habits/from-template — customize a gym workout template onto the
 * habits list (agent: user request "من قوالب الجيم يمكن تخصيصها على عادات").
 *
 * Creates a gym-plan habit mirroring the template:
 *  - name    : the template's display name in the requested language
 *              (templates store "AR | EN")
 *  - icon    : lucide:dumbbell   - color: the app's training green
 *  - schedule: { type: "gymPlan" } — NO fixed weekdays. The linked workouts
 *              ROTATE: the least-recently-completed one is "due today", and
 *              an unfinished workout stays due every following day until it
 *              is completed (automatic postponement — nothing ever breaks).
 *              Finishing a session of that template auto-completes the habit
 *              (see the workout PATCH route).
 *
 * Idempotent: a template that already has an active habit returns it with
 * created=false (the client shows a friendly "already added" note).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { templateDisplayName } from "@/components/gym/shared";
import { parseSchedule } from "@/lib/logic/streak";
import { bad, fail, ok, readJson, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

/** Habit color for linked workouts — the app's training green. */
const GYM_HABIT_COLOR = "#22d3ee";
const GYM_HABIT_ICON = "lucide:dumbbell";

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");
    if (typeof body.templateId !== "string" || !body.templateId.trim()) {
      return bad("template_id_required");
    }
    const templateId = body.templateId.trim();
    // Arabic-script UIs get the Arabic template name; everyone else English.
    const lang = body.lang === "ar" ? "ar" : "en";

    const template = await db.workoutTemplates.findFirst({
      where: { id: templateId, deletedAt: null },
    });
    if (!template) return fail("NOT_FOUND", "template_not_found", 404);

    // Idempotency: one active habit per template.
    const existing = await db.habits.findFirst({
      where: { gymTemplateId: templateId, deletedAt: null },
    });
    if (existing) {
      return ok({
        habit: { ...existing, schedule: parseSchedule(existing.scheduleJson) },
        created: false,
      });
    }

    const last = await db.habits.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const now = new Date().toISOString();
    const created = await db.habits.create({
      data: {
        id: crypto.randomUUID(),
        name: templateDisplayName(template.name, lang) || template.name,
        icon: GYM_HABIT_ICON,
        color: GYM_HABIT_COLOR,
        scheduleJson: JSON.stringify({ type: "gymPlan" }),
        gymTemplateId: templateId,
        reminderTime: null,
        note: null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        archived: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    return ok({
      habit: { ...created, schedule: parseSchedule(created.scheduleJson) },
      created: true,
    });
  } catch (e) {
    console.error("habits from-template POST error", e);
    return serverError("failed_to_create_habit");
  }
}
