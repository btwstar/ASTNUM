"use client";

/**
 * APK download — WEB PREVIEW ONLY.
 *
 * Gives visitors of the web build a one-tap download of the Android APK.
 * Stripped from every static export automatically: NEXT_PUBLIC_STATIC is
 * inlined at APK build time (scripts/build-apk.sh sets it to "1"), so the
 * constant below compiles to `false` there and the whole card is inert.
 */

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { AstnumLogo } from "@/components/shell/logo";
import { toast } from "sonner";
import { Download, X } from "lucide-react";

const APK_URL = "/download/ASTNUM-v1.24-debug.apk";
const APK_FILENAME = "ASTNUM-v1.24.apk";

/** Full open-source project (GitHub-ready) — v1.24. */
export const SOURCE_ZIP_URL = "/download/ASTNUM-source-v1.24.zip";
export const SOURCE_ZIP_FILENAME = "ASTNUM-source-v1.24.zip";
const DISMISS_KEY = "astnum-web-apk-banner";

/** Web-only gate — `false` inside the exported APK payload. */
export const SHOW_APK_DOWNLOAD = process.env.NEXT_PUBLIC_STATIC !== "1";

/* ── mini phone mockup (decorative) ─────────────────────────── */

export function PhoneMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative shrink-0" aria-hidden>
      <div className="absolute -inset-3 rounded-full bg-grad-from/25 blur-2xl" />
      <div
        className={`relative flex flex-col items-center justify-center rounded-[1.2rem] border-2 border-primary/35 bg-background shadow-xl shadow-primary/15 ${
          compact ? "h-16 w-10" : "h-[5.75rem] w-[3.5rem]"
        }`}
      >
        <AstnumLogo size={compact ? 30 : 36} glow={false} />
        {/* speaker notch */}
        <span className="absolute top-1.5 h-1 w-5 rounded-full bg-muted" />
        {/* mini bottom-nav dots */}
        <span className="absolute bottom-1.5 flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-primary/70" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
        </span>
      </div>
      {/* floating APK badge */}
      <span className="absolute -bottom-1.5 -end-1.5 rounded-full bg-gradient-accent px-1.5 py-0.5 text-[8px] font-extrabold leading-none text-primary-foreground shadow-md">
        APK
      </span>
    </div>
  );
}

/* ── shared CTA ─────────────────────────────────────────────── */

export function ApkDownloadButton({ full = true }: { full?: boolean }) {
  const { t } = useI18n();
  return (
    <a
      href={APK_URL}
      download={APK_FILENAME}
      onClick={() => {
        haptic("medium");
        toast.success(t("apk.started"), { duration: 5000 });
      }}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-accent px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95 ${
        full ? "w-full" : ""
      }`}
    >
      <Download className="h-4 w-4" aria-hidden />
      {t("apk.downloadCta")}
    </a>
  );
}

/* ── Today-screen banner ────────────────────────────────────── */

export function ApkBanner() {
  const { t } = useI18n();
  // tri-state: null = storage not read yet (render nothing), then real value.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
      } catch {
        setVisible(true);
      }
    });
  }, []);

  if (!SHOW_APK_DOWNLOAD || visible === null || !visible) return null;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="apk-banner"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="relative mx-4 overflow-hidden rounded-2xl border border-primary/25 bg-card"
        data-testid="apk-banner"
      >
        {/* ambient glows */}
        <div aria-hidden className="pointer-events-none absolute -end-10 -top-12 h-36 w-36 rounded-full bg-grad-from/15 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-14 -start-10 h-32 w-32 rounded-full bg-grad-to/15 blur-2xl" />

        <div className="relative flex items-center gap-4 p-4 pe-3">
          <PhoneMock />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug">{t("apk.banner.title")}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t("apk.banner.subtitle")}</p>
            <div className="mt-2.5">
              <ApkDownloadButton />
            </div>
            <p className="tnum mt-1.5 text-center text-[10px] text-muted-foreground" dir="auto">
              {t("apk.meta")}
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label={t("apk.dismiss")}
          onClick={() => {
            haptic("light");
            try {
              window.localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* private mode */
            }
            setVisible(false);
          }}
          className="absolute end-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Settings-sheet body (mounted inside the real <Section/>) ─ */

export function ApkSettingsBody() {
  const { t } = useI18n();
  if (!SHOW_APK_DOWNLOAD) return null;
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <PhoneMock compact />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug">{t("apk.banner.title")}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t("apk.banner.subtitle")}</p>
        </div>
      </div>
      <ApkDownloadButton />
      <p className="tnum mt-2 text-center text-[10px] text-muted-foreground" dir="auto">
        {t("apk.meta")}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{t("apk.installHint")}</p>
    </div>
  );
}
