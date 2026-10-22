"use client";

import React, { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import { useAppStore } from "@/lib/store/app-store";
import { deriveCustomTheme } from "@/lib/theme/custom-color";
import { apiPost } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";

function AccentSync() {
  const accent = useAppStore((s) => s.accent);
  const customColor = useAppStore((s) => s.customColor);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-accent", accent);
    // Custom accent: the full OKLCH palette is derived in JS from the user's
    // hex (per-mode legibility mapping — lib/theme/custom-color) and injected
    // as inline custom properties; globals.css [data-accent="custom"] maps
    // them onto the theme tokens via plain var() substitution.
    // (Written for every accent so switching to "custom" never flashes.)
    const { vars } = deriveCustomTheme(customColor);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }, [accent, customColor]);
  return null;
}

/** Bridges the persisted app-store themeMode to next-themes (class switcher). */
function ThemeSync() {
  const themeMode = useAppStore((s) => s.themeMode);
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(themeMode);
  }, [themeMode, setTheme]);
  return null;
}

function PrefsSync() {
  const lang = useAppStore((s) => s.lang);
  const themeMode = useAppStore((s) => s.themeMode);
  const accent = useAppStore((s) => s.accent);
  const customColor = useAppStore((s) => s.customColor);
  const weightUnit = useAppStore((s) => s.weightUnit);
  const lengthUnit = useAppStore((s) => s.lengthUnit);
  const onboarded = useAppStore((s) => s.onboarded);
  const goal = useAppStore((s) => s.goal);

  // Persist prefs to the local DB (so backups include them) — DEBOUNCED:
  // dragging the custom color field would otherwise fire a POST per frame,
  // and each mutation marks the offline store dirty → snapshot writes.
  // Every dep change cancels the pending POST and reschedules fresh values.
  useEffect(() => {
    const payload = { lang, themeMode, accent, customColor, weightUnit, lengthUnit, onboarded, goal };
    const id = window.setTimeout(() => {
      apiPost("/api/settings", { entries: { app_prefs: JSON.stringify(payload) } }).catch(
        () => undefined
      );
    }, 600);
    return () => window.clearTimeout(id);
  }, [lang, themeMode, accent, customColor, weightUnit, lengthUnit, onboarded, goal]);

  return null;
}

/** App-wide TanStack Query client — module-scope singleton (one instance per
 *  JS context; the browser gets exactly one — same behavior as the previous
 *  lazy useState, but importable by non-React modules like the widget bridge,
 *  which invalidates caches after home-screen-widget deep-link actions). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}>
        <I18nProvider>
          <AccentSync />
          <ThemeSync />
          <PrefsSync />
          {children}
          <Toaster position="top-center" richColors closeButton />
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
