"use client";

/**
 * Habits module — shared types, constants and tiny presentational helpers.
 * Client-side counterpart of the API DTOs.
 */
import React from "react";
import {
  Repeat2,
  Flame,
  Droplets,
  Coffee,
  BookOpen,
  Moon,
  Sun,
  Sunrise,
  Dumbbell,
  Footprints,
  Bike,
  Heart,
  Brain,
  Music,
  Code2,
  PenLine,
  Wallet,
  Sparkles,
  Zap,
  Timer,
  CalendarCheck,
  Leaf,
  PersonStanding,
  Salad,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HabitSchedule } from "@/lib/logic/streak";

/* ── pickers ─────────────────────────────────────────────────────── */

export const LUCIDE_ICONS: Record<string, LucideIcon> = {
  Repeat2,
  Flame,
  Droplets,
  Coffee,
  BookOpen,
  Moon,
  Sun,
  Sunrise,
  Dumbbell,
  Footprints,
  Bike,
  Heart,
  Brain,
  Music,
  Code2,
  PenLine,
  Wallet,
  Sparkles,
  Zap,
  Timer,
  CalendarCheck,
  Leaf,
  PersonStanding,
  Salad,
};

/**
 * 24 curated lucide icons for the picker (stored as "lucide:Name").
 * `key` → localized a11y label (v1.15, review finding 3): the radios used to
 * expose raw component names ("Repeat2", "Flame") to screen readers.
 */
export const ICON_CHOICES: Array<{ value: string; icon: LucideIcon; key: string }> = [
  { value: "lucide:Repeat2", icon: Repeat2, key: "habits.icon.repeat" },
  { value: "lucide:Flame", icon: Flame, key: "habits.icon.flame" },
  { value: "lucide:Droplets", icon: Droplets, key: "habits.icon.droplets" },
  { value: "lucide:Coffee", icon: Coffee, key: "habits.icon.coffee" },
  { value: "lucide:BookOpen", icon: BookOpen, key: "habits.icon.book" },
  { value: "lucide:Moon", icon: Moon, key: "habits.icon.moon" },
  { value: "lucide:Sun", icon: Sun, key: "habits.icon.sun" },
  { value: "lucide:Sunrise", icon: Sunrise, key: "habits.icon.sunrise" },
  { value: "lucide:Dumbbell", icon: Dumbbell, key: "habits.icon.dumbbell" },
  { value: "lucide:Footprints", icon: Footprints, key: "habits.icon.footprints" },
  { value: "lucide:Bike", icon: Bike, key: "habits.icon.bike" },
  { value: "lucide:Heart", icon: Heart, key: "habits.icon.heart" },
  { value: "lucide:Brain", icon: Brain, key: "habits.icon.brain" },
  { value: "lucide:Music", icon: Music, key: "habits.icon.music" },
  { value: "lucide:Code2", icon: Code2, key: "habits.icon.code" },
  { value: "lucide:PenLine", icon: PenLine, key: "habits.icon.pen" },
  { value: "lucide:Wallet", icon: Wallet, key: "habits.icon.wallet" },
  { value: "lucide:Sparkles", icon: Sparkles, key: "habits.icon.sparkles" },
  { value: "lucide:Zap", icon: Zap, key: "habits.icon.zap" },
  { value: "lucide:Timer", icon: Timer, key: "habits.icon.timer" },
  { value: "lucide:CalendarCheck", icon: CalendarCheck, key: "habits.icon.calendar" },
  { value: "lucide:Leaf", icon: Leaf, key: "habits.icon.leaf" },
  { value: "lucide:PersonStanding", icon: PersonStanding, key: "habits.icon.person" },
  { value: "lucide:Salad", icon: Salad, key: "habits.icon.salad" },
];

/** Emoji alternatives (stored as-is). */
export const EMOJI_CHOICES: string[] = ["💧", "📚", "🏃", "🧘", "💪", "🌱", "😴", "☕", "📝", "🎯"];

/**
 * 8 curated colors (no blue/indigo — matches the design rules).
 * `key` → localized a11y label (v1.15): radios used to read raw hex codes.
 */
export const COLOR_PALETTE: Array<{ value: string; key: string }> = [
  { value: "#34d399", key: "habits.color.mint" },
  { value: "#22d3ee", key: "habits.color.cyan" },
  { value: "#a3e635", key: "habits.color.lime" },
  { value: "#fbbf24", key: "habits.color.amber" },
  { value: "#fb923c", key: "habits.color.orange" },
  { value: "#fb7185", key: "habits.color.rose" },
  { value: "#c084fc", key: "habits.color.purple" },
  { value: "#e879f9", key: "habits.color.fuchsia" },
];

export const DEFAULT_HABIT_COLOR = "#34d399";
export const FREEZE_LIMIT = 2;

/* ── DTOs (mirror of the API responses) ──────────────────────────── */

export interface HabitDayState {
  date: string;
  done: boolean;
  scheduled: boolean;
  frozen?: boolean;
}

export interface HabitStreaks {
  current: number;
  best: number;
}

export interface HabitDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  reminderTime: string | null;
  note: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  todayDone: boolean;
  todayFrozen: boolean;
  streaks: HabitStreaks;
  freezesUsedThisMonth: number;
  freezesRemainingThisMonth: number;
  last7: HabitDayState[];
  /** set when this habit mirrors a workout template (schedule = gymPlan) */
  gymTemplateId: string | null;
  /** "due" = its turn today (postponed until done) | "next" = queued */
  gymTurn: "due" | "next" | null;
  /** days since the last completion (0 = never done) */
  gymPendingDays: number;
}

export interface HabitsListData {
  today: string;
  habits: HabitDTO[];
}

/** Shape accepted by the editor sheet (list DTO or detail payload both fit). */
export interface EditorHabit {
  id: string;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  reminderTime: string | null;
  note: string | null;
}

/** Habit as returned by the detail endpoint (EditorHabit + row metadata). */
export interface DetailHabit extends EditorHabit {
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** linked workout template when schedule = gymPlan */
  gymTemplateId?: string | null;
}

export interface HabitDetailData {
  today: string;
  habit: DetailHabit;
  days: HabitDayState[];
  streaks: HabitStreaks;
  weeklyRate: number;
  freezesUsedThisMonth: number;
  freezesRemainingThisMonth: number;
  todayDone: boolean;
  todayFrozen: boolean;
}

export interface StatsDay {
  date: string;
  scheduled: number;
  done: number;
}

export interface StatsData {
  from: string;
  to: string;
  habitCount: number;
  days: StatsDay[];
}

export interface LogResult {
  done: boolean;
  date: string;
  streaks: HabitStreaks;
  milestone: number | null;
  todayDone: boolean;
}

export interface FreezeResult {
  date: string;
  freezesUsedThisMonth: number;
  remaining: number;
  streaks: HabitStreaks;
}

/* ── helpers ──────────────────────────────────────────────────────── */

/** "#rrggbb" + alpha → "rgba(r,g,b,a)" (safe fallback on malformed input). */
export function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(52, 211, 153, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Light-dark luminance check → pick a readable check-mark color on filled chips. */
export function isLightHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/**
 * Render a habit icon: "lucide:Name" → the lucide icon, anything else → emoji.
 * Unknown lucide names fall back to Repeat2 (never crashes on bad data).
 */
export function HabitIcon({
  icon,
  size = 22,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  if (icon.startsWith("lucide:")) {
    const Cmp = LUCIDE_ICONS[icon.slice("lucide:".length)] ?? Repeat2;
    return <Cmp className={cn("shrink-0", className)} style={{ width: size, height: size }} aria-hidden />;
  }
  return (
    <span
      className={cn("shrink-0 select-none", className)}
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden
    >
      {icon}
    </span>
  );
}
