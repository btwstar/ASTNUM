/**
 * Gym module shared types + pure display helpers.
 * No React here — safe to import from any client component.
 */
import type { WeightUnit } from "@/lib/store/app-store";
import { isArabicDigitsLang } from "@/lib/i18n/languages";

/* ── DTOs (mirror the API responses 1:1) ─────────────────────────────── */

export interface GymMuscle {
  muscleId: string;
  role: string; // primary | secondary
  weight: number; // 1 | 0.5
}

export interface GymExercise {
  id: string;
  nameAr: string;
  nameEn: string;
  equipment: string;
  custom: boolean;
  /** small list thumbnail (data URL) — null → placeholder tile in lists */
  imageThumb: string | null;
  muscles: GymMuscle[];
}

/** GET /api/gym/exercises/[id] — full media for the form viewer. */
export interface GymExerciseMedia {
  id: string;
  nameAr: string;
  nameEn: string;
  equipment: string;
  custom: boolean;
  /** full media data URL — image/* (static), image/gif, or video/mp4|webm|quicktime */
  image: string | null;
  imageThumb: string | null;
}

export interface WorkoutSummary {
  id: string;
  date: string;
  templateId: string | null;
  name: string | null;
  durationSec: number;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  volume: number; // Σ reps×kg over WORK sets
  setCount: number;
  workSetCount: number;
}

export interface SetRow {
  id: string;
  workoutId: string;
  exerciseId: string;
  setType: string; // warmup | work | failure
  reps: number;
  weightKg: number;
  rpe: number | null;
  isPr: boolean;
  createdAt: string;
}

export interface TemplateExerciseRow {
  id: string;
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  sortOrder: number;
  exercise: { nameAr: string; nameEn: string; equipment: string } | null;
}

export interface TemplateRow {
  id: string;
  name: string; // stored "AR | EN"
  description: string | null;
  builtin: boolean;
  /** v1.17: dedicated weekdays 0=Sunday..6=Saturday ([] = any day) */
  days: number[];
  createdAt: string;
  updatedAt: string;
  exercises: TemplateExerciseRow[];
}

export interface LastPerformance {
  reps: number;
  weightKg: number;
  date: string;
}

export interface WorkoutDetailData {
  workout: WorkoutSummary;
  sets: SetRow[];
  templateExercises: TemplateExerciseRow[];
  lastPerformance: Record<string, LastPerformance | null>;
  /** v1.17: exercises deferred FROM this session ("مؤجلة" badge) */
  deferredIds?: string[];
  /** v1.17: exercises carried INTO this session from a previous one */
  carriedIds?: string[];
}

export interface WorkoutsListData {
  today: string;
  active: WorkoutSummary | null;
  history: WorkoutSummary[];
}

export interface PersonalRecord {
  exerciseId: string;
  nameAr: string;
  nameEn: string;
  maxWeight: number;
  maxWeightReps: number;
  maxE1rm: number;
  maxVolume: number;
  lastDone: string;
  lastAt: string;
}

export interface SessionHistoryEntry {
  workoutId: string;
  date: string;
  e1rm: number;
  volume: number;
  topWeight: number;
  setCount: number;
}

export interface StatsData {
  today: string;
  weeklyVolume: Array<{ weekStart: string; volume: number; setCount: number }>;
  personalRecords: PersonalRecord[];
  exerciseHistory?: SessionHistoryEntry[];
}

/* ── constants ───────────────────────────────────────────────────────── */

/**
 * The FROZEN canonical 15 muscle ids (cross-module contract — names live in
 * the gym.muscle.<id> locale keys). Ids only; do NOT import the seed data
 * bundle client-side just for this list.
 */
export const CANONICAL_MUSCLES = [
  "chest",
  "front_delts",
  "side_delts",
  "biceps",
  "forearms",
  "abs",
  "quads",
  "upper_back",
  "lats",
  "rear_delts",
  "triceps",
  "lower_back",
  "glutes",
  "hamstrings",
  "calves",
] as const;

export const EQUIPMENT_KEYS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
] as const;

/** default rest timer (settings key rest_seconds overrides) */
export const DEFAULT_REST_SECONDS = 90;

/* ── pure display helpers ────────────────────────────────────────────── */

export type GymLang = string;

export function exerciseName(
  ex: { nameAr: string; nameEn: string } | null | undefined,
  lang: GymLang
): string {
  if (!ex) return "";
  return (isArabicDigitsLang(lang) ? ex.nameAr : ex.nameEn) || ex.nameAr || ex.nameEn;
}

/** Template names are stored "AR | EN" — split and pick per language. */
export function templateDisplayName(stored: string | null, lang: GymLang): string {
  if (!stored) return "";
  const [ar, en] = stored.split(" | ");
  return (isArabicDigitsLang(lang) ? ar : en) || ar || en || stored;
}

export const LB_PER_KG = 2.2046226218;

/** kg → display unit value (unrounded float; format at render time). */
export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg * LB_PER_KG : kg;
}

/** display unit value → kg (storage is ALWAYS kg). */
export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value / LB_PER_KG : value;
}

/** Stepper increment in DISPLAY units. */
export function weightStep(unit: WeightUnit): number {
  return unit === "lb" ? 5 : 2.5;
}

/** Weight formatted for display: whole or 1 decimal, never "-0". */
export function formatWeight(displayValue: number): string {
  const rounded = Math.round(displayValue * 10) / 10;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

/** mm:ss (or h:mm:ss past the hour) — timer display, tabular digits at render. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/** Compact duration for history rows: "32 د" style units are added by caller. */
export function durationMinutes(totalSeconds: number): number {
  return Math.round(totalSeconds / 60);
}
