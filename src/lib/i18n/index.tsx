"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import {
  BASE_DICTS,
  bestSyncDict,
  ensureDict,
  peekDict,
  type Dict,
  type I18nLang,
} from "./dictionaries";
import { getLangMeta, isRtlLang, localeFor } from "./languages";
import { useAppStore } from "@/lib/store/app-store";
import {
  formatNumber as fmtNumber,
  formatDate,
  formatTime,
  formatRelative,
  toLocalDateKey,
} from "./format";

export type { I18nLang };

export type TranslateParams = Record<string, string | number | undefined> & {
  count?: number;
};

interface I18nContextValue {
  lang: I18nLang;
  dir: "rtl" | "ltr";
  /** translate a key; supports {{param}} interpolation and _one/_few/_many/_other
   *  plural suffixes (resolved via Intl.PluralRules for the active language) */
  t: (key: string, params?: TranslateParams) => string;
  /** raw dictionary access (for bulk lists of keys) */
  dict: Dict;
  isRtl: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{{${name}}}`
  );
}

/** Plural candidate order: category → other → one (then base key). */
function pluralCandidates(key: string, suffix: string): string[] {
  return [`${key}_${suffix}`, `${key}_other`, `${key}_one`, key];
}

/** Look a key up in one dict honoring plural candidates. */
function lookup(dict: Dict, key: string, candidates?: string[]): string | undefined {
  if (candidates) {
    for (const c of candidates) {
      const v = dict[c];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }
  const v = dict[key] ?? dict[`${key}_other`];
  return v;
}

export function translateKey(lang: I18nLang, key: string, params?: TranslateParams): string {
  const dict = bestSyncDict(lang);
  const dictEn = BASE_DICTS.en;

  let candidates: string[] | undefined;
  if (params && typeof params.count === "number") {
    let suffix = "other";
    try {
      suffix = new Intl.PluralRules(localeFor(lang)).select(params.count);
    } catch {
      try {
        suffix = new Intl.PluralRules("en").select(params.count);
      } catch {
        /* keep "other" */
      }
    }
    candidates = pluralCandidates(key, suffix);
  }

  const value =
    lookup(dict, key, candidates) ?? lookup(dictEn, key, candidates) ?? key;

  return interpolate(value, params);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const lang = useAppStore((s) => s.lang);
  const dir = isRtlLang(lang) ? "rtl" : "ltr";

  /* Force a re-render when the merged dictionary resolves (async chunks). */
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let live = true;
    // ar/en are built-in; everything else lazy-loads its generated chunk.
    ensureDict(lang).then(() => {
      if (live) bump();
    });
    return () => {
      live = false;
    };
  }, [lang]);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = getLangMeta(lang)?.intl ?? lang;
    html.dir = dir;
  }, [lang, dir]);

  const t = useCallback(
    (key: string, params?: TranslateParams) => translateKey(lang, key, params),
    // bump keeps t fresh when the async dictionary resolves
    [lang, bump]
  );

  const dict = peekDict(lang) ?? BASE_DICTS.en;

  const value = useMemo<I18nContextValue>(
    () => ({ lang, dir, t, dict, isRtl: dir === "rtl" }),
    [lang, dir, t, dict]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience: locale-aware formatters bound to current language. */
export function useFormat() {
  const { lang } = useI18n();
  return useMemo(
    () => ({
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        fmtNumber(value, lang, options),
      date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
        formatDate(value, lang, options),
      time: (value: string | number | Date) => formatTime(value, lang),
      relative: (value: string | number | Date) => formatRelative(value, lang),
      todayKey: () => toLocalDateKey(),
    }),
    [lang]
  );
}
