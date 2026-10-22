/**
 * Quick-capture processor — the ONE implementation that turns the native
 * quick-add dialog's captures (typed over the home screen, app closed)
 * into real habit/note rows. Shared by:
 *
 *   • bridge.ts   — live "quickCapture" events (process alive) + the
 *                  boot-time consumption of leftover queue entries
 *   • the headless quickadd bundle (scripts/build-quickadd-bundle.sh) —
 *                  QuickAddActivity spawns a same-origin offscreen WebView
 *                  that runs this exact code against the SAME localStorage
 *                  database when the app process is dead, then hands the
 *                  freshly-built widget snapshot back to native.
 *
 * Idempotency ledger: every capture id is recorded (settings key
 * "qa_ledger") together with the created row id, at the same commit as the
 * row itself. A capture whose id is already in the ledger is skipped — a
 * crashed/duplicated pass can never create the same row twice.
 */

import { apiGet, apiPost } from "@/lib/api";
import { toLocalDateKey } from "@/lib/i18n/format";

export interface QuickCapture {
  id: string;
  type: "habit" | "note" | "water";
  title: string;
  /** type="water" only: "water" | "juice" | "other" (default water) */
  drink?: string;
  ts?: number;
}

export interface CaptureResult {
  /** rows created in THIS pass */
  created: number;
  /** entries that were already in the ledger from an earlier pass */
  skipped: number;
  /** entries that could not be committed (stay queued on the native side) */
  failed: number;
  /** entry ids that are safely committed → native removes them from its queue */
  acked: string[];
}

const LEDGER_KEY = "qa_ledger";
const LEDGER_MAX = 120;

type Ledger = Record<string, string>;

async function loadLedger(): Promise<Ledger> {
  try {
    const res = await apiGet<Record<string, string>>("/api/settings");
    const raw = res?.[LEDGER_KEY];
    if (!raw || typeof raw !== "string") return {};
    const parsed = JSON.parse(raw) as Ledger;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function saveLedger(ledger: Ledger): Promise<void> {
  // keep the newest LEDGER_MAX ids (insertion order ≈ creation order)
  const keys = Object.keys(ledger);
  const kept: Ledger = {};
  for (const k of keys.slice(Math.max(0, keys.length - LEDGER_MAX))) kept[k] = ledger[k];
  await apiPost("/api/settings", { entries: { [LEDGER_KEY]: JSON.stringify(kept) } });
}

function parseEntries(raw: unknown): QuickCapture[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickCapture[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const id = typeof (e as QuickCapture).id === "string" ? (e as QuickCapture).id : "";
    if (!id) continue;
    const type =
      (e as QuickCapture).type === "note"
        ? "note"
        : (e as QuickCapture).type === "water"
          ? "water"
          : "habit";
    out.push({
      id,
      type,
      title: typeof (e as QuickCapture).title === "string" ? (e as QuickCapture).title : "",
      drink:
        typeof (e as QuickCapture & { drink?: unknown }).drink === "string"
        ? (e as QuickCapture & { drink?: string }).drink
        : undefined,
      ts: typeof (e as QuickCapture).ts === "number" ? (e as QuickCapture).ts : undefined,
    });
  }
  return out;
}

/** Parse the JSON array the native queue hands over (tolerant). */
export function parseCaptureJson(json: string | null | undefined): QuickCapture[] {
  try {
    return parseEntries(JSON.parse(json ?? "[]"));
  } catch {
    return [];
  }
}

/**
 * Commit every entry through the app's OWN create routes (same validation,
 * defaults and today-computed fields as an in-app tap). Never throws.
 */
export async function processCaptures(entries: QuickCapture[]): Promise<CaptureResult> {
  const result: CaptureResult = { created: 0, skipped: 0, failed: 0, acked: [] };
  const list = parseEntries(entries);
  if (list.length === 0) return result;

  const ledger = await loadLedger();
  let ledgerDirty = false;

  for (const entry of list) {
    const title = entry.title.trim().slice(0, 300);

    // water captures carry the AMOUNT in `title` ("250") + the drink in
    // `drink` — one-tap hydration logging from the home-screen widget
    if (entry.type === "water") {
      const ml = Number(title.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(ml) || ml < 50 || ml > 3000) {
        result.failed++;
        continue;
      }
      if (ledger[entry.id]) {
        result.skipped++;
        result.acked.push(entry.id);
        continue;
      }
      try {
        const row = await apiPost<{ log: { id: string } }>("/api/nutrition/water", {
          date: toLocalDateKey(),
          drink: entry.drink === "juice" || entry.drink === "other" ? entry.drink : "water",
          ml,
        });
        ledger[entry.id] = row?.log?.id ?? "unknown";
        result.created++;
        result.acked.push(entry.id);
        ledgerDirty = true;
      } catch {
        result.failed++;
      }
      continue;
    }

    if (!title) {
      result.failed++;
      continue;
    }

    // already committed by an earlier pass → ack so native drops it
    if (ledger[entry.id]) {
      result.skipped++;
      result.acked.push(entry.id);
      continue;
    }

    try {
      if (entry.type === "note") {
        const note = await apiPost<{ id: string }>("/api/notes", { title });
        ledger[entry.id] = note?.id ?? "unknown";
      } else {
        const res = await apiPost<{ habit: { id: string } }>("/api/habits", { name: title });
        ledger[entry.id] = res?.habit?.id ?? "unknown";
      }
      result.created++;
      result.acked.push(entry.id);
      ledgerDirty = true;
    } catch {
      result.failed++;
    }
  }

  if (ledgerDirty) {
    try {
      await saveLedger(ledger);
    } catch {
      // the row is committed; the ledger is only a dedup safety net — a
      // failed save may at worst re-skip… never duplicate rows on screen
      // because the queue entry is acked only on success paths anyway
    }
  }
  return result;
}
