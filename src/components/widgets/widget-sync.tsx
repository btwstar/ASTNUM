"use client";

/**
 * WidgetSync — invisible app-shell component wiring the home-screen widgets:
 *
 *   1. deep links  — cold-start launch URL + warm "deepLink" events
 *                    (astnum://open?tab=…&toggle=…&start=…)
 *   2. data pushes — after mount (once screens settle), on window focus /
 *                    visibilitychange (Android pause/resume), and when the
 *                    language or weight unit changes (every widget string
 *                    is pre-formatted, so both must re-push).
 *
 * Renders nothing. Everything is best-effort — a failing push is silent
 * (the next trigger re-syncs).
 */

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/app-store";
import { initWidgetDeepLinks, pushWidgetSnapshot } from "@/lib/widgets/bridge";

export default function WidgetSync() {
  useEffect(() => {
    initWidgetDeepLinks();

    // first push: give the screens' initial queries a beat to settle so the
    // widget payload reflects the freshly-hydrated store language/units
    const t = window.setTimeout(() => void pushWidgetSnapshot(), 1500);

    const onFocus = () => void pushWidgetSnapshot();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // labels are formatted with the live language + weight unit — re-push on change
  const lang = useAppStore((s) => s.lang);
  const weightUnit = useAppStore((s) => s.weightUnit);
  useEffect(() => {
    const t = window.setTimeout(() => void pushWidgetSnapshot(), 400);
    return () => window.clearTimeout(t);
  }, [lang, weightUnit]);

  return null;
}
