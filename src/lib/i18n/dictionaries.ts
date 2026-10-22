/**
 * Dictionary registry v3 — English is the BASE language (every key exists in
 * it); Arabic ships complete as the built-in second language. 165+ further
 * languages live in `generated/` as lazy chunks produced by
 * `scripts/i18n/generate.ts` and load on demand.
 *
 * Resolution order for a language code:
 *     English base  →  base-language dict (regional variants, e.g. es for
 *     es-MX)  →  the language's own generated dict
 * so a key missing higher up always falls back down the chain — the UI can
 * never render a raw key.
 */

import ar_common from "./locales/ar/common";
import ar_onboarding from "./locales/ar/onboarding";
import ar_settings from "./locales/ar/settings";
import ar_habits from "./locales/ar/habits";
import ar_notes from "./locales/ar/notes";
import ar_gym from "./locales/ar/gym";
import ar_muscles from "./locales/ar/muscles";
import ar_body from "./locales/ar/body";
import ar_nutrition from "./locales/ar/nutrition";
import ar_analyst from "./locales/ar/analyst";
import ar_today from "./locales/ar/today";
import ar_widgets from "./locales/ar/widgets";

import en_common from "./locales/en/common";
import en_onboarding from "./locales/en/onboarding";
import en_settings from "./locales/en/settings";
import en_habits from "./locales/en/habits";
import en_notes from "./locales/en/notes";
import en_gym from "./locales/en/gym";
import en_muscles from "./locales/en/muscles";
import en_body from "./locales/en/body";
import en_nutrition from "./locales/en/nutrition";
import en_analyst from "./locales/en/analyst";
import en_today from "./locales/en/today";
import en_widgets from "./locales/en/widgets";

import { GENERATED_LOADERS, GENERATED_KEY_COUNTS } from "./generated";
import { getLangMeta } from "./languages";

export type Dict = Record<string, string>;
/** Any registered language code is a valid Lang (160 supported). */
export type I18nLang = string;

export const BASE_DICTS: Record<"ar" | "en", Dict> = {
  ar: {
    ...ar_common,
    ...ar_onboarding,
    ...ar_settings,
    ...ar_habits,
    ...ar_notes,
    ...ar_gym,
    ...ar_muscles,
    ...ar_body,
    ...ar_nutrition,
    ...ar_analyst,
    ...ar_today,
    ...ar_widgets,
  },
  en: {
    ...en_common,
    ...en_onboarding,
    ...en_settings,
    ...en_habits,
    ...en_notes,
    ...en_gym,
    ...en_muscles,
    ...en_body,
    ...en_nutrition,
    ...en_analyst,
    ...en_today,
    ...en_widgets,
  },
};

/** Total keys in the base English dictionary (coverage denominator). */
export const TOTAL_BASE_KEYS = Object.keys(BASE_DICTS.en).length;

/* ── Runtime merged-dict cache ─────────────────────────────────── */

const mergedCache = new Map<string, Dict>();
const pending = new Map<string, Promise<Dict>>();

async function loadGeneratedUncached(code: string): Promise<Dict | null> {
  const loader = GENERATED_LOADERS[code];
  if (!loader) return null;
  try {
    const mod = await loader();
    return mod.default as Dict;
  } catch {
    return null;
  }
}

const generatedCache = new Map<string, Dict | null>();

async function loadGenerated(code: string): Promise<Dict | null> {
  if (generatedCache.has(code)) return generatedCache.get(code) ?? null;
  const dict = await loadGeneratedUncached(code);
  generatedCache.set(code, dict);
  return dict;
}

/**
 * Build (and cache) the fully-merged dictionary for a language.
 * Order: English base → fallback language → own generated dict.
 */
export async function ensureDict(lang: string): Promise<Dict> {
  const cached = mergedCache.get(lang);
  if (cached) return cached;

  const inflight = pending.get(lang);
  if (inflight) return inflight;

  const task = (async () => {
    const meta = getLangMeta(lang);
    const dict: Dict = { ...BASE_DICTS.en };

    // Arabic is built-in (no generated chunk needed).
    if (lang === "ar") {
      Object.assign(dict, BASE_DICTS.ar);
      return dict;
    }
    if (lang === "en") return dict;

    // Regional variants first inherit their base language (es-MX → es …).
    const fallback = meta?.fallback;
    if (fallback) {
      if (fallback === "ar") Object.assign(dict, BASE_DICTS.ar);
      else {
        const fb = await loadGenerated(fallback);
        if (fb) Object.assign(dict, fb);
      }
    }

    // …then overlay the language's own generated translations.
    const own = await loadGenerated(lang);
    if (own) Object.assign(dict, own);

    return dict;
  })();

  pending.set(lang, task);
  try {
    const dict = await task;
    mergedCache.set(lang, dict);
    return dict;
  } finally {
    pending.delete(lang);
  }
}

/** Synchronous peek at the merged dict (undefined until ensureDict resolves). */
export function peekDict(lang: string): Dict | undefined {
  const merged = mergedCache.get(lang);
  if (merged) return merged;
  if (lang === "ar") return BASE_DICTS.ar;
  return undefined;
}

/** Sync best-effort dict for a language — never returns undefined. */
export function bestSyncDict(lang: string): Dict {
  return peekDict(lang) ?? BASE_DICTS.en;
}

/**
 * Effective UI coverage of a language (0..1) including its fallback chain.
 * Used by the language picker to show honest translation status.
 */
export function coverageOf(lang: string): number {
  if (lang === "en") return 1;
  if (lang === "ar") return 1;
  const meta = getLangMeta(lang);
  const own = GENERATED_KEY_COUNTS[lang] ?? 0;
  const baseOwn = meta?.fallback ? (GENERATED_KEY_COUNTS[meta.fallback] ?? 0) : 0;
  // fallback counts only for keys the variant doesn't override itself
  const effective = Math.max(own, baseOwn);
  return Math.min(1, effective / TOTAL_BASE_KEYS);
}
