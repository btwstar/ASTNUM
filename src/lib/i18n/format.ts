/**
 * Locale-aware formatting utilities.
 * Numbers/dates/plurals render in the active language's locale (registry in
 * ./languages.ts — 168 languages). Unknown codes fall back to en-US.
 * All dates/times format in the user's local timezone.
 */
import type { I18nLang } from "./dictionaries";
import { localeFor } from "./languages";

export function formatNumber(
  value: number,
  lang: I18nLang,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(localeFor(lang), options).format(value);
  } catch {
    try {
      return new Intl.NumberFormat("en-US", options).format(value);
    } catch {
      return String(value);
    }
  }
}

export function formatDate(
  value: string | number | Date,
  lang: I18nLang,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  const opts: Intl.DateTimeFormatOptions = options ?? {
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  try {
    return new Intl.DateTimeFormat(localeFor(lang), opts).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat("en-US", opts).format(date);
    } catch {
      return String(value);
    }
  }
}

export function formatTime(value: string | number | Date, lang: I18nLang): string {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return String(value);
    }
  }
}

export function formatRelative(value: string | number | Date, lang: I18nLang): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = date.getTime() - Date.now();
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  }
  const absMinutes = Math.abs(diffMs) / 60000;
  if (absMinutes < 60) return rtf.format(Math.round(diffMs / 60000), "minute");
  if (absMinutes < 60 * 24) return rtf.format(Math.round(diffMs / 3600000), "hour");
  if (absMinutes < 60 * 24 * 30) return rtf.format(Math.round(diffMs / 86400000), "day");
  return rtf.format(Math.round(diffMs / (86400000 * 30)), "month");
}

/** Current date in the user's local timezone as YYYY-MM-DD (DST-safe). */
export function toLocalDateKey(tz?: string): string {
  const timeZone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    // en-CA gives YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date()
    );
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

/** Add days to a YYYY-MM-DD key (pure calendar math, no timezone shifts). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayKeyToWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}
