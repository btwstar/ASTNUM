"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_CUSTOM_HEX,
  migrateLegacyHue,
  normalizeHex,
} from "@/lib/theme/custom-color";
import { safeLang, type LanguageRegion } from "@/lib/i18n/languages";
import { toLocalDateKey } from "@/lib/i18n/format";

/** A strict YYYY-MM-DD key (the calendar sheet + widget day links). */
export function isValidDateKey(key: string | null | undefined): key is string {
  return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(`${key}T12:00:00`));
}

/** Any of the 160 registered language codes (see src/lib/i18n/languages.ts). */
export type Lang = string;
export type { LanguageRegion };
export type ThemeMode = "dark" | "light" | "system";
export type Accent = "mint" | "amber" | "rose" | "violet" | "rainbow" | "custom";
export type WeightUnit = "kg" | "lb";
export type LengthUnit = "cm" | "in";
export type MainTab = "today" | "habits" | "gym" | "notes" | "body";
export type OnboardingGoal = "habits" | "fitness" | "both";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
/** First column of the calendar grid: 0=Sunday · 1=Monday · 6=Saturday. */
export type WeekStart = 0 | 1 | 6;
/** The three per-day dot marks of the calendar (sheet + month widget). */
export interface CalendarMarks {
  session: boolean;
  task: boolean;
  habit: boolean;
}
export const DEFAULT_CALENDAR_MARKS: CalendarMarks = { session: true, task: true, habit: true };

interface AppState {
  lang: Lang;
  themeMode: ThemeMode;
  accent: Accent;
  /** The custom accent color as a canonical "#rrggbb" hex — ANY color is
   *  allowed; the OKLCH theme is derived from it (lib/theme/custom-color). */
  customColor: string;
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  /** v2.4 calendar editor: first weekday of the month grid (sheet + widget) */
  calendarWeekStart: WeekStart;
  /** v2.4 calendar editor: which day dots the calendar shows */
  calendarMarks: CalendarMarks;
  onboarded: boolean;
  goal: OnboardingGoal;
  activeTab: MainTab;
  /** template id to auto-start when the gym tab next becomes active (habit → workout) */
  gymAutoStartTemplateId: string | null;
  /** consumed-once intent: segment the notes screen should open on when its tab
   *  becomes active ("كل المهام" from Today → مهامي; was landing on الملاحظات) */
  notesSegmentIntent: "notes" | "tasks" | "archived" | "trash" | null;
  /** consumed-once intent: sub-tab the body screen should open on when its tab
   *  becomes active (home-screen widget taps: calories → أكل, weight → قياسات) */
  bodySubTabIntent: "measurements" | "muscles" | "food" | null;
  /** consumed-once intent: open a FRESH habit editor (quick-capture widget "＋ عادة") */
  habitsAddIntent: boolean;
  /** consumed-once intent: open this habit's detail sheet (pinned habit card) */
  habitDetailIntent: string | null;
  /** consumed-once intent: open the notes quick-capture (quick-capture widget "＋ ملاحظة") */
  notesComposeIntent: "note" | "task" | null;
  /** consumed-once intent: open this note in the editor (pinned note card) */
  noteEditorIntent: string | null;
  /** the «عنصر مثبّت» widget id the picker sheet is configuring (null → closed) */
  pinPickerWidgetId: number | null;
  /** the calendar sheet's focused day as YYYY-MM-DD (null → closed) — opened
   *  by the today-tab date button + the «التقويم» widget day taps */
  calendarDate: string | null;
  analystOpen: boolean;
  settingsOpen: boolean;

  setLang: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  /** Invalid hex is ignored (state keeps the previous color). */
  setCustomColor: (hex: string) => void;
  setWeightUnit: (unit: WeightUnit) => void;
  setLengthUnit: (unit: LengthUnit) => void;
  /** calendar editor (settings → Calendar) — persisted UI preference */
  setCalendarWeekStart: (start: WeekStart) => void;
  setCalendarMarks: (marks: Partial<CalendarMarks>) => void;
  completeOnboarding: (goal: OnboardingGoal) => void;
  setActiveTab: (tab: MainTab) => void;
  /** navigate to the Workouts main tab (Today's workout card + habits use it) */
  openGym: () => void;
  /** navigate to the gym tab AND auto-start a session of this template (consumed once) */
  openGymWithTemplate: (templateId: string) => void;
  /** navigate to the notes tab AND open it on this segment (consumed once) */
  openNotesWithSegment: (segment: "notes" | "tasks" | "archived" | "trash") => void;
  /** navigate to the body tab AND open it on this sub-tab (consumed once) */
  openBodyWithSub: (sub: "measurements" | "muscles" | "food") => void;
  /** navigate to the habits tab AND open a fresh editor sheet (consumed once) */
  openHabitsWithAdd: () => void;
  /** navigate to the habits tab AND open this habit's detail (consumed once) */
  openHabitDetail: (habitId: string) => void;
  /** navigate to the notes tab AND open quick-capture (consumed once) */
  openNotesWithCompose: (type: "note" | "task") => void;
  /** navigate to the notes tab AND open this note in the editor (consumed once) */
  openNoteEditor: (noteId: string) => void;
  /** open the pinned-item picker for this widget instance (null closes it) */
  openPinPicker: (widgetId: number) => void;
  setPinPickerWidgetId: (id: number | null) => void;
  /** open the calendar sheet focused on a day (defaults to today) */
  openCalendarSheet: (dateKey?: string) => void;
  setCalendarDate: (dateKey: string | null) => void;
  setAnalystOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  hydrateFromServer: (prefs: {
    lang?: Lang;
    themeMode?: ThemeMode;
    accent?: Accent;
    customColor?: string;
    /** legacy (≤ v1.4): OKLCH hue only — converted to customColor */
    customHue?: number;
    weightUnit?: WeightUnit;
    lengthUnit?: LengthUnit;
    onboarded?: boolean;
    goal?: OnboardingGoal;
  }) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      lang: "en",
      themeMode: "dark",
      accent: "mint",
      customColor: DEFAULT_CUSTOM_HEX,
      weightUnit: "kg",
      lengthUnit: "cm",
      calendarWeekStart: 0,
      calendarMarks: { ...DEFAULT_CALENDAR_MARKS },
      onboarded: false,
      goal: "both",
      activeTab: "today",
      gymAutoStartTemplateId: null,
      notesSegmentIntent: null,
      bodySubTabIntent: null,
      habitsAddIntent: false,
      habitDetailIntent: null,
      notesComposeIntent: null,
      noteEditorIntent: null,
      pinPickerWidgetId: null,
      calendarDate: null,
      analystOpen: false,
      settingsOpen: false,

      setLang: (lang) => set({ lang: safeLang(lang) }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccent: (accent) => set({ accent }),
      setCustomColor: (hex) => {
        const normalized = normalizeHex(hex);
        if (normalized) set({ customColor: normalized });
      },
      setWeightUnit: (weightUnit) => set({ weightUnit }),
      setLengthUnit: (lengthUnit) => set({ lengthUnit }),
      setCalendarWeekStart: (calendarWeekStart) => set({ calendarWeekStart }),
      setCalendarMarks: (marks) =>
        set((s) => ({ calendarMarks: { ...s.calendarMarks, ...marks } })),
      completeOnboarding: (goal) => set({ onboarded: true, goal }),
      setActiveTab: (activeTab) => set({ activeTab }),
      openGym: () => set({ activeTab: "gym", analystOpen: false }),
      openGymWithTemplate: (templateId) =>
        set({ activeTab: "gym", analystOpen: false, gymAutoStartTemplateId: templateId }),
      openNotesWithSegment: (segment) =>
        set({ activeTab: "notes", analystOpen: false, notesSegmentIntent: segment }),
      openBodyWithSub: (sub) =>
        set({ activeTab: "body", analystOpen: false, bodySubTabIntent: sub }),
      openHabitsWithAdd: () =>
        set({ activeTab: "habits", analystOpen: false, habitsAddIntent: true }),
      openHabitDetail: (habitId) =>
        set({ activeTab: "habits", analystOpen: false, habitDetailIntent: habitId }),
      openNotesWithCompose: (type) =>
        set({ activeTab: "notes", analystOpen: false, notesComposeIntent: type }),
      openNoteEditor: (noteId) =>
        set({ activeTab: "notes", analystOpen: false, noteEditorIntent: noteId }),
      openPinPicker: (widgetId) =>
        set({ pinPickerWidgetId: widgetId, settingsOpen: false, analystOpen: false }),
      setPinPickerWidgetId: (id) => set({ pinPickerWidgetId: id }),
      openCalendarSheet: (dateKey) =>
        set({
          calendarDate: isValidDateKey(dateKey) ? dateKey : toLocalDateKey(),
          settingsOpen: false,
          analystOpen: false,
        }),
      setCalendarDate: (dateKey) => set({ calendarDate: dateKey }),
      setAnalystOpen: (analystOpen) => set({ analystOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

      hydrateFromServer: (prefs) => {
        const { customColor, customHue, lang, ...rest } = prefs;
        const patch: Partial<AppState> = { ...rest };
        if (lang !== undefined) patch.lang = safeLang(lang);
        const hex = normalizeHex(customColor ?? "");
        if (hex) patch.customColor = hex;
        else if (typeof customHue === "number") patch.customColor = migrateLegacyHue(customHue);
        set(patch);
      },
    }),
    {
      name: "astnum-app",
      partialize: (s) => ({
        lang: s.lang,
        themeMode: s.themeMode,
        accent: s.accent,
        customColor: s.customColor,
        weightUnit: s.weightUnit,
        lengthUnit: s.lengthUnit,
        calendarWeekStart: s.calendarWeekStart,
        calendarMarks: s.calendarMarks,
        onboarded: s.onboarded,
        goal: s.goal,
      }),
      /* Merge with migration: sessions persisted before v1.5 stored only a
       * customHue (OKLCH angle). Convert it to the closest full hex color so
       * upgraded users keep their picked look — and strip the legacy key. */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState> & {
          customHue?: unknown;
          pro?: unknown; // legacy (≤ v1.4): dropped — no Pro tier exists anymore
        };
        const merged = { ...current, ...p } as AppState & { customHue?: unknown; pro?: unknown };
        if (merged.lang !== undefined) merged.lang = safeLang(merged.lang);
        // v2.4 calendar editor: guard the persisted shapes (pre-v2.4 snapshots)
        if (
          merged.calendarWeekStart !== 0 &&
          merged.calendarWeekStart !== 1 &&
          merged.calendarWeekStart !== 6
        ) {
          merged.calendarWeekStart = 0;
        }
        merged.calendarMarks = {
          ...DEFAULT_CALENDAR_MARKS,
          ...(merged.calendarMarks ?? {}),
        };
        const hex = normalizeHex(typeof p.customColor === "string" ? p.customColor : "");
        merged.customColor =
          hex ??
          (typeof p.customHue === "number"
            ? migrateLegacyHue(p.customHue)
            : current.customColor);
        delete merged.customHue;
        delete merged.pro;
        return merged;
      },
    }
  )
);

/**
 * Broadcasts the contextual FAB press to the active screen.
 * Contract: every module screen listens for `astnum:fab` and opens its own
 * "add/create" experience (the gym screen starts a session / opens the picker).
 * Detail.tab tells which tab was active.
 */
export function emitFabPress(
  tab: MainTab | "body-muscles" | "body-measure" | "body-food"
) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astnum:fab", { detail: { tab } }));
  }
}
