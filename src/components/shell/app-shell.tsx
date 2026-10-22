"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAppStore, emitFabPress, type MainTab } from "@/lib/store/app-store";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiGet } from "@/lib/api";
import { AstnumLogo, AstnumWordmark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChartNoAxesCombined,
  Flame,
  NotebookPen,
  PersonStanding,
  LayoutDashboard,
  Plus,
  Settings2,
  Dumbbell,
  UtensilsCrossed,
  SquareCheckBig,
} from "lucide-react";

const Onboarding = dynamic(() => import("@/components/onboarding"));
const TodayScreen = dynamic(() => import("@/components/today"), { ssr: false, loading: () => <ScreenSkeleton /> });
const HabitsScreen = dynamic(() => import("@/components/habits"), { ssr: false, loading: () => <ScreenSkeleton /> });
const NotesScreen = dynamic(() => import("@/components/notes"), { ssr: false, loading: () => <ScreenSkeleton /> });
const BodyScreen = dynamic(() => import("@/components/body"), { ssr: false, loading: () => <ScreenSkeleton /> });
const GymScreen = dynamic(() => import("@/components/gym"), { ssr: false, loading: () => <ScreenSkeleton /> });
const AnalystOverlay = dynamic(() => import("@/components/analyst"), { ssr: false });
const SettingsSheet = dynamic(() => import("@/components/settings"), { ssr: false });
const WidgetSync = dynamic(() => import("@/components/widgets/widget-sync"), { ssr: false });
const PinPickerSheet = dynamic(() => import("@/components/widgets/pin-picker"), { ssr: false });
const CalendarSheet = dynamic(() => import("@/components/calendar/calendar-sheet"), { ssr: false });

function ScreenSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4" aria-busy="true" aria-label="loading">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
    </div>
  );
}

const TABS: Array<{ id: MainTab; icon: React.ElementType; labelKey: string }> = [
  { id: "today", icon: LayoutDashboard, labelKey: "nav.today" },
  { id: "habits", icon: Flame, labelKey: "nav.habits" },
  { id: "gym", icon: Dumbbell, labelKey: "nav.gym" },
  { id: "notes", icon: NotebookPen, labelKey: "nav.notes" },
  { id: "body", icon: PersonStanding, labelKey: "nav.body" },
];

function BottomNav() {
  const { t } = useI18n();
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  // Live "active session" badge — shares the exact cache entry (key + URL)
  // with the gym screen, so this dedupes into ONE fetch. `select` keeps the
  // nav from re-rendering on every roster change (only when active flips).
  const hasActiveSession =
    useQuery({
      queryKey: ["gym", "workouts"],
      queryFn: () => apiGet<{ active: unknown; history: unknown[] }>("/api/gym/workouts"),
      staleTime: 60 * 1000,
      select: (d) => d?.active != null,
    }).data === true;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-3 pb-safe">
      <nav
        aria-label={t("app.name")}
        // v1.15 (review finding 2): OPAQUE bar. The frosted-glass bg-card/85 +
        // backdrop-blur let content peek through behind the buttons — action rows
        // at initial scroll looked "tappable but dead" (taps hit the nav strip).
        // An opaque bar is the Material bottom-bar contract: covered content is
        // clearly chrome, and every screen scrolls its last row fully clear
        // (pb-44 + scroll-pb-44 on <main> guarantee the clearance).
        className="pointer-events-auto mb-2 flex items-stretch justify-around overflow-hidden rounded-3xl border border-border bg-card shadow-lg shadow-black/25"
      >
        {TABS.map(({ id, icon: Icon, labelKey }) => {
          const active = activeTab === id;
          const showBadge = id === "gym" && hasActiveSession;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                haptic("light");
                setActiveTab(id);
              }}
              aria-current={active ? "page" : undefined}
              aria-label={
                showBadge ? `${t(labelKey)} — ${t("gym.nav.activeBadge")}` : t(labelKey)
              }
              className="relative flex min-h-11 flex-1 flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
            >
              {active && (
                <motion.span
                  layoutId="nav-indicator"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gradient-accent"
                />
              )}
              <span className="relative">
                <Icon
                  className={`h-5 w-5 transition-all duration-200 ${
                    active ? "scale-110 text-primary" : "text-muted-foreground"
                  }`}
                  aria-hidden
                />
                {showBadge && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gradient-accent ring-1 ring-card"
                  />
                )}
              </span>
              <span
                className={`text-[11px] leading-none transition-colors ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-accent focus-visible:bg-accent"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          accent ? "bg-gradient-accent text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        <Icon className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function Fab() {
  const { t } = useI18n();
  const activeTab = useAppStore((s) => s.activeTab);
  const setAnalystOpen = useAppStore((s) => s.setAnalystOpen);
  const [open, setOpen] = useState(false);

  const handleFab = () => {
    haptic("light");
    if (activeTab === "today") {
      setOpen(true);
      return;
    }
    emitFabPress(activeTab);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 mx-auto w-full max-w-md">
      <div className="pointer-events-none flex justify-end px-5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={handleFab}
              aria-label={t("action.add")}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-accent text-primary-foreground shadow-xl shadow-primary/25 transition-transform duration-150 active:scale-90"
            >
              <motion.span
                key={activeTab}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.18 }}
              >
                <Plus className="h-6 w-6" aria-hidden />
              </motion.span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={12}
            className="w-64 rounded-2xl border-border/80 bg-popover/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-0.5">
              <QuickAction icon={SquareCheckBig} label={t("nav.habits")} onClick={() => { setOpen(false); emitFabPress("habits"); setActiveAndGo("habits"); }} />
              <QuickAction icon={NotebookPen} label={t("nav.notes")} onClick={() => { setOpen(false); emitFabPress("notes"); setActiveAndGo("notes"); }} />
              <QuickAction icon={UtensilsCrossed} label={t("nutrition.title")} onClick={() => { setOpen(false); useAppStore.getState().setActiveTab("body"); setTimeout(() => emitFabPress("body-food"), 80); }} />
              <QuickAction icon={ChartNoAxesCombined} label={t("analyst.title")} onClick={() => { setOpen(false); setAnalystOpen(true); }} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function setActiveAndGo(tab: MainTab) {
  useAppStore.getState().setActiveTab(tab);
}

function Header() {
  const { t } = useI18n();
  const setAnalystOpen = useAppStore((s) => s.setAnalystOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-4">
        <AstnumLogo size={30} glow={false} />
        <AstnumWordmark className="text-lg" />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("analyst.title")}
          onClick={() => setAnalystOpen(true)}
          className="relative h-10 w-10 rounded-xl text-primary hover:bg-primary/10"
        >
          <ChartNoAxesCombined className="h-5 w-5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("action.settings")}
          onClick={() => setSettingsOpen(true)}
          className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-muted"
        >
          <Settings2 className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </header>
  );
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 start-1/4 h-80 w-80 rounded-full bg-grad-from/10 blur-3xl" />
      <div className="absolute bottom-0 end-0 h-72 w-72 rounded-full bg-grad-to/10 blur-3xl" />
    </div>
  );
}

function Screens() {
  const activeTab = useAppStore((s) => s.activeTab);
  const [gymVisited, setGymVisited] = useState(false);

  // v1.12: PRELOAD the four tab chunks while idle. Tab screens render
  // conditionally, so their dynamic chunks otherwise load on FIRST switch —
  // a skeleton flash on habits/notes/body, and (before this fix) the gym tab
  // had NO fallback at all: an EMPTY main over the dark background = the
  // "شاشة سوداء" users saw on the first open of any list. Preloading makes
  // every first visit render instantly; requestIdleCallback keeps the fetch
  // off the critical first-paint path (the WebView supports it; timeout below
  // guarantees the preload still runs if it doesn't).
  useEffect(() => {
    const preload = () => {
      void import("@/components/habits");
      void import("@/components/notes");
      void import("@/components/body");
      void import("@/components/gym");
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(preload, 800);
    return () => window.clearTimeout(t);
  }, []);

  // Latch (render-time, the React-recommended "derived flag" pattern): once
  // the gym tab is visited it stays mounted (hidden via CSS) so the active
  // session, rest countdown and scroll position SURVIVE tab switches — the
  // rest beep still fires while the user is on another tab.
  if (activeTab === "gym" && !gymVisited) {
    setGymVisited(true);
  }

  return (
    <main className="mx-auto w-full max-w-md scroll-pb-44 pb-44">
      {/* v1.12: INSTANT atomic tab swap. The old wait-mode crossfade rendered
          an EMPTY frame between the exiting and entering screens (dark
          background only — the "black screen" flash users saw on phones).
          Plain conditional rendering swaps both in ONE paint: no empty frame,
          no flicker, snappier, and zero transition JS to run. When the gym
          activates, this block unmounts instantly — the gym div below takes
          its place (same normal-flow slot → no double-height flash). */}
      {activeTab !== "gym" && (
        <div>
          {activeTab === "today" && <TodayScreen />}
          {activeTab === "habits" && <HabitsScreen />}
          {activeTab === "notes" && <NotesScreen />}
          {activeTab === "body" && <BodyScreen />}
        </div>
      )}
      {gymVisited && (
        <div className={activeTab !== "gym" ? "hidden" : undefined}>
          <GymScreen />
        </div>
      )}
    </main>
  );
}

function Overlays() {
  return (
    <>
      <AnalystOverlay />
      <SettingsSheet />
    </>
  );
}

export function AppShell() {
  const onboarded = useAppStore((s) => s.onboarded);

  /* dev/E2E hook: exercise widget deep links + the pin picker from the
   * browser (the native bridge doesn't exist there). Never in production. */
  if (process.env.NODE_ENV !== "production") {
    (globalThis as Record<string, unknown>).__astnumDev = {
      openPinPicker: (id: number) => useAppStore.getState().openPinPicker(id),
      openCalendarSheet: (dateKey?: string) => useAppStore.getState().openCalendarSheet(dateKey),
      deepLink: (url: string) => import("@/lib/widgets/bridge").then((m) => m.handleWidgetDeepLink(url)),
      store: () => useAppStore.getState(),
      /** commit a widget-style capture through the app's own routes (E2E) */
      processCaptures: (entries: { id: string; type: "habit" | "note"; title: string }[]) =>
        import("@/lib/widgets/capture").then((m) => m.processCaptures(entries)),
      /** the last widget snapshot the bridge composed */
      snapshot: () => (globalThis as Record<string, unknown>).__astnumWidgetSnapshot,
    };
  }

  if (!onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Ambient />
      <Header />
      <Screens />
      <Fab />
      <BottomNav />
      <Overlays />
      <WidgetSync />
      <PinPickerSheet />
      <CalendarSheet />
    </div>
  );
}
