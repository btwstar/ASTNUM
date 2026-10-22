"use client";

/**
 * PinPickerSheet — the «عنصر مثبّت» widget configurator. Opens when the user
 * taps an unconfigured pinned-item widget on the home screen (deep link
 * ?pickpin=<appWidgetId> → app-store openPinPicker) or presses "اختيار
 * العنصر" on a placed one in the widgets settings section.
 *
 * One sheet, three tabs (habit / session / note): picks ONE item for THAT
 * widget instance, saves it into the settings DB (widget_pins:
 * {"<appWidgetId>": {type,id}}) and pushes the fresh snapshot so the widget
 * re-renders instantly. Includes a "clear" action that returns the widget
 * to its tap-to-choose placeholder.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Dumbbell, Repeat, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n, useFormat } from "@/lib/i18n";
import { translateKey } from "@/lib/i18n";
import { apiGet, apiPost } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useAppStore } from "@/lib/store/app-store";
import { pushWidgetSnapshot } from "@/lib/widgets/bridge";
import { templateDisplayName } from "@/components/gym/shared";

/* ── API row subsets (only what this sheet reads) ───────────────────── */

interface HabitRow {
  id: string;
  name: string;
  archived: boolean;
  streaks: { current: number };
}

interface TemplateRow {
  id: string;
  name: string | null;
  days: number[];
  exercises: Array<{ targetSets: number }>;
}

interface NoteRow {
  id: string;
  title: string;
  body?: string;
  updatedAt: string;
  pinned?: boolean;
}

interface PinConfig {
  type: "habit" | "session" | "note";
  id: string;
}

type PinType = PinConfig["type"];

/* ── the configs map (settings DB) ──────────────────────────────────── */

async function readPinConfigs(): Promise<Record<string, PinConfig>> {
  const settings = await apiGet<Record<string, string>>("/api/settings").catch(
    () => ({}) as Record<string, string>
  );
  const raw = settings?.["widget_pins"];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, PinConfig>;
    const out: Record<string, PinConfig> = {};
    for (const [wid, cfg] of Object.entries(parsed)) {
      if (!cfg || typeof cfg !== "object") continue;
      if (cfg.type !== "habit" && cfg.type !== "session" && cfg.type !== "note") continue;
      if (typeof cfg.id !== "string" || !cfg.id) continue;
      out[wid] = { type: cfg.type, id: cfg.id };
    }
    return out;
  } catch {
    return {};
  }
}

/** Save ONE widget's config (or remove it when config is null). */
async function writePinConfig(
  widgetId: number,
  config: PinConfig | null
): Promise<void> {
  const map = await readPinConfigs();
  const key = String(widgetId);
  if (config) map[key] = config;
  else delete map[key];
  await apiPost("/api/settings", {
    entries: { widget_pins: JSON.stringify(map) },
  });
}

/* ── the sheet ──────────────────────────────────────────────────────── */

const TABS: Array<{ id: PinType; icon: React.ElementType; labelKey: string }> = [
  { id: "habit", icon: Repeat, labelKey: "widgets.pin.tabHabit" },
  { id: "session", icon: Dumbbell, labelKey: "widgets.pin.tabSession" },
  { id: "note", icon: StickyNote, labelKey: "widgets.pin.tabNote" },
];

export default function PinPickerSheet() {
  const { t, lang } = useI18n();
  const fmt = useFormat();

  const widgetId = useAppStore((s) => s.pinPickerWidgetId);
  const setPinPickerWidgetId = useAppStore((s) => s.setPinPickerWidgetId);
  const open = widgetId !== null;

  // current config for this widget (preselects the tab + marks the item)
  const configQuery = useQuery({
    queryKey: ["widget-pin-configs"],
    queryFn: readPinConfigs,
    enabled: open,
    staleTime: 0,
  });
  const current: PinConfig | null =
    widgetId !== null ? (configQuery.data?.[String(widgetId)] ?? null) : null;

  const [tabOverride, setTabOverride] = useState<PinType | null>(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // active tab: the widget's CURRENT config type until the user touches the
  // segments, then their choice (derived — no state sync on config resolve)
  const tab: PinType = tabOverride ?? current?.type ?? "habit";

  // reset the pick state on every open: subscription covers warm re-opens
  // (another widget tapped while closed), the mount microtask covers the
  // open that fired before this component rendered (cold deep link).
  useEffect(() => {
    const reset = () => {
      if (useAppStore.getState().pinPickerWidgetId === null) return;
      setTabOverride(null);
      setNoteSearch("");
      setBusy(false);
    };
    const unsub = useAppStore.subscribe(reset);
    const t = window.setTimeout(reset, 0);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  /* lists — only fetched for the visible tab */
  const habitsQuery = useQuery({
    queryKey: ["habits", "list", fmt.todayKey()],
    queryFn: () =>
      apiGet<{ habits: HabitRow[] }>(`/api/habits?today=${fmt.todayKey()}`),
    enabled: open && tab === "habit",
  });
  const templatesQuery = useQuery({
    queryKey: ["gym", "templates"],
    queryFn: () => apiGet<{ templates: TemplateRow[] }>("/api/gym/templates"),
    enabled: open && tab === "session",
  });
  const notesQuery = useQuery({
    queryKey: ["notes", "pin-picker"],
    queryFn: () => apiGet<NoteRow[]>("/api/notes?filter=active"),
    enabled: open && tab === "note",
  });

  const habits = useMemo(
    () => (habitsQuery.data?.habits ?? []).filter((h) => !h.archived),
    [habitsQuery.data]
  );
  const templates = useMemo(() => templatesQuery.data?.templates ?? [], [templatesQuery.data]);
  const notes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    const list = notesQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (n) =>
        (n.title ?? "").toLowerCase().includes(q) ||
        (n.body ?? "").toLowerCase().includes(q)
    );
  }, [notesQuery.data, noteSearch]);

  const close = () => setPinPickerWidgetId(null);

  const pick = async (config: PinConfig, titleForToast: string) => {
    if (widgetId === null || busy) return;
    setBusy(true);
    try {
      await writePinConfig(widgetId, config);
      // instant widget refresh (the settings POST already queued a sync)
      void pushWidgetSnapshot();
      haptic("success");
      toast.success(t("widgets.pin.savedToast", { title: titleForToast }));
      close();
    } catch {
      toast.error(t("state.errorGeneric"));
      setBusy(false);
    }
  };

  const clear = async () => {
    if (widgetId === null || busy || !current) return;
    setBusy(true);
    try {
      await writePinConfig(widgetId, null);
      void pushWidgetSnapshot();
      haptic("light");
      toast.info(t("widgets.pin.cleared"));
      close();
    } catch {
      toast.error(t("state.errorGeneric"));
      setBusy(false);
    }
  };

  /* per-row meta lines (formatted exactly like the widget itself) */
  const habitMeta = (h: HabitRow) =>
    translateKey(lang, "widgets.s.pinStreak", {
      count: h.streaks?.current ?? 0,
      n: fmt.number(h.streaks?.current ?? 0),
    });
  const sessionMeta = (tpl: TemplateRow) => {
    const sets = tpl.exercises.reduce((s, e) => s + e.targetSets, 0);
    return `${translateKey(lang, "widgets.s.exercises", {
      count: tpl.exercises.length,
      n: fmt.number(tpl.exercises.length),
    })} • ${translateKey(lang, "widgets.s.sets", { count: sets, n: fmt.number(sets) })}`;
  };

  const isCurrent = (type: PinType, id: string) =>
    current?.type === type && current?.id === id;

  const loading =
    (tab === "habit" && habitsQuery.isLoading) ||
    (tab === "session" && templatesQuery.isLoading) ||
    (tab === "note" && notesQuery.isLoading);

  const emptyKey =
    tab === "habit"
      ? "widgets.pin.noHabits"
      : tab === "session"
        ? "widgets.pin.noSessions"
        : "widgets.pin.noNotes";

  const rowClass =
    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-muted/60 active:bg-muted";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[82dvh] w-full max-w-lg flex-col gap-0 rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="border-b border-border/40 px-4 pt-4 pb-3 text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            {t("widgets.pin.pickerTitle")}
            {widgetId !== null && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                #{fmt.number(widgetId)}
              </span>
            )}
          </SheetTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("widgets.pin.pickerHint")}
          </p>
        </SheetHeader>

        {/* type segments */}
        <div className="px-4 pt-3">
          <div role="tablist" aria-label={t("widgets.pin.pickerTitle")} className="flex gap-1 rounded-full bg-muted p-1">
            {TABS.map((tabDef) => {
              const active = tab === tabDef.id;
              const TabIcon = tabDef.icon;
              return (
                <button
                  key={tabDef.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={busy}
                  onClick={() => {
                    haptic("light");
                    setTabOverride(tabDef.id);
                  }}
                  className={cn(
                    "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-bold transition-all",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  <TabIcon className="h-3.5 w-3.5" aria-hidden />
                  {t(tabDef.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {tab === "note" && (
            <div className="relative mb-2 px-1">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                placeholder={t("widgets.pin.searchNotes")}
                aria-label={t("widgets.pin.searchNotes")}
                className="h-10 w-full rounded-xl border border-border bg-background ps-9 pe-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
              />
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-2 px-1">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : tab === "habit" && habits.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t(emptyKey)}
            </p>
          ) : tab === "session" && templates.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t(emptyKey)}
            </p>
          ) : tab === "note" && notes.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t(emptyKey)}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {tab === "habit" &&
                habits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void pick({ type: "habit", id: h.id }, h.name)}
                    className={cn(rowClass, isCurrent("habit", h.id) && "bg-primary/10")}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Repeat className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{h.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {habitMeta(h)}
                      </span>
                    </span>
                    {isCurrent("habit", h.id) && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
              {tab === "session" &&
                templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void pick(
                        { type: "session", id: tpl.id },
                        templateDisplayName(tpl.name, lang) || t("gym.templates.new")
                      )
                    }
                    className={cn(rowClass, isCurrent("session", tpl.id) && "bg-primary/10")}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Dumbbell className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {templateDisplayName(tpl.name, lang) || t("gym.templates.new")}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sessionMeta(tpl)}
                      </span>
                    </span>
                    {isCurrent("session", tpl.id) && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
              {tab === "note" &&
                notes.slice(0, 50).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void pick({ type: "note", id: n.id }, n.title || t("notes.untitled"))
                    }
                    className={cn(rowClass, isCurrent("note", n.id) && "bg-primary/10")}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <StickyNote className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {n.title || t("notes.untitled")}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t("widgets.s.pinNoteUpdated", {
                          date: fmt.date(new Date(n.updatedAt), { day: "numeric", month: "short" }),
                        })}
                      </span>
                    </span>
                    {isCurrent("note", n.id) && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* footer: clear the currently pinned item */}
        {current && (
          <div className="border-t border-border/40 px-4 py-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void clear()}
              className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground active:scale-[0.99] disabled:opacity-50"
            >
              {t("widgets.pin.clear")}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
