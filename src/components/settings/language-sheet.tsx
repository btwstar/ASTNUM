"use client";

/**
 * LanguageSheet — the 160-language picker (v1.23).
 *
 * Opens as a bottom sheet over whatever surface needs it (settings row,
 * onboarding). Search matches English name, native endonym and code.
 * Every language row shows honest translation coverage:
 *   ✓ Full — complete dictionary resident (or inherited via its base language)
 *   ~ %   — core UI translated, remaining keys fall back to English
 * Applying a language flips the whole app (text, digits, dates, direction)
 * instantly via the store + i18n provider — no reload.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store/app-store";
import { haptic } from "@/lib/haptics";
import { coverageOf } from "@/lib/i18n/dictionaries";
import {
  FEATURED_LANGUAGES,
  LANGUAGES,
  LANGUAGES_COUNT,
  REGION_LABEL_KEYS,
  type LanguageMeta,
} from "@/lib/i18n/languages";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, ChevronRight, Languages, Search, ArrowLeftRight } from "lucide-react";

/* ── small building blocks ─────────────────────────────────────────── */

function CoverageBadge({ lang }: { lang: string }) {
  const { t } = useI18n();
  const pct = Math.round(coverageOf(lang) * 100);
  const full = pct >= 100;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        full ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {full ? `✓ ${t("languages.fullShort")}` : `${pct}%`}
    </span>
  );
}

function LanguageRow({
  meta,
  active,
  onPick,
}: {
  meta: LanguageMeta;
  active: boolean;
  onPick: (code: string) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onPick(meta.code)}
      aria-pressed={active}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors ${
        active ? "bg-primary/10" : "hover:bg-accent"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className="flex items-center gap-1.5 truncate text-sm font-semibold"
          dir="auto"
        >
          {meta.native}
          {meta.rtl && (
            <span
              title={t("languages.rtl")}
              className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-px text-[9px] font-bold uppercase text-muted-foreground"
            >
              <ArrowLeftRight className="h-2.5 w-2.5" aria-hidden />
              RTL
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {meta.english} · {meta.code}
        </span>
      </span>
      <CoverageBadge lang={meta.code} />
      {active ? (
        <Check className="h-4 w-4 shrink-0 text-primary" aria-label={t("languages.current")} />
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </button>
  );
}

/* ── the sheet ─────────────────────────────────────────────────────── */

export function LanguageSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, dict } = useI18n();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const [query, setQuery] = useState("");

  /* Fresh search every time the sheet opens — deferred so it never runs
   * synchronously inside the effect body (react-hooks/set-state-in-effect). */
  useEffect(() => {
    if (open)
      queueMicrotask(() => setQuery(""));
  }, [open]);

  const pick = (code: string) => {
    if (code !== lang) {
      haptic("medium");
      setLang(code);
    }
    window.setTimeout(() => onOpenChange(false), 140);
  };

  /* Search: English name, native endonym, code — accent-insensitive where
   * possible, raw substring for native scripts. */
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return null;
    return LANGUAGES.filter(
      (l) =>
        l.english.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [q]);

  const byRegion = useMemo(() => {
    if (filtered) return null;
    const order = [
      "africa",
      "americas",
      "asia",
      "europe",
      "mena",
      "oceania",
      "constructed",
    ] as const;
    return order.map((region) => ({
      region,
      items: LANGUAGES.filter((l) => l.region === region && !l.featured),
    }));
  }, [filtered]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="mx-auto flex max-h-[86vh] w-full max-w-md flex-col rounded-t-3xl p-0"
      >
        <SheetHeader className="px-4 pb-0 pt-4">
          <SheetTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" aria-hidden />
            {t("languages.title")}
            <span className="tnum ms-auto me-6 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {dict["languages.count_other"]
                ? t("languages.count", { count: LANGUAGES_COUNT })
                : `${LANGUAGES_COUNT}`}
            </span>
          </SheetTitle>
          {/* search box */}
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("languages.search")}
              aria-label={t("languages.search")}
              className="h-11 w-full rounded-2xl border border-border bg-muted/50 ps-9 pe-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-2 py-3" style={{ scrollbarGutter: "stable" }}>
          {filtered ? (
            /* search results */
            <div className="flex flex-col gap-0.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("state.empty")}
                </p>
              ) : (
                filtered.map((l) => (
                  <LanguageRow key={l.code} meta={l} active={l.code === lang} onPick={pick} />
                ))
              )}
            </div>
          ) : (
            <>
              {/* featured chips */}
              <p className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("languages.featured")}
              </p>
              <div className="flex flex-wrap gap-1.5 px-2 pb-3">
                {FEATURED_LANGUAGES.map((l) => {
                  const active = l.code === lang;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => pick(l.code)}
                      aria-pressed={active}
                      dir="auto"
                      className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-card hover:bg-accent"
                      }`}
                    >
                      {l.native}
                      {active && <Check className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                  );
                })}
              </div>

              {/* regions */}
              {byRegion?.map(({ region, items }) =>
                items.length === 0 ? null : (
                  <section key={region} className="mt-1">
                    <p className="sticky top-0 z-10 bg-background/95 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
                      {t(REGION_LABEL_KEYS[region])}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {items.map((l) => (
                        <LanguageRow key={l.code} meta={l} active={l.code === lang} onPick={pick} />
                      ))}
                    </div>
                  </section>
                )
              )}
            </>
          )}
        </div>

        <p className="border-t border-border px-4 py-2.5 text-center text-[11px] leading-snug text-muted-foreground">
          {t("languages.partial")}
        </p>
      </SheetContent>
    </Sheet>
  );
}

/** Compact trigger row: current language native name + chevron. */
export function LanguageRowTrigger({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const lang = useAppStore((s) => s.lang);
  const meta = LANGUAGES.find((l) => l.code === lang);
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onOpen();
      }}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-1 text-sm"
    >
      <span className="flex items-center gap-2 font-semibold" dir="auto">
        {meta?.native ?? lang}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
      </span>
    </button>
  );
}
