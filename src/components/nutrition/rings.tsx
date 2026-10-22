"use client";

/**
 * Animated SVG progress rings .
 * Main kcal ring (120px, neon gradient) + 3 mini macro rings (56px).
 * Progress animates via stroke-dashoffset (framer-motion), numbers are tabular.
 */
import React from "react";
import { motion } from "framer-motion";

import { useI18n, useFormat } from "@/lib/i18n";
import type { Totals } from "@/components/nutrition/shared";

const RING_ID = "astnum-kcal-gradient";

function RingSvg({
  size,
  stroke,
  progress,
  gradient,
  color,
  children,
  label,
}: {
  size: number;
  stroke: number;
  progress: number; // 0..1
  gradient?: boolean;
  color?: string;
  children?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div className="relative inline-flex" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {gradient && (
          <defs>
            <linearGradient id={RING_ID} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: "var(--grad-from)" }} />
              <stop offset="100%" style={{ stopColor: "var(--grad-to)" }} />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
          opacity={0.45}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={gradient ? `url(#${RING_ID})` : (color ?? "var(--primary)")}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped) }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

export function MainRing({ consumed, goal }: { consumed: number; goal: number }) {
  const { t } = useI18n();
  const fmt = useFormat();

  const progress = goal > 0 ? consumed / goal : 0;
  const remaining = goal - consumed;
  const remainingLabel =
    remaining >= 0
      ? t("nutrition.remainingKcal", { value: fmt.number(Math.round(remaining)) })
      : t("nutrition.overGoal", { value: fmt.number(Math.round(-remaining)) });

  return (
    <div className="flex flex-col items-center gap-1.5">
      <RingSvg size={120} stroke={10} progress={progress} gradient label={t("nutrition.kcal")}>
        <div className="flex flex-col items-center leading-none">
          <span className="tnum text-2xl font-bold">{fmt.number(Math.round(consumed))}</span>
          <span className="tnum text-[11px] text-muted-foreground">
            / {fmt.number(Math.round(goal))}
          </span>
        </div>
      </RingSvg>
      <p
        className={`text-xs font-semibold ${remaining >= 0 ? "text-muted-foreground" : "text-warning"}`}
      >
        {remainingLabel}
      </p>
    </div>
  );
}

function MiniRing({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  const fmt = useFormat();
  const progress = goal > 0 ? value / goal : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <RingSvg size={56} stroke={6} progress={progress} color={color} label={label}>
        <span className="tnum text-[11px] font-bold">{fmt.number(Math.round(value))}</span>
      </RingSvg>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="tnum -mt-1 text-[10px] text-muted-foreground">
        / {fmt.number(Math.round(goal))}
      </span>
    </div>
  );
}

/** Mini rings with real goals (used by the main screen). */
export function MacroRings({ consumed, goals }: { consumed: Totals; goals: Totals }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-center gap-4">
      <MiniRing label={t("nutrition.protein")} value={consumed.protein} goal={goals.protein} color="var(--success)" />
      <MiniRing label={t("nutrition.carbs")} value={consumed.carbs} goal={goals.carbs} color="var(--warning)" />
      <MiniRing label={t("nutrition.fat")} value={consumed.fat} goal={goals.fat} color="var(--danger)" />
    </div>
  );
}
