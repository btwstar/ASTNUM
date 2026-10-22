/**
 * In-browser localStorage database for the offline API adapter (local-api).
 *
 * 23 tables mirroring the Prisma models 1:1 (same field names, YYYY-MM-DD
 * day keys, ISO timestamps, UUID ids, soft deletes via deletedAt). Storage is
 * fully guarded: a single probe write detects unavailable/quota-exceeded
 * localStorage (private mode, old webviews, bun) and switches PERMANENTLY to
 * an in-memory snapshot — the adapter then works like an ephemeral backend.
 *
 * Persistence: 150 ms debounced JSON snapshot + forced flush on
 * visibilitychange→hidden / pagehide (mobile webview lifecycle).
 *
 * Seeding: best-effort, idempotent `ensureSeeded()` replicating seed/index.ts
 * composition EXACTLY (fixed slug PKs, weeklyTarget 12, "AR | EN" template
 * names, te-<n>-<i> template-exercise ids, settings flag "seed:v1"="full-v1",
 * per-table count guards) from the PURE seed files (seed/data, seed/exercises,
 * seed/foods, seed/templates — never seed/index.ts which imports Prisma).
 */

import { MUSCLE_GROUPS } from "@/lib/seed/data";
import { EXERCISES } from "@/lib/seed/exercises";
import { FOODS } from "@/lib/seed/foods";
import { TEMPLATES, assertTemplatesReferenceValidExercises } from "@/lib/seed/templates";

export const STORAGE_KEY = "astnum-local-db-v1";
const PERSIST_DEBOUNCE_MS = 150;
const SEED_FLAG = "seed:v1";
const SEED_VERSION = "full-v2"; // v2 = per-100g food values (v1.16 migration)
const SEED_VERSION_V1 = "full-v1"; // pre-v1.16 (per-SERVING food values)

/* ── row types (Prisma models 1:1) ───────────────────────────────── */

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  scheduleJson: string;
  /** linked workout template (schedule = gymPlan); pre-v1.7 snapshots lack it */
  gymTemplateId: string | null;
  reminderTime: string | null;
  note: string | null;
  sortOrder: number;
  archived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface HabitLogRow {
  id: string;
  habitId: string;
  date: string;
  done: boolean;
  updatedAt: string;
}
export interface StreakFreezeRow {
  id: string;
  habitId: string;
  date: string;
  updatedAt: string;
}
export interface NoteRow {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  deletedAt: string | null;
  /** optional attached image pair (data URLs); pre-v1.4 snapshots lack them */
  image: string | null;
  imageThumb: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TaskRow {
  id: string;
  noteId: string | null;
  title: string;
  dueAt: string | null;
  priority: number;
  done: boolean;
  doneAt: string | null;
  repeatRule: string;
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TagRow {
  id: string;
  name: string;
  updatedAt: string;
}
export interface NoteTagRow {
  noteId: string;
  tagId: string;
}
export interface ExerciseRow {
  id: string;
  nameAr: string;
  nameEn: string;
  equipment: string;
  custom: boolean;
  deletedAt: string | null;
  /** exercise-form media pair (data URLs); pre-v1.7 snapshots lack them */
  image: string | null;
  imageThumb: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface MuscleGroupRow {
  id: string;
  nameAr: string;
  nameEn: string;
  svgId: string;
  region: string;
  weeklyTarget: number;
  sortOrder: number;
  updatedAt: string;
}
export interface ExerciseMuscleRow {
  exerciseId: string;
  muscleId: string;
  role: string;
  weight: number;
}
export interface WorkoutTemplateRow {
  id: string;
  name: string;
  description: string | null;
  /** v1.17 smart scheduling: JSON weekday ints 0..6 (null/[] = any day) */
  daysJson: string | null;
  /** v1.17 deferred-exercise carry → prepended to the next session */
  carryJson: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TemplateExerciseRow {
  id: string;
  templateId: string;
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  sortOrder: number;
}
export interface WorkoutRow {
  id: string;
  date: string;
  templateId: string | null;
  name: string | null;
  durationSec: number;
  notes: string | null;
  /** v1.17: exercises deferred FROM this session (JSON id array) */
  deferredJson: string | null;
  /** v1.17: carry snapshot taken when the session started */
  carryJson: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface SetRow {
  id: string;
  workoutId: string;
  exerciseId: string;
  setType: string;
  reps: number;
  weight: number;
  rpe: number | null;
  isPr: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface BodyMeasurementRow {
  id: string;
  date: string;
  weight: number | null;
  bodyFatPct: number | null;
  muscleMass: number | null;
  water: number | null;
  visceralFat: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface BodyCircumferenceRow {
  id: string;
  date: string;
  part: string;
  valueCm: number;
  updatedAt: string;
}
export interface ProgressPhotoRow {
  id: string;
  date: string;
  filePath: string;
  updatedAt: string;
}
export interface FoodRow {
  id: string;
  nameAr: string;
  nameEn: string;
  brand: string | null;
  barcode: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingG: number | null;
  custom: boolean;
  favorite: boolean;
  /** user-attached photo pair (data URLs); lists strip `image` (thumb only) */
  image: string | null;
  imageThumb: string | null;
  deletedAt: string | null;
  updatedAt: string;
}
export interface FoodLogRow {
  id: string;
  date: string;
  mealType: string;
  foodId: string | null;
  name: string;
  quantity: number;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  updatedAt: string;
}
export interface NutritionGoalRow {
  id: string;
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** v2.4 hydration target (ml/day) — pre-v2.4 snapshots lack it → 0 */
  waterMl: number;
  formulaMeta: string | null;
  updatedAt: string;
}
export interface WaterLogRow {
  id: string;
  date: string;
  /** water | juice | other */
  drink: string;
  /** display name — the hydration card's row label */
  name: string;
  amountMl: number;
  updatedAt: string;
}
export interface SettingRow {
  key: string;
  value: string;
  updatedAt: string;
}

/** The 23 tables, mirroring the Prisma models 1:1 (camelCase model names). */
export interface LocalDb {
  habits: HabitRow[];
  habitLogs: HabitLogRow[];
  streakFreezes: StreakFreezeRow[];
  notes: NoteRow[];
  tasks: TaskRow[];
  tags: TagRow[];
  noteTags: NoteTagRow[];
  exercises: ExerciseRow[];
  muscleGroups: MuscleGroupRow[];
  exerciseMuscles: ExerciseMuscleRow[];
  workoutTemplates: WorkoutTemplateRow[];
  templateExercises: TemplateExerciseRow[];
  workouts: WorkoutRow[];
  sets: SetRow[];
  bodyMeasurements: BodyMeasurementRow[];
  bodyCircumferences: BodyCircumferenceRow[];
  progressPhotos: ProgressPhotoRow[];
  foods: FoodRow[];
  foodLogs: FoodLogRow[];
  waterLogs: WaterLogRow[];
  nutritionGoals: NutritionGoalRow[];
  settings: SettingRow[];
}

/** Same order as the backup route's TABLE_KEYS (restore inserts in this order). */
export const TABLE_KEYS = [
  "habits",
  "habitLogs",
  "streakFreezes",
  "notes",
  "tasks",
  "tags",
  "noteTags",
  "exercises",
  "muscleGroups",
  "exerciseMuscles",
  "workoutTemplates",
  "templateExercises",
  "workouts",
  "sets",
  "bodyMeasurements",
  "bodyCircumferences",
  "progressPhotos",
  "foods",
  "foodLogs",
  "waterLogs",
  "nutritionGoals",
  "settings",
] as const;

export type TableKey = (typeof TABLE_KEYS)[number];

function emptyDb(): LocalDb {
  return {
    habits: [],
    habitLogs: [],
    streakFreezes: [],
    notes: [],
    tasks: [],
    tags: [],
    noteTags: [],
    exercises: [],
    muscleGroups: [],
    exerciseMuscles: [],
    workoutTemplates: [],
    templateExercises: [],
    workouts: [],
    sets: [],
    bodyMeasurements: [],
    bodyCircumferences: [],
    progressPhotos: [],
    foods: [],
    foodLogs: [],
    waterLogs: [],
    nutritionGoals: [],
    settings: [],
  };
}

/* ── guarded storage ─────────────────────────────────────────────── */

interface GuardedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let storage: GuardedStorage | null = null;
let storageBroken = false;

function probeStorage(): GuardedStorage | null {
  if (storageBroken) return null;
  try {
    const probeKey = `${STORAGE_KEY}::probe`;
    // Support window.localStorage, bun's localStorage and any web Storage.
    const candidate =
      typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
    if (!candidate) return null;
    candidate.setItem(probeKey, "1");
    candidate.removeItem(probeKey);
    return {
      getItem: (k) => candidate.getItem(k),
      setItem: (k, v) => candidate.setItem(k, v),
      removeItem: (k) => candidate.removeItem(k),
    };
  } catch {
    return null;
  }
}

/** Permanently degrade to the in-memory snapshot (quota/private-mode failures). */
function breakStorage(): void {
  storageBroken = true;
  storage = null;
}

/* ── load / persist lifecycle ───────────────────────────────────── */

let dbSnapshot: LocalDb | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenersInstalled = false;

function loadFromStorage(): LocalDb {
  if (!storage) return emptyDb();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    const base = emptyDb();
    for (const key of TABLE_KEYS) {
      const rows = parsed[key];
      if (Array.isArray(rows)) {
        (base as unknown as Record<string, unknown[]>)[key] = rows;
      }
    }
    // Schema drift guard: note rows written before the image pair existed
    // (v1.3 and earlier snapshots) get image/imageThumb coerced to null.
    base.notes = base.notes.map((n) => ({
      ...n,
      image: n.image ?? null,
      imageThumb: n.imageThumb ?? null,
    }));
    // Same guard for the v1.7 additions: exercise media pair + gymTemplateId.
    base.exercises = base.exercises.map((e) => ({
      ...e,
      image: e.image ?? null,
      imageThumb: e.imageThumb ?? null,
    }));
    base.habits = base.habits.map((h) => ({
      ...h,
      gymTemplateId: h.gymTemplateId ?? null,
    }));
    // Same guard for the v1.13 addition: food photo pair (pre-v1.13 snapshots).
    base.foods = base.foods.map((f) => ({
      ...f,
      image: f.image ?? null,
      imageThumb: f.imageThumb ?? null,
    }));
    // Same guard for the v1.17 additions: smart-session scheduling + deferral
    // columns on templates and workouts (pre-v1.17 snapshots lack them).
    base.workoutTemplates = base.workoutTemplates.map((t) => ({
      ...t,
      daysJson: t.daysJson ?? null,
      carryJson: t.carryJson ?? null,
    }));
    base.workouts = base.workouts.map((w) => ({
      ...w,
      deferredJson: w.deferredJson ?? null,
      carryJson: w.carryJson ?? null,
    }));
    // Same guard for the v2.4 additions: hydration target column on the
    // goals row (pre-v2.4 snapshots lack it → 0 = "no water goal yet").
    base.nutritionGoals = base.nutritionGoals.map((g) => ({
      ...g,
      waterMl: typeof g.waterMl === "number" && Number.isFinite(g.waterMl) ? g.waterMl : 0,
    }));
    return base;
  } catch {
    return emptyDb(); // corrupt snapshot → fresh start (best-effort, never throws)
  }
}

function persistNow(): void {
  if (!dbSnapshot || !storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(dbSnapshot));
  } catch {
    // Quota exceeded / private mode changed mid-session → in-memory only.
    breakStorage();
  }
}

/** Schedule a debounced persist (handlers call this after mutating tables). */
export function markDirty(): void {
  if (!storage) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, PERSIST_DEBOUNCE_MS);
}

/** Flush immediately (visibilitychange→hidden / pagehide listeners + tests). */
export function flushNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistNow();
}

function installFlushListeners(): void {
  if (flushListenersInstalled || typeof document === "undefined") return;
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushNow();
    });
    window.addEventListener("pagehide", flushNow);
    flushListenersInstalled = true;
  } catch {
    /* non-DOM runtime (bun scratch) — flushNow() can still be called manually */
  }
}

/* ── uuid ────────────────────────────────────────────────────────── */

/** crypto.randomUUID with an RFC4122 v4 fallback for old webviews. */
export function uuid(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ── seeding (mirrors seed/index.ts composition exactly) ─────────── */

function seedValue(db: LocalDb): string | null {
  const row = db.settings.find((r) => r.key === SEED_FLAG);
  return row ? row.value : null;
}

/**
 * Idempotent library seed — never throws (best-effort, like the server's
 * ensureSeeded guards). Per-table count guards keep a partially-seeded DB
 * self-healing; the settings flag carries the seed capacity version.
 */
export function ensureSeeded(): void {
  if (!dbSnapshot) getDb();
  const db = dbSnapshot;
  if (!db) return; // unreachable — getDb always assigns
  if (seedValue(db) === SEED_VERSION) return;

  try {
    assertTemplatesReferenceValidExercises(EXERCISES);
  } catch {
    return; // broken seed data — degrade gracefully, never crash the adapter
  }

  const now = new Date().toISOString();

  // 1) Muscle groups — the frozen canonical 15 (weeklyTarget 12, sortOrder i).
  if (db.muscleGroups.length === 0) {
    db.muscleGroups = MUSCLE_GROUPS.map((m, i) => ({
      id: m.id,
      nameAr: m.nameAr,
      nameEn: m.nameEn,
      svgId: m.svgId,
      region: m.region,
      weeklyTarget: 12,
      sortOrder: i,
      updatedAt: now,
    }));
  }

  // 2) Exercise library + muscle mappings (composite PK exerciseId+muscleId).
  if (db.exercises.length === 0) {
    db.exercises = EXERCISES.map((e) => ({
      id: e.id,
      nameAr: e.nameAr,
      nameEn: e.nameEn,
      equipment: e.equipment,
      custom: false,
      deletedAt: null,
      image: null,
      imageThumb: null,
      createdAt: now,
      updatedAt: now,
    }));
    db.exerciseMuscles = EXERCISES.flatMap((e) =>
      e.muscles.map((m) => ({
        exerciseId: e.id,
        muscleId: m.muscleId,
        role: m.role,
        weight: m.weight,
      }))
    );
  }

  // 3) Workout templates + prescriptions ("AR | EN" names, te-<n>-<i> ids).
  if (db.workoutTemplates.length === 0) {
    db.workoutTemplates = TEMPLATES.map((t) => ({
      id: t.id,
      name: `${t.nameAr} | ${t.nameEn}`,
      description: t.description,
      daysJson: null,
      carryJson: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    db.templateExercises = TEMPLATES.flatMap((t) =>
      t.exercises.map((te, i) => ({
        id: `te-${t.id.replace("tpl-", "")}-${i + 1}`,
        templateId: t.id,
        exerciseId: te.exerciseId,
        targetSets: te.targetSets,
        targetReps: te.targetReps,
        sortOrder: i,
      }))
    );
  }

  // 4) Food library — values are PER 100 G (v2 convention; servingG =
  //    typical portion grams, used as the portion-sheet prefill).
  if (db.foods.length === 0) {
    db.foods = FOODS.map((f) => ({
      id: f.id,
      nameAr: f.nameAr,
      nameEn: f.nameEn,
      brand: null,
      barcode: null,
      kcal: f.kcal,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      servingG: f.servingG,
      custom: false,
      favorite: false,
      image: null,
      imageThumb: null,
      deletedAt: null,
      updatedAt: now,
    }));
  }

  // 4b) v1.16 DATA-CONVENTION MIGRATION (full-v1 → full-v2): existing
  // localStorage DBs (APK installs, dev sessions) hold per-SERVING kcal
  // that the per-100g portion sheet silently inflated by servingG/100
  // on every log. Seed rows (stable slug ids) get the new per-100g values;
  // ONLY the 4 macro numbers change — user edits to name/brand/favorite/
  // photo survive, soft-deleted rows (user chose to delete) and UUID rows
  // (user-created foods) are untouched. Mirrors seed/index.ts step 4b.
  if (seedValue(db) === SEED_VERSION_V1) {
    const byId = new Map(FOODS.map((f) => [f.id, f]));
    for (const row of db.foods) {
      const f = byId.get(row.id);
      if (!f || row.deletedAt !== null) continue;
      row.kcal = f.kcal;
      row.protein = f.protein;
      row.carbs = f.carbs;
      row.fat = f.fat;
    }
  }

  // 5) Mark full capacity as seeded (flag row = the server's lock row).
  const flagIndex = db.settings.findIndex((r) => r.key === SEED_FLAG);
  if (flagIndex >= 0) {
    db.settings[flagIndex] = { key: SEED_FLAG, value: SEED_VERSION, updatedAt: now };
  } else {
    db.settings.push({ key: SEED_FLAG, value: SEED_VERSION, updatedAt: now });
  }

  markDirty();
}

/* ── the singleton ────────────────────────────────────────────────── */

/** The live in-memory DB (tables are mutated in place by handlers). */
export function getDb(): LocalDb {
  if (!dbSnapshot) {
    storage = probeStorage();
    dbSnapshot = loadFromStorage();
    installFlushListeners();
  }
  // NOTE: unlike getDb in 6-a, this does NOT auto-seed — the server's lazy seed
  // runs ONLY inside library routes (muscles/gym/nutrition foods/demo, each
  // calls ensureSeeded() explicitly). Settings/tasks/habits/notes must see the
  // DB as-is (e.g. right after a backup wipe: settings empty, seed flag gone).
  return dbSnapshot;
}

/* ── test-only helpers (used by the scratch verification, not by routes) ── */

/** Wipe everything (storage + memory) — test-only, mirrors backup wipe semantics. */
export function __resetForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  dbSnapshot = emptyDb();
}

/** Force the in-memory fallback for a whole test run (never touch storage again). */
export function __forceInMemoryForTests(): void {
  breakStorage();
}

/** Read the storage engine state (probe result) — test-only. */
export function __storageAvailableForTests(): boolean {
  return storage !== null;
}
