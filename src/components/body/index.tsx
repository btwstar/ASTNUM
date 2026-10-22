"use client";

/**
 * جسمي / My Body .
 * Body tab screen with 3 sub-tabs: عضلات (muscle map) | قياسات (measurements) | أكل (nutrition).
 * FAB contract: listens to "astnum:fab" and routes by the active sub-tab.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useAppStore } from "@/lib/store/app-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Ruler, UtensilsCrossed } from "lucide-react";

// Agent 2-e owns this module — NAMED export contract. Stub exists meanwhile.
import { MuscleMapScreen } from "@/components/muscle-map";
import { MeasurementsScreen } from "@/components/body/measurements";
import { NutritionScreen } from "@/components/nutrition";

type BodySubTab = "muscles" | "measurements" | "food";

export default function BodyScreen() {
  const { t } = useI18n();
  // Deep-link intent (home-screen widget taps): open directly on the wanted
  // sub-tab — consumed ONCE, same discipline as notesSegmentIntent.
  const [subTab, setSubTab] = useState<BodySubTab>(
    () => (useAppStore.getState().bodySubTabIntent ?? "measurements") as BodySubTab
  );
  const [measureSignal, setMeasureSignal] = useState(0);
  const [foodSignal, setFoodSignal] = useState(0);

  useEffect(() => {
    useAppStore.setState({ bodySubTabIntent: null });
  }, []);

  // v1.22: ALSO react to deep-link intents while already on this tab (e.g. a
  // meals-widget tap while the Body screen is open). The external-subscribe
  // + clear-inside-callback pattern mirrors the habits/notes intent
  // discipline — set-state happens in the store callback, not the effect.
  useEffect(() => {
    const unsub = useAppStore.subscribe((s) => {
      const intent = s.bodySubTabIntent;
      if (intent === "muscles" || intent === "measurements" || intent === "food") {
        useAppStore.setState({ bodySubTabIntent: null });
        setSubTab(intent);
      }
    });
    return unsub;
  }, []);

  const openMeasureSheet = useCallback(() => setMeasureSignal((n) => n + 1), []);
  const openQuickAdd = useCallback(() => setFoodSignal((n) => n + 1), []);

  // Contextual FAB contract: window event "astnum:fab" with detail.tab.
  // v1.13: the muscles sub-tab listens for the same event itself (like
  // habits/notes/gym) and opens its focus-muscle suggestion — so the
  // muscles branch here only ensures the sub-tab is active.
  useEffect(() => {
    const onFab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      const tab = detail?.tab;
      if (tab === "body-measure") {
        setSubTab("measurements");
        openMeasureSheet();
      } else if (tab === "body-food") {
        setSubTab("food");
        openQuickAdd();
      } else if (tab === "body-muscles") {
        setSubTab("muscles");
      } else if (tab === "body") {
        if (subTab === "measurements") openMeasureSheet();
        else if (subTab === "food") openQuickAdd();
        // muscles sub-tab → MuscleMapScreen's own listener handles it.
      }
    };
    window.addEventListener("astnum:fab", onFab);
    return () => window.removeEventListener("astnum:fab", onFab);
  }, [openMeasureSheet, openQuickAdd, subTab]);

  const handleTabChange = (value: string) => {
    haptic("light");
    setSubTab(value as BodySubTab);
  };

  return (
    <div className="pt-3">
      <Tabs value={subTab} onValueChange={handleTabChange} className="gap-3">
        <TabsList
          aria-label={t("body.title")}
          className="mx-auto h-11 w-full max-w-sm rounded-full bg-muted/70 p-1"
        >
          <TabsTrigger value="muscles" className="rounded-full text-xs sm:text-sm">
            <Activity className="h-4 w-4" aria-hidden />
            {t("body.tab.muscles")}
          </TabsTrigger>
          <TabsTrigger value="measurements" className="rounded-full text-xs sm:text-sm">
            <Ruler className="h-4 w-4" aria-hidden />
            {t("body.tab.measurements")}
          </TabsTrigger>
          <TabsTrigger value="food" className="rounded-full text-xs sm:text-sm">
            <UtensilsCrossed className="h-4 w-4" aria-hidden />
            {t("body.tab.food")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="muscles" className="outline-none">
          <MuscleMapScreen />
        </TabsContent>
        <TabsContent value="measurements" className="outline-none">
          <MeasurementsScreen openSignal={measureSignal} />
        </TabsContent>
        <TabsContent value="food" className="outline-none">
          <NutritionScreen openSignal={foodSignal} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
