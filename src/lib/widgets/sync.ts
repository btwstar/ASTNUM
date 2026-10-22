/**
 * Widget sync scheduler — keeps the home-screen widgets in step with the
 * app data. ONE debounced pipeline, triggered from:
 *
 *   • api.ts — after every successful mutating call (POST/PATCH/PUT/DELETE)
 *   • app mount + language/unit changes (WidgetSync component)
 *   • window focus / visibility (user returning to the app; the WebView
 *     fires these on Android pause/resume too)
 *
 * Deliberately imported DYNAMICALLY by api.ts (`import("./sync")`) so the
 * api → sync → bridge → snapshot chain never executes during module init
 * (snapshot.ts imports api.ts back — the dynamic edge keeps that cycle safe)
 * and so the web bundle only pays for it when a mutation actually happens.
 */

import { pushWidgetSnapshot } from "./bridge";

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let queued = false;

/** Coalesce a burst of mutations into one widget refresh. Default 900ms. */
export function scheduleWidgetSync(delayMs = 900): void {
  if (typeof window === "undefined") return; // server/build-time safety
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (inFlight) {
      // a push is still running — re-queue once after it settles
      queued = true;
      return;
    }
    inFlight = (async () => {
      try {
        await pushWidgetSnapshot();
      } catch {
        /* best-effort */
      } finally {
        inFlight = null;
        if (queued) {
          queued = false;
          scheduleWidgetSync(200);
        }
      }
    })();
  }, delayMs);
}
