"use client";

/**
 * EmptyState — friendly per-view empty screen.
 * Icon + title + hint + optional single CTA (DESIGN.md §7).
 */
import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  hint?: string;
  ctaKey?: string;
  onCta?: () => void;
}

export function EmptyState({ icon: Icon, title, hint, ctaKey, onCta }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col items-center gap-3 px-6 py-14 text-center"
      role="status"
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-9 w-9 text-primary" aria-hidden />
      </span>
      <p className="text-base font-semibold leading-snug">{title}</p>
      {hint && <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">{hint}</p>}
      {ctaKey && onCta && (
        <Button
          onClick={() => {
            haptic("medium");
            onCta();
          }}
          className="mt-2 min-h-11 rounded-2xl bg-gradient-accent px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/20"
        >
          {t(ctaKey)}
        </Button>
      )}
    </motion.div>
  );
}

/** List skeleton matching the note/task card shapes (no spinners — DESIGN.md §7). */
export function ListSkeleton({ rows = 4, height = "h-24" }: { rows?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`animate-pulse rounded-2xl bg-card ${height}`} />
      ))}
    </div>
  );
}

/** Inline human error with retry (DESIGN.md §7). */
export function InlineError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-6 text-center"
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{t("state.errorGeneric")}</p>
      <Button variant="outline" className="min-h-11 rounded-xl" onClick={onRetry}>
        {t("action.retry")}
      </Button>
    </div>
  );
}
