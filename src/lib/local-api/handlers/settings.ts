/**
 * /api/settings — port of src/app/api/settings/route.ts (verbatim logic).
 *
 * GET  → all settings as Record<string,string>
 * POST { entries: Record<string,string> } → upsert many → { saved: n }
 * (malformed JSON body → the route's 500, same as the server)
 */

import { getDb } from "../db";
import { fail, ok, propagate, rawJsonObject } from "../shared";
import type { LocalRequest } from "../shared";

export function settingsGet(): Record<string, string> {
  try {
    const db = getDb();
    const entries: Record<string, string> = {};
    for (const row of db.settings) entries[row.key] = row.value;
    return ok(entries);
  } catch (e) {
    propagate(e, "failed_to_load_settings");
  }
}

export function settingsPost(req: LocalRequest): { saved: number } {
  try {
    const body = rawJsonObject(req) as { entries?: Record<string, string> };
    if (!body.entries || typeof body.entries !== "object") {
      fail("VALIDATION", "entries object required", 400);
    }

    const db = getDb();
    const now = new Date().toISOString();
    const pairs = Object.entries(body.entries);
    for (const [key, value] of pairs) {
      const index = db.settings.findIndex((r) => r.key === key);
      const row = { key, value: String(value), updatedAt: now };
      if (index >= 0) db.settings[index] = row;
      else db.settings.push(row);
    }
    return ok({ saved: pairs.length });
  } catch (e) {
    propagate(e, "failed_to_save_settings");
  }
}
