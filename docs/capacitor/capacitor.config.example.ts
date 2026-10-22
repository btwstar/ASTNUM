/**
 * ASTNUM — Capacitor configuration (EXAMPLE / TEMPLATE)
 * ---------------------------------------------------------------------------
 * Copy this file to the PROJECT ROOT as `capacitor.config.ts`:
 *
 *   cp docs/capacitor/capacitor.config.example.ts capacitor.config.ts
 *
 * This file lives in docs/ on purpose: it documents the production shape
 * without making `cap` commands work against the current dev repo as-is.
 *
 * HONEST PREREQUISITE — read docs/MANUAL_STEPS.md §ب.0 first:
 *   webDir: 'out' only works after the static-export path is done
 *   (next.config.ts → output: 'export' + removing src/app/api/** from the
 *   build + swapping src/lib/api.ts to the native SQLite bridge).
 *   Running `cap sync` BEFORE that work produces an Android shell whose UI
 *   loads but whose data calls fail — expected, not a bug.
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  /** Android application ID — becomes the Play Store identity. NEVER change after publishing. */
  appId: 'com.astnum.app',

  /** Display name on the device launcher + in Play listings. */
  appName: 'ASTNUM',

  /**
   * Static-export output directory (Path 1 — the production recommendation).
   * Produced by:  next build   with output: 'export' in next.config.ts.
   *
   * ALTERNATIVE — server mode (NOT recommended, documented honestly):
   *   If you keep the Next.js server hosted somewhere and only want a thin
   *   WebView shell, replace `webDir` with a `server` block:
   *
   *     server: {
   *       url: 'https://your-hosted-astnum.example.com',
   *       cleartext: false,            // HTTPS only — never allowMixedContent
   *       androidScheme: 'https',
   *     },
   *
   *   Consequences of server mode: the app REQUIRES internet for everything,
   *   your data lives on that server (contradicts ASTNUM's on-device promise),
   *   and Play review may flag it as a "thin wrapper". Choose the static
   *   export path for the real release.
   */
  webDir: 'out',

  android: {
    /** No mixed content: every external call (AI worker, Open Food Facts) is HTTPS. */
    allowMixedContent: false,

    /** Deep navy — matches --background (oklch(0.145 0.028 258) ≈ #0b1020) so the
     *  WebView flash on cold start feels native instead of white. */
    backgroundColor: '#0b1020',

    /** WebView debugging off in release builds (cap toggleable in dev builds). */
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    /**
     * ── Recommended plugin set (rationale in docs/MANUAL_STEPS.md §ب.4) ──
     *
     * Data core:
     *   bun add @capacitor-community/sqlite
     *     Same 23 tables as prisma/schema.prisma (mirror 1:1). The schema
     *     column types are documented in docs/capacitor/ANDROID_BUILD.md.
     *
     * Reminders (habits + tasks):
     *   bun add @capacitor/local-notifications
     *     Requires runtime permission POST_NOTIFICATIONS on Android 13+,
     *     and SCHEDULE_EXACT_ALARM handling on Android 14+ — see
     *     ANDROID_BUILD.md §الإشعارات before scheduling anything.
     *
     * Haptics (drop-in for src/lib/haptics.ts):
     *   bun add @capacitor/haptics
     *
     * Barcode (ML Kit, on-device, offline, free — no data leaves the device):
     *   bun add @capacitor-community/barcode-scanner
     *     (repo archived 2024 — verify a living fork OR use the official
     *      @capacitor/mlkit/barcode-scanning before committing)
     *
     * Rest-timer keep-awake (mirrors the web Wake Lock):
     *   bun add @capacitor-community/keep-awake
     *
     * Progress photos in app-private storage (ProgressPhotos.filePath column):
     *   bun add @capacitor/filesystem
     *
     * Subscriptions (see docs/MANUAL_STEPS.md §هـ):
     *   bun add @revenuecat/purchases-capacitor
     *
     * Polish:
     *   bun add @capacitor/status-bar @capacitor/splash-screen @capacitor/app
     */
    LocalNotifications: {
      // Honest note: notification channels mirror the web build's reminder model:
      // one channel per habit-day reminder + one for tasks. Names are Arabic.
      smallIcon: 'ic_notification',
      iconColor: '#2dd4bf',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: '#0b1020',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK', // light icons on the navy header
      backgroundColor: '#0b1020',
      overlaysWebView: false,
    },
    CapacitorHttp: {
      // Keep native HTTP off: the fetch layer swap handles transport.
      enabled: false,
    },
  },
};

export default config;
