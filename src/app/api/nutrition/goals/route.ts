import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import {
  ok,
  validationError,
  serverError,
  parseNumber,
  getOrCreateGoals,
  round2,
} from "../_lib";

export const dynamic = "force-dynamic";

/** PUT body: { kcal, protein, carbs, fat, waterMl?, formulaMeta? } */
export async function GET() {
  try {
    const goals = await getOrCreateGoals();
    return ok({
      goals: {
        kcal: goals.kcal,
        protein: goals.protein,
        carbs: goals.carbs,
        fat: goals.fat,
        waterMl: goals.waterMl,
        formulaMeta: goals.formulaMeta,
      },
    });
  } catch (e) {
    console.error("nutrition goals GET error", e);
    return serverError("failed to load goals");
  }
}

/**
 * PUT /api/nutrition/goals
 * { kcal, protein, carbs, fat, waterMl?, formulaMeta? } — upsert (single-row convention:
 * update the existing row, else create with fixed id "goals").
 * waterMl is OPTIONAL: absent → the stored hydration goal is kept (the
 * calculator sheet sends it only when the water row is edited).
 */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const kcal = parseNumber(body.kcal);
    const protein = parseNumber(body.protein);
    const carbs = parseNumber(body.carbs);
    const fat = parseNumber(body.fat);

    if (kcal === null || kcal < 800 || kcal > 10000) {
      return validationError("kcal must be between 800 and 10000");
    }
    if (protein === null || protein < 10 || protein > 500) {
      return validationError("protein must be between 10 and 500 g");
    }
    if (carbs === null || carbs < 0 || carbs > 1500) {
      return validationError("carbs must be between 0 and 1500 g");
    }
    if (fat === null || fat < 5 || fat > 400) {
      return validationError("fat must be between 5 and 400 g");
    }
    // optional hydration target (0 allowed = "no water goal"); absent → keep
    const waterMlRaw = body.waterMl === undefined ? null : parseNumber(body.waterMl);
    if (waterMlRaw !== null && (waterMlRaw < 0 || waterMlRaw > 8000)) {
      return validationError("waterMl must be between 0 and 8000 ml");
    }

    let formulaMeta: string | null = null;
    if (body.formulaMeta !== undefined && body.formulaMeta !== null) {
      if (typeof body.formulaMeta !== "object") {
        return validationError("formulaMeta must be an object");
      }
      formulaMeta = JSON.stringify(body.formulaMeta);
    }

    const now = new Date().toISOString();
    const existing = await db.nutritionGoals.findFirst();
    const goals = existing
      ? await db.nutritionGoals.update({
          where: { id: existing.id },
          data: {
            kcal: round2(kcal),
            protein: round2(protein),
            carbs: round2(carbs),
            fat: round2(fat),
            ...(waterMlRaw !== null ? { waterMl: round2(waterMlRaw) } : {}),
            formulaMeta,
            updatedAt: now,
          },
        })
      : await db.nutritionGoals.create({
          data: {
            id: "goals",
            date: "1970-01-01",
            kcal: round2(kcal),
            protein: round2(protein),
            carbs: round2(carbs),
            fat: round2(fat),
            ...(waterMlRaw !== null ? { waterMl: round2(waterMlRaw) } : {}),
            formulaMeta,
            updatedAt: now,
          },
        });

    return ok({
      goals: {
        kcal: goals.kcal,
        protein: goals.protein,
        carbs: goals.carbs,
        fat: goals.fat,
        waterMl: goals.waterMl,
        formulaMeta: goals.formulaMeta,
      },
    });
  } catch (e) {
    console.error("nutrition goals PUT error", e);
    return serverError("failed to save goals");
  }
}
