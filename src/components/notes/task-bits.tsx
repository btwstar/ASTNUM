"use client";

/**
 * Task building blocks shared across the module:
 * TaskCheckbox (44px target + strike), StrikeText, DueChip, PriorityDot.
 */
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock } from "lucide-react";
import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { PRIORITY_DOT } from "./types";

/** 44×44 touch-friendly check circle with spring pop + light haptic. */
export function TaskCheckbox({
  done,
  onToggle,
  size = "md",
}: {
  done: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const inner = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? t("tasks.uncomplete") : t("tasks.complete")}
      onClick={(e) => {
        e.stopPropagation();
        haptic("light");
        onToggle();
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform duration-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <motion.span
        initial={false}
        className={`flex items-center justify-center rounded-full border-2 transition-colors duration-150 ${inner} ${
          done
            ? "border-transparent bg-gradient-accent text-primary-foreground"
            : "border-border bg-transparent"
        }`}
      >
        <AnimatePresence initial={false}>
          {done && (
            <motion.span
              key="check"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </button>
  );
}

/** Title with an animated strike line (origin at inline-start, RTL-aware). */
export function StrikeText({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`relative inline-block min-w-0 transition-opacity duration-200 ${
        done ? "opacity-55" : "opacity-100"
      }`}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 origin-left rtl:origin-right rounded-full bg-current"
      />
      {children}
    </span>
  );
}

/** Relative due chip — danger tint when overdue. */
export function DueChip({ dueAt, overdue = false }: { dueAt: string; overdue?: boolean }) {
  const fmt = useFormat();
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-none ${
        overdue ? "bg-danger/10 text-danger" : "bg-secondary/80 text-muted-foreground"
      }`}
    >
      <Clock className="h-3 w-3 shrink-0 rtl:-scale-x-100" aria-hidden />
      <span className="truncate">{fmt.relative(dueAt)}</span>
    </span>
  );
}

/** Priority dot — 0 danger, 1 warning, 2 muted, 3 hidden (color + sr-only label). */
export function PriorityDot({ priority }: { priority: number }) {
  const { t } = useI18n();
  if (priority === 3 || priority < 0 || priority > 3) return null;
  const label = t(`tasks.priority.${["high", "medium", "low", "none"][priority]}`);
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[priority]}`} />
      <span className="sr-only">{`${label}`}</span>
    </span>
  );
}

/** Small "from a note" origin badge. */
export function FromNoteBadge() {
  const { t } = useI18n();
  return (
    <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
      {t("tasks.fromNote")}
    </span>
  );
}
