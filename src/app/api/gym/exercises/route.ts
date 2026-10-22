/**
 * /api/gym/exercises — the exercise library.
 *
 * GET  ?q=&muscle=&equipment=
 *      q        → case-insensitive substring on nameAr OR nameEn
 *      muscle   → canonical muscle id (filters via ExerciseMuscles join)
 *      equipment→ one of barbell|dumbbell|machine|cable|bodyweight|kettlebell|band|other|none
 *      Returns non-deleted exercises each with their muscle mappings
 *      [{muscleId, role, weight}] (primary 1.0 / secondary 0.5) and the
 *      small imageThumb (lists NEVER carry the full media — payload
 *      discipline; the full image/GIF/video is served by the [id] route).
 *      The route seeds the library on demand (idempotent ensureSeed).
 *
 * POST { nameAr?, nameEn?, equipment?, muscles?: [{muscleId, role}],
 *        image?, imageThumb? }
 *      → create a CUSTOM exercise. At least one name required (the missing
 *      locale falls back to the given one), at least one PRIMARY muscle.
 *      Media pair optional (validated via resolveExerciseMediaPair: image
 *      may be image/GIF/video data URL; thumb a small static image or null).
 *      Server-side validation → 400 VALIDATION on any bad field.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveExerciseMediaPair } from "@/lib/image-compress";
import {
  bad,
  ensureSeeded,
  ok,
  readJson,
  serverError,
  validEquipment,
} from "../_helpers";

export const dynamic = "force-dynamic";

interface MuscleDTO {
  muscleId: string;
  role: string;
  weight: number;
}

interface ExerciseDTO {
  id: string;
  nameAr: string;
  nameEn: string;
  equipment: string;
  custom: boolean;
  /** small list thumbnail (null → the card renders a placeholder tile) */
  imageThumb: string | null;
  muscles: MuscleDTO[];
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const muscle = req.nextUrl.searchParams.get("muscle")?.trim() ?? "";
    const equipment = req.nextUrl.searchParams.get("equipment")?.trim() ?? "";

    const [exercises, mappings] = await Promise.all([
      db.exercises.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      db.exerciseMuscles.findMany(),
    ]);

    const musclesByExercise = new Map<string, MuscleDTO[]>();
    for (const m of mappings) {
      let list = musclesByExercise.get(m.exerciseId);
      if (!list) {
        list = [];
        musclesByExercise.set(m.exerciseId, list);
      }
      list.push({ muscleId: m.muscleId, role: m.role, weight: m.weight });
    }

    const equipmentFilter = equipment === "" ? null : validEquipment(equipment);

    const list: ExerciseDTO[] = [];
    for (const e of exercises) {
      const muscles = musclesByExercise.get(e.id) ?? [];
      if (muscle && !muscles.some((m) => m.muscleId === muscle)) continue;
      if (equipmentFilter && e.equipment !== equipmentFilter) continue;
      if (q && !e.nameAr.toLowerCase().includes(q) && !e.nameEn.toLowerCase().includes(q)) {
        continue;
      }
      list.push({
        id: e.id,
        nameAr: e.nameAr,
        nameEn: e.nameEn,
        equipment: e.equipment,
        custom: e.custom,
        imageThumb: e.imageThumb,
        muscles,
      });
    }

    return ok({ exercises: list });
  } catch (e) {
    console.error("gym exercises GET error", e);
    return serverError("failed_to_load_exercises");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
    const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
    if (!nameAr && !nameEn) return bad("name_required");
    if (nameAr.length > 120 || nameEn.length > 120) return bad("name_too_long");
    const finalAr = nameAr || nameEn;
    const finalEn = nameEn || nameAr;

    const equipment =
      body.equipment === undefined ? "other" : validEquipment(body.equipment);
    if (!equipment) return bad("invalid_equipment");

    // Muscles: at least one PRIMARY mapping; every muscleId must exist.
    const rawMuscles = Array.isArray(body.muscles) ? body.muscles : [];
    const parsed: Array<{ muscleId: string; role: "primary" | "secondary" }> = [];
    for (const raw of rawMuscles) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("invalid_muscles");
      const r = raw as { muscleId?: unknown; role?: unknown };
      if (typeof r.muscleId !== "string" || !r.muscleId) return bad("invalid_muscle_id");
      if (r.role !== "primary" && r.role !== "secondary") return bad("invalid_muscle_role");
      if (parsed.some((p) => p.muscleId === r.muscleId)) continue; // dedupe silently
      parsed.push({ muscleId: r.muscleId, role: r.role });
    }
    if (parsed.length === 0 || !parsed.some((p) => p.role === "primary")) {
      return bad("primary_muscle_required");
    }
    const knownMuscles = new Set(
      (await db.muscleGroups.findMany({ select: { id: true } })).map((m) => m.id)
    );
    if (parsed.some((p) => !knownMuscles.has(p.muscleId))) return bad("unknown_muscle_id");

    // Optional media pair (image / GIF / video + thumbnail).
    const media = resolveExerciseMediaPair(body.image, body.imageThumb);
    if (media.kind === "invalid") return bad("invalid_media");

    const now = new Date().toISOString();
    const id = `custom-${crypto.randomUUID()}`;
    const [exercise] = await db.$transaction([
      db.exercises.create({
        data: {
          id,
          nameAr: finalAr,
          nameEn: finalEn,
          equipment,
          custom: true,
          deletedAt: null,
          image: media.kind === "set" ? media.image : null,
          imageThumb: media.kind === "set" ? media.imageThumb : null,
          createdAt: now,
          updatedAt: now,
        },
      }),
      db.exerciseMuscles.createMany({
        data: parsed.map((p) => ({
          exerciseId: id,
          muscleId: p.muscleId,
          role: p.role,
          weight: p.role === "primary" ? 1 : 0.5,
        })),
      }),
    ]);

    return ok({
      exercise: {
        id: exercise.id,
        nameAr: exercise.nameAr,
        nameEn: exercise.nameEn,
        equipment: exercise.equipment,
        custom: exercise.custom,
        imageThumb: exercise.imageThumb,
        muscles: parsed.map((p) => ({
          muscleId: p.muscleId,
          role: p.role,
          weight: p.role === "primary" ? 1 : 0.5,
        })),
      } satisfies ExerciseDTO,
    });
  } catch (e) {
    console.error("gym exercises POST error", e);
    return serverError("failed_to_create_exercise");
  }
}
