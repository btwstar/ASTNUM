/**
 * Headless quick-add entry — runs INSIDE the offscreen WebView that
 * QuickAddActivity spawns when the main app process is DEAD. The page is
 * served from the SAME ORIGIN as the app (https://localhost, intercepted
 * from the APK's web assets), so it shares the app's localStorage database
 * exactly — a habit/note created here IS in the app's database.
 *
 * Flow (native drives, this file just provides two hooks):
 *   1. bundle registers window.__astnumProcessCapture + calls
 *      AstnumQuickBridge.pageReady()
 *   2. native evaluates __astnumProcessCapture(<queue-json>)
 *   3. we commit every entry (app's own routes + idempotency ledger),
 *      flush the database to localStorage IMMEDIATELY, build a fresh
 *      widget snapshot, and hand everything back via captureDone()
 *   4. native stores the snapshot, refreshes every home-screen widget,
 *      clears the acked queue entries and closes the dialog.
 *
 * Never imported by the app itself — only bundled by
 * scripts/build-quickadd-bundle.sh into public/quickadd/quickadd.js.
 */

import { useAppStore } from "@/lib/store/app-store";
import { flushNow } from "@/lib/local-api/db";
import { buildWidgetSnapshot } from "@/lib/widgets/snapshot";
import { processCaptures, parseCaptureJson } from "@/lib/widgets/capture";

interface NativeQuickBridge {
  /** tell native the bundle is ready to receive the queue */
  pageReady(): void;
  /** hand back { ok, created, skipped, failed, acked[], snapshot } */
  captureDone(resultJson: string): void;
  /** optional lightweight diagnostic channel */
  log(message: string): void;
}

declare global {
  interface Window {
    AstnumQuickBridge?: NativeQuickBridge;
    __astnumProcessCapture?: (entriesJson: string) => void;
  }
}

const native = (): NativeQuickBridge | undefined =>
  typeof window !== "undefined" ? window.AstnumQuickBridge : undefined;

const log = (msg: string): void => {
  try {
    native()?.log(msg);
  } catch {
    /* diagnostics must never break the commit */
  }
};

/** Never block a capture on store hydration — but give it a fair chance. */
async function waitForStoreHydration(): Promise<void> {
  try {
    const persist = useAppStore.persist;
    if (typeof persist?.hasHydrated !== "function" || persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      try {
        const unsub = persist.onFinishHydration(() => {
          try {
            unsub?.();
          } catch {
            /* already removed */
          }
          finish();
        });
      } catch {
        /* fall through to the cap */
      }
      window.setTimeout(finish, 2500);
    });
  } catch {
    /* snapshot building re-reads state safely even without hydration */
  }
}

async function commit(entriesJson: string): Promise<void> {
  const bridge = native();
  log(`committing captures…`);
  try {
    const entries = parseCaptureJson(entriesJson);
    if (entries.length === 0) {
      bridge?.captureDone(JSON.stringify({ ok: true, created: 0, skipped: 0, failed: 0, acked: [] }));
      return;
    }

    await waitForStoreHydration();
    const result = await processCaptures(entries);
    flushNow(); // persist the rows to localStorage RIGHT NOW (no 150ms debounce)

    // fresh labels + data for all 15 widgets, in the app's own language
    const snapshot = await buildWidgetSnapshot();

    bridge?.captureDone(
      JSON.stringify({
        ok: true,
        created: result.created,
        skipped: result.skipped,
        failed: result.failed,
        acked: result.acked,
        snapshot,
      })
    );
  } catch (e) {
    log(`commit error: ${String(e)}`);
    bridge?.captureDone(JSON.stringify({ ok: false, error: String(e) }));
  }
}

/* native → JS */
window.__astnumProcessCapture = (entriesJson: string): void => {
  void commit(typeof entriesJson === "string" ? entriesJson : "[]");
};

/* JS → native: we're up — hand over the queue */
try {
  native()?.pageReady();
} catch {
  /* native will fall back to the onPageFinished dispatch */
}
