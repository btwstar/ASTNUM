"use client";

/**
 * PR celebration: framer-motion burst — crown springs in, fixed
 * rays scale out, translated record-type badges below. The parent (gym index)
 * triggers haptic("pr") + toast and auto-dismisses the burst after 1.8s.
 */
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import type { PrType } from "@/lib/logic/pr";

export interface PrBurstState {
  prs: PrType[];
  name: string;
  nonce: number;
}

/** deterministic rays — no Math.random at render time */
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

export function PrBurst({ burst }: { burst: PrBurstState | null }) {
  const { t } = useI18n();

  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key="pr-burst"
          className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          aria-live="assertive"
        >
          <div className="relative mx-4 flex max-w-xs flex-col items-center gap-2 rounded-3xl border border-primary/40 bg-card/95 px-8 py-6 text-center shadow-2xl shadow-primary/20">
            {/* burst rays around the crown */}
            <div className="pointer-events-none absolute left-1/2 top-8 h-0 w-0" aria-hidden>
              {RAYS.map((angle) => (
                <motion.span
                  key={angle}
                  className="absolute h-1.5 w-1.5 rounded-full bg-gradient-accent"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{
                    x: Math.cos((angle * Math.PI) / 180) * 56,
                    y: Math.sin((angle * Math.PI) / 180) * 56,
                    opacity: [0, 1, 0],
                    scale: [0.4, 1.4, 0.6],
                  }}
                  transition={{ duration: 0.9, ease: "easeOut", times: [0, 0.35, 1] }}
                />
              ))}
            </div>
            <motion.div
              initial={{ scale: 0, rotate: -35 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              <Crown className="h-14 w-14 text-warning drop-shadow-[0_0_12px_var(--warning)]" aria-hidden />
            </motion.div>
            <p className="text-gradient text-xl font-bold leading-snug">{t("gym.pr.title")}</p>
            <p className="text-sm text-muted-foreground">{burst.name}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              {burst.prs.map((pr) => (
                <Badge
                  key={pr}
                  className="border-primary/30 bg-primary/15 text-primary"
                >
                  {t(`gym.pr.type.${pr}`)}
                </Badge>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
