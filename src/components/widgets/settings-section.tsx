"use client";

/**
 * Settings → Home-screen widgets (APK only — hidden on the web build).
 * The 17 ASTNUM widgets grouped by module, each with its own
 * "add to home screen" button using Android's requestPinAppWidget flow
 * (API 26+; launchers without support get an honest manual-path toast).
 * The «عنصر مثبّت» kind additionally lists every PLACED instance (via the
 * plugin's getWidgetIds) with its own "اختيار العنصر" button that opens
 * the pin picker scoped to that widget id.
 */

import React, { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import {
  Beef,
  Calendar,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Droplets,
  Flame,
  GlassWater,
  ListTodo,
  Percent,
  Pin,
  Plus,
  Repeat,
  SquareCheck,
  StickyNote,
  Thermometer,
  Timer,
  UtensilsCrossed,
  Wheat,
  Zap,
} from "lucide-react";
import {
  isNativeApp,
  requestPinWidget,
  getPlacedWidgetIds,
  type WidgetKind,
} from "@/lib/widgets/bridge";
import { useAppStore } from "@/lib/store/app-store";

interface KindMeta {
  id: WidgetKind;
  icon: React.ElementType;
  nameKey: string;
  descKey: string;
}

const GROUPS: Array<{ labelKey: string; kinds: KindMeta[] }> = [
  {
    labelKey: "widgets.group.tools",
    kinds: [
      { id: "quickAdd", icon: Zap, nameKey: "widgets.kind.quickAdd", descKey: "widgets.kind.quickAddDesc" },
      { id: "drinks", icon: GlassWater, nameKey: "widgets.kind.drinks", descKey: "widgets.kind.drinksDesc" },
      { id: "pin", icon: Pin, nameKey: "widgets.kind.pin", descKey: "widgets.kind.pinDesc" },
      { id: "events", icon: CalendarClock, nameKey: "widgets.kind.events", descKey: "widgets.kind.eventsDesc" },
      { id: "calendar", icon: Calendar, nameKey: "widgets.kind.calendar", descKey: "widgets.kind.calendarDesc" },
    ],
  },
  {
    labelKey: "widgets.group.nutrition",
    kinds: [
      { id: "calories", icon: Flame, nameKey: "widgets.kind.calories", descKey: "widgets.kind.caloriesDesc" },
      { id: "water", icon: GlassWater, nameKey: "widgets.kind.water", descKey: "widgets.kind.waterDesc" },
      { id: "carb", icon: Wheat, nameKey: "widgets.kind.carb", descKey: "widgets.kind.carbDesc" },
      { id: "protein", icon: Beef, nameKey: "widgets.kind.protein", descKey: "widgets.kind.proteinDesc" },
      { id: "fat", icon: Droplets, nameKey: "widgets.kind.fat", descKey: "widgets.kind.fatDesc" },
      { id: "meals", icon: UtensilsCrossed, nameKey: "widgets.kind.meals", descKey: "widgets.kind.mealsDesc" },
    ],
  },
  {
    labelKey: "widgets.group.tasks",
    kinds: [
      { id: "tasks", icon: ListTodo, nameKey: "widgets.kind.tasks", descKey: "widgets.kind.tasksDesc" },
      { id: "taskFlip", icon: SquareCheck, nameKey: "widgets.kind.taskFlip", descKey: "widgets.kind.taskFlipDesc" },
    ],
  },
  {
    labelKey: "widgets.group.habits",
    kinds: [
      { id: "habits", icon: Flame, nameKey: "widgets.kind.habits", descKey: "widgets.kind.habitsDesc" },
      { id: "habitFlip", icon: Repeat, nameKey: "widgets.kind.habitFlip", descKey: "widgets.kind.habitFlipDesc" },
    ],
  },
  {
    labelKey: "widgets.group.gym",
    kinds: [
      { id: "muscles", icon: Thermometer, nameKey: "widgets.kind.muscles", descKey: "widgets.kind.musclesDesc" },
      { id: "sessions", icon: CalendarDays, nameKey: "widgets.kind.sessions", descKey: "widgets.kind.sessionsDesc" },
      { id: "active", icon: Timer, nameKey: "widgets.kind.active", descKey: "widgets.kind.activeDesc" },
    ],
  },
  {
    labelKey: "widgets.group.ratios",
    kinds: [
      { id: "percent", icon: Percent, nameKey: "widgets.kind.percent", descKey: "widgets.kind.percentDesc" },
    ],
  },
];

const ALL_KINDS: KindMeta[] = GROUPS.flatMap((g) => g.kinds);

/* ── placed «عنصر مثبّت» instances (configure each one) ──────────────── */

function PlacedPinWidgets() {
  const { t } = useI18n();
  const openPinPicker = useAppStore((s) => s.openPinPicker);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const [ids, setIds] = useState<number[] | null>(null);

  useEffect(() => {
    let alive = true;
    void getPlacedWidgetIds("pin").then((list) => {
      if (alive) setIds(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openPicker = (id: number) => {
    haptic("light");
    setSettingsOpen(false);
    openPinPicker(id);
  };

  return (
    <div className="border-t border-border/40 bg-muted/30 px-4 py-3">
      <p className="mb-2 text-[11px] font-bold text-muted-foreground">
        {t("widgets.pin.placed")}
      </p>
      {ids === null ? (
        <p className="text-xs text-muted-foreground/70">…</p>
      ) : ids.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("widgets.pin.placedEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ids.map((id) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Pin className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-xs font-bold">
                {t("widgets.pin.widgetLabel")} #{id}
              </span>
              <button
                type="button"
                onClick={() => openPicker(id)}
                className="flex min-h-9 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20 active:scale-95"
              >
                <StickyNote className="h-3.5 w-3.5" aria-hidden />
                {t("widgets.pin.configure")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── the section ────────────────────────────────────────────────────── */

export default function WidgetsSettingsSection() {
  const { t } = useI18n();
  const [pending, setPending] = useState<WidgetKind | null>(null);

  if (!isNativeApp) return null; // web build: widgets don't exist there

  const add = async (kind: WidgetKind) => {
    haptic("medium");
    setPending(kind);
    const res = await requestPinWidget(kind);
    setPending(null);
    if (!res.supported) {
      toast.info(t("widgets.pinUnsupported"));
      return;
    }
    if (res.ok) toast.success(t("widgets.pinned"));
  };

  return (
    <section aria-label={t("widgets.section")}>
      <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden />
        {t("widgets.section")}
      </h3>
      <div className="mb-4 overflow-hidden rounded-2xl border border-border/70 bg-card card-hi">
        <p className="border-b border-border/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {t("widgets.hint")}
        </p>
        {GROUPS.map((group) => (
          <React.Fragment key={group.labelKey}>
            <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-bold text-muted-foreground">
              {t(group.labelKey)}
            </p>
            {group.kinds.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 border-b border-border/40 px-4 py-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <k.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t(k.nameKey)}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{t(k.descKey)}</span>
                </span>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void add(k.id)}
                  aria-label={`${t("widgets.add")} — ${t(k.nameKey)}`}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {pending === k.id ? "…" : t("widgets.add")}
                </button>
              </div>
            ))}
          </React.Fragment>
        ))}
        <PlacedPinWidgets />
        <p className="border-t border-border/40 bg-muted/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {t("widgets.addManual")}
        </p>
      </div>
    </section>
  );
}

export { ALL_KINDS };
