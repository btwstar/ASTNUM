/**
 * Native widget bridge — the ONLY place the web app talks to the Android
 * widget layer. The native side is an inline Capacitor 7 plugin
 * (app/astnum/mobile/widget/AstnumWidgetsPlugin.java, registered by
 * MainActivity). Capabilities:
 *
 *   update({payload})      → persist the JSON snapshot (SharedPreferences)
 *                            + immediately re-render every placed widget.
 *   requestPin({widget})   → system "add to home screen" dialog (API 26+).
 *   "deepLink" event       → widget taps: MainActivity is singleTask, so a
 *                            tap while the app is alive arrives as
 *                            onNewIntent → notifyListeners("deepLink").
 *                            (v1.18 bug fixed here: the warm listener used
 *                            a custom method name that didn't exist on the
 *                            native side — Capacitor events MUST go through
 *                            the built-in addListener().)
 *   "quickAction" event    → the active-session widget's on-widget buttons
 *                            (log set / next exercise) — the native
 *                            receiver forwards them here when the process
 *                            is alive so the action happens WITHOUT
 *                            bringing the app up; a dead process falls
 *                            back to launching with a deep link.
 *   cold start             → getLaunchUrl() (deep link carried on the
 *                            launch intent).
 *
 * On plain web (dev preview / site) every call resolves against a no-op shim
 * so the same bundle runs everywhere; the snapshot still runs there for
 * verification (window.__astnumWidgetSnapshot).
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useAppStore } from "@/lib/store/app-store";
import { toLocalDateKey } from "@/lib/i18n/format";
import { translateKey } from "@/lib/i18n";
import { toast } from "sonner";
import { queryClient } from "@/components/providers";
import { buildWidgetSnapshot } from "./snapshot";
import { processCaptures, parseCaptureJson, type QuickCapture } from "./capture";
import type { WidgetSnapshot, WidgetKind } from "./types";

export type { WidgetKind };

interface DeepLinkData {
  url: string;
}

interface QuickActionData {
  action: "logSet" | "nextExercise";
  exerciseId: string;
  widgetId?: number;
}

/** Live quick-capture from the native dialog (process alive → the row is
 *  created right here through the app's own routes). */
interface QuickCaptureData {
  id: string;
  type: "habit" | "note" | "water";
  title: string;
  /** type="water": "water" | "juice" | "other" (the picked drink chip) */
  drink?: string;
}

interface AstnumWidgetsPlugin {
  update(options: { payload: string; ts: number }): Promise<void>;
  requestPin(options: { widget: WidgetKind }): Promise<{ ok: boolean; supported: boolean }>;
  getWidgetIds(options: { widget: WidgetKind }): Promise<{ ids: number[] }>;
  getLaunchUrl(): Promise<{ url: string | null }>;
  /** Read the native quick-capture queue (JSON array of QuickCapture). */
  consumeCaptures(): Promise<{ entries: string }>;
  /** Confirm entries as committed — native removes them from its queue. */
  captureAck(options: { ids: string[] }): Promise<void>;
  addListener(
    eventName: "deepLink",
    listenerFunc: (data: DeepLinkData) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "quickAction",
    listenerFunc: (data: QuickActionData) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "quickCapture",
    listenerFunc: (data: QuickCaptureData) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/* Web/dev shim — native only exists inside the APK. */
const AstnumWidgets = registerPlugin<AstnumWidgetsPlugin>("AstnumWidgets", {
  web: async () => ({
    update: async () => undefined,
    requestPin: async () => ({ ok: false, supported: false }),
    getWidgetIds: async () => ({ ids: [] }),
    getLaunchUrl: async () => ({ url: null }),
    consumeCaptures: async () => ({ entries: "[]" }),
    captureAck: async () => undefined,
    addListener: async () =>
      ({ remove: async () => undefined }) as unknown as PluginListenerHandle,
    removeAllListeners: async () => undefined,
  }),
});

export const isNativeApp = Capacitor.isNativePlatform();

/* ── snapshot push ───────────────────────────────────────────────────── */

let lastPayload = "";

/** Build + push the widget snapshot. Safe everywhere; failures never throw. */
export async function pushWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const snapshot = await buildWidgetSnapshot();
    const payload = JSON.stringify(snapshot);
    // verification hook (dev + APK): inspect what the widgets receive
    (globalThis as Record<string, unknown>).__astnumWidgetSnapshot = snapshot;
    if (payload !== lastPayload || isNativeApp) {
      lastPayload = payload;
      if (isNativeApp) {
        await AstnumWidgets.update({ payload, ts: Date.now() });
      }
    }
    return snapshot;
  } catch {
    return null;
  }
}

/** Ask the launcher to pin a widget (Android 8+; most launchers support it). */
export async function requestPinWidget(
  kind: WidgetKind
): Promise<{ ok: boolean; supported: boolean }> {
  if (!isNativeApp) return { ok: false, supported: false };
  try {
    return await AstnumWidgets.requestPin({ widget: kind });
  } catch {
    return { ok: false, supported: false };
  }
}

/** Ids of every placed instance of one widget kind (config UIs). */
export async function getPlacedWidgetIds(kind: WidgetKind): Promise<number[]> {
  if (!isNativeApp) return [];
  try {
    const res = await AstnumWidgets.getWidgetIds({ widget: kind });
    return res.ids ?? [];
  } catch {
    return [];
  }
}

/* ── habit one-tap logging (from the habits list widget rows) ────────── */

async function toggleHabitFromWidget(habitId: string): Promise<void> {
  const lang = useAppStore.getState().lang;
  try {
    const { habits } = await apiGet<{
      habits: Array<{ id: string; name: string; todayDone: boolean; todayFrozen: boolean }>;
    }>(`/api/habits?today=${toLocalDateKey()}`);
    const habit = habits?.find((h) => h.id === habitId);
    if (!habit) return; // habit deleted since the widget rendered — just open the tab
    const done = !(habit.todayDone || habit.todayFrozen);
    await apiPost(`/api/habits/${habitId}/log`, { date: toLocalDateKey(), done });
    haptic(done ? "success" : "light");
    toast.success(
      translateKey(lang, done ? "widgets.s.habitDone" : "widgets.s.habitUndone", { name: habit.name })
    );
    void queryClient.invalidateQueries({ queryKey: ["habits"] });
  } catch {
    toast.error(translateKey(lang, "state.errorGeneric"));
  }
}

/* ── quick actions (active-session widget buttons) ───────────────────── */

/**
 * Log one set of the given exercise (or the current one) without opening
 * the gym screen — used by the active-session widget's «سجّل مجموعة».
 * Values: the exercise's own last set today, else its last performance,
 * else the prescription reps with no weight.
 */
async function quickLogSet(exerciseId?: string): Promise<void> {
  const lang = useAppStore.getState().lang;
  try {
    const roster = await apiGet<{
      active: { id: string; name: string | null } | null;
    }>("/api/gym/workouts");
    const active = roster.active;
    if (!active) return; // session finished meanwhile — nothing to do

    const detail = await apiGet<{
      sets: Array<{ exerciseId: string; reps: number; weightKg: number; setType: string }>;
      templateExercises: Array<{
        exerciseId: string;
        targetReps: number;
        targetSets: number;
        exercise: { nameAr: string; nameEn: string } | null;
      }>;
      deferredIds?: string[];
      lastPerformance: Record<string, { reps: number; weightKg: number } | null>;
    }>(`/api/gym/workouts/${active.id}`);

    const deferred = new Set(detail.deferredIds ?? []);
    const workSets = detail.sets.filter((s) => s.setType === "work");
    const doneCount = (eid: string) => workSets.filter((s) => s.exerciseId === eid).length;
    // the tapped exercise if valid+unfinished, else the current one, else the first
    const byId = exerciseId
      ? detail.templateExercises.find((te) => te.exerciseId === exerciseId)
      : null;
    const chosen =
      (byId && !deferred.has(byId.exerciseId) && doneCount(byId.exerciseId) < byId.targetSets
        ? byId
        : null) ??
      detail.templateExercises.find(
        (te) => !deferred.has(te.exerciseId) && doneCount(te.exerciseId) < te.targetSets
      ) ??
      null;
    if (!chosen) return;

    const own = workSets.filter((s) => s.exerciseId === chosen.exerciseId).slice(-1)[0];
    const last = detail.lastPerformance?.[chosen.exerciseId] ?? null;
    const reps = own?.reps ?? last?.reps ?? chosen.targetReps ?? 8;
    const weightKg = own?.weightKg ?? last?.weightKg ?? 0;

    await apiPost(`/api/gym/workouts/${active.id}/sets`, {
      exerciseId: chosen.exerciseId,
      reps,
      weightKg,
      setType: "work",
    });
    haptic("success");
    void queryClient.invalidateQueries({ queryKey: ["gym"] });
  } catch {
    toast.error(translateKey(lang, "state.errorGeneric"));
  }
}

/** Defer the given (or current) exercise to the template's next session. */
async function quickNextExercise(exerciseId?: string): Promise<void> {
  const lang = useAppStore.getState().lang;
  try {
    const roster = await apiGet<{
      active: { id: string; templateId: string | null } | null;
    }>("/api/gym/workouts");
    const active = roster.active;
    if (!active) return;
    if (exerciseId) {
      await apiPatch(`/api/gym/workouts/${active.id}`, { deferExercise: exerciseId });
    } else {
      const detail = await apiGet<{
        sets: Array<{ exerciseId: string; setType: string }>;
        templateExercises: Array<{ exerciseId: string; targetSets: number }>;
        deferredIds?: string[];
      }>(`/api/gym/workouts/${active.id}`);
      const deferred = new Set(detail.deferredIds ?? []);
      const workSets = detail.sets.filter((s) => s.setType === "work");
      const current = detail.templateExercises.find(
        (te) =>
          !deferred.has(te.exerciseId) &&
          workSets.filter((s) => s.exerciseId === te.exerciseId).length < te.targetSets
      );
      if (!current) return;
      await apiPatch(`/api/gym/workouts/${active.id}`, {
        deferExercise: current.exerciseId,
      });
    }
    haptic("light");
    void queryClient.invalidateQueries({ queryKey: ["gym"] });
  } catch {
    toast.error(translateKey(lang, "state.errorGeneric"));
  }
}

/* ── quick captures (the native dialog typed over the home screen) ──── */

/** Commit one live capture (app process alive → created via the app's own
 *  routes), ack it on the native queue and refresh every widget. */
async function handleLiveCapture(data: QuickCaptureData): Promise<void> {
  if (!data?.id) return;
  const entry: QuickCapture = {
    id: data.id,
    type: data.type === "note" ? "note" : data.type === "water" ? "water" : "habit",
    title: typeof data.title === "string" ? data.title : "",
    drink: typeof data.drink === "string" ? data.drink : undefined,
  };
  const res = await processCaptures([entry]);
  if (res.created > 0) {
    haptic("success");
    void queryClient.invalidateQueries({ queryKey: [entry.type === "note" ? "notes" : "habits"] });
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    if (entry.type === "water") {
      void queryClient.invalidateQueries({ queryKey: ["nutrition-water"] });
      void queryClient.invalidateQueries({ queryKey: ["nutrition-summary"] });
    }
  }
  if (res.acked.includes(data.id)) {
    try {
      await AstnumWidgets.captureAck({ ids: [data.id] });
    } catch {
      // leftover → consumed (and deduped via the ledger) on the next boot
    }
  }
  await pushWidgetSnapshot();
}

/** Boot/foreground belt-and-braces: commit anything a previous pass queued
 *  but never confirmed (dialog timeout, killed process, frozen WebView…).
 *  The ledger makes re-runs idempotent. */
async function consumeBootCaptures(): Promise<void> {
  try {
    const res = await AstnumWidgets.consumeCaptures();
    const entries = parseCaptureJson(res?.entries);
    if (entries.length === 0) return;
    const result = await processCaptures(entries);
    if (result.acked.length > 0) {
      try {
        await AstnumWidgets.captureAck({ ids: result.acked });
      } catch {
        // retried next launch — the ledger dedupes
      }
      await pushWidgetSnapshot();
    }
  } catch {
    /* native call missing on this platform — nothing to do */
  }
}

/** Dispatch one native quick action (event or cold-start deep link). */
export function performQuickAction(action: "logSet" | "nextExercise", exerciseId?: string): void {
  const p = action === "logSet" ? quickLogSet(exerciseId) : quickNextExercise(exerciseId);
  void p.then(() => pushWidgetSnapshot());
}

/* ── deep links (astnum://open?tab=…&sub=…&toggle=…&start=…&quicklog=…) ── */

/**
 * Duplicate-tap guard with a SLIDING window. The v1.19 bug: identical URLs
 * were deduped FOREVER, so the second tap of a habit-toggle / quick-action
 * button (always the same URL) silently did nothing. Now an identical link
 * is swallowed only when re-delivered within 2s (genuine double-delivery
 * / accidental double-tap protection) — repeat actions keep working.
 */
const handledLinks = new Map<string, number>();

function isDuplicateLink(rawUrl: string): boolean {
  const now = Date.now();
  if (now - (handledLinks.get(rawUrl) ?? 0) < 2000) return true;
  handledLinks.set(rawUrl, now);
  if (handledLinks.size > 48) {
    for (const [k, ts] of handledLinks) if (now - ts > 2000) handledLinks.delete(k);
  }
  return false;
}

/** Route one astnum:// URL into the app (tab / sub-tab / actions). */
export function handleWidgetDeepLink(rawUrl: string | null | undefined): void {
  if (!rawUrl) return;
  if (isDuplicateLink(rawUrl)) return; // re-delivered intent / double-tap

  let params: URLSearchParams;
  try {
    params = new URL(rawUrl).searchParams;
  } catch {
    return;
  }

  haptic("light");
  const tab = params.get("tab") ?? "today";
  const toggle = params.get("toggle");
  const start = params.get("start");
  const sub = params.get("sub");
  const quicklog = params.get("quicklog");
  const quicknext = params.get("quicknext");
  const add = params.get("add");
  const pickpin = params.get("pickpin");
  const habitId = params.get("habit");
  const noteId = params.get("note");
  const cal = params.get("cal");

  // «عنصر مثبّت» config request (placeholder tap / sliders glyph) — the
  // picker opens scoped to this widget id regardless of the active tab
  if (pickpin != null) {
    const wid = Number(pickpin);
    useAppStore.getState().openPinPicker(Number.isFinite(wid) ? wid : 0);
    useAppStore.getState().setActiveTab("today");
    return;
  }

  // «التقويم» widget day tap — the calendar sheet opens focused on that
  // day (month grid + its tasks/sessions/habits + «add a task for it»)
  if (cal != null) {
    useAppStore.getState().openCalendarSheet(cal);
    useAppStore.getState().setActiveTab("today");
    return;
  }

  switch (tab) {
    case "habits":
      if (habitId) {
        // a pinned habit card → open that habit's detail
        useAppStore.getState().openHabitDetail(habitId);
      } else if (add != null) {
        // quick-capture widget → land on a fresh editor, keyboard ready
        useAppStore.getState().openHabitsWithAdd();
      } else {
        useAppStore.getState().setActiveTab("habits");
        if (toggle) void toggleHabitFromWidget(toggle);
      }
      break;
    case "gym":
      if (start) useAppStore.getState().openGymWithTemplate(start);
      else useAppStore.getState().openGym();
      // cold-start fallback of the widget quick buttons (process was dead):
      // run the action after the screens' queries had a beat to hydrate
      if (quicklog != null || quicknext != null) {
        window.setTimeout(() => {
          if (quicklog != null) performQuickAction("logSet", quicklog || undefined);
          if (quicknext != null) performQuickAction("nextExercise", quicknext || undefined);
        }, 1800);
      }
      break;
    case "notes":
      if (noteId) {
        // a pinned note card → open that note in the editor
        useAppStore.getState().openNoteEditor(noteId);
      } else if (add != null) {
        // quick-capture widget → land on a fresh capture sheet, keyboard ready
        useAppStore
          .getState()
          .openNotesWithCompose(add === "task" ? "task" : "note");
      } else {
        useAppStore.getState().openNotesWithSegment(sub === "tasks" ? "tasks" : "notes");
      }
      break;
    case "body":
      useAppStore
        .getState()
        .openBodyWithSub(sub === "food" ? "food" : sub === "muscles" ? "muscles" : "measurements");
      break;
    default:
      useAppStore.getState().setActiveTab("today");
      break;
  }
}

let deepLinksInited = false;

/** Wire the deep-link + quick-action listeners (idempotent — call on mount). */
export function initWidgetDeepLinks(): void {
  if (deepLinksInited) return;
  deepLinksInited = true;
  if (!isNativeApp) return;

  // cold start: activity launched FROM a widget tap carries the URL on its intent
  void AstnumWidgets.getLaunchUrl().then((res) => handleWidgetDeepLink(res.url));

  // warm start: app alive in background → bridge forwards onNewIntent
  void AstnumWidgets.addListener("deepLink", (data) => handleWidgetDeepLink(data.url));

  // live quick actions from the active-session widget buttons
  void AstnumWidgets.addListener("quickAction", (data) => {
    performQuickAction(data.action, data.exerciseId || undefined);
  });

  // live quick captures from the native quick-add dialog (v1.22)
  void AstnumWidgets.addListener("quickCapture", (data) => {
    void handleLiveCapture(data);
  });

  // leftover queued captures (dialog timeouts, killed passes) — idempotent
  void consumeBootCaptures();
}
