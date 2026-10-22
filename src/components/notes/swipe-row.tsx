"use client";

/**
 * SwipeRow — directional swipe-to-act row.
 *
 * Semantics (logical, RTL-safe):
 *   - swipe toward inline-START → fires onStart  (e.g. pin / postpone)
 *   - swipe toward inline-END   → fires onEnd    (e.g. archive / complete)
 *
 * The pane revealed behind the content shows the icon of the action the user
 * is heading toward. Everything is physical-x under the hood; logical
 * direction is derived from the current app dir (RTL flips it).
 * Actions also exist in accessible menus elsewhere (a11y parity).
 */
import React, { useCallback, useRef } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";

export interface SwipeActionDef {
  icon: React.ElementType;
  /** aria/text label */
  label: string;
  /** pane styling, e.g. "bg-primary/15 text-primary" */
  paneClass: string;
}

interface SwipeRowProps {
  startAction?: SwipeActionDef;
  endAction?: SwipeActionDef;
  onStart?: () => void;
  onEnd?: () => void;
  /** plain tap (suppressed right after a drag) */
  onTap?: () => void;
  children: React.ReactNode;
  className?: string;
}

const THRESHOLD = 84; // px of drag before the action commits
const SPRING = { type: "spring", stiffness: 500, damping: 38 } as const;

export function SwipeRow({
  startAction,
  endAction,
  onStart,
  onEnd,
  onTap,
  children,
  className,
}: SwipeRowProps) {
  const { isRtl } = useI18n();
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const armed = useRef<null | "start" | "end">(null);

  // physical → logical direction
  const logical = useTransform(x, (v) => (isRtl ? -v : v));

  // panes live at the physical edges; which action they show depends on dir
  const leftAction = isRtl ? startAction : endAction;
  const rightAction = isRtl ? endAction : startAction;
  const leftOpacity = useTransform(x, [10, 60], [0, 1]);
  const rightOpacity = useTransform(x, [-60, -10], [1, 0]);

  // light tick when the drag arms an action
  useMotionValueEvent(logical, "change", (v) => {
    if (armed.current === null && Math.abs(v) > THRESHOLD) {
      armed.current = v > 0 ? "end" : "start";
      haptic("light");
    }
  });

  const settle = useCallback(() => {
    animate(x, 0, SPRING);
    armed.current = null;
  }, [x]);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
      {/* revealed panes */}
      {leftAction && (
        <motion.div
          aria-hidden
          style={{ opacity: leftOpacity }}
          className={`absolute inset-y-0 left-0 flex w-28 items-center justify-center ${leftAction.paneClass}`}
        >
          <div className="flex flex-col items-center gap-1">
            <leftAction.icon className="h-6 w-6" aria-hidden />
            <span className="text-[10px] font-medium leading-none">{leftAction.label}</span>
          </div>
        </motion.div>
      )}
      {rightAction && (
        <motion.div
          aria-hidden
          style={{ opacity: rightOpacity }}
          className={`absolute inset-y-0 right-0 flex w-28 items-center justify-center ${rightAction.paneClass}`}
        >
          <div className="flex flex-col items-center gap-1">
            <rightAction.icon className="h-6 w-6" aria-hidden />
            <span className="text-[10px] font-medium leading-none">{rightAction.label}</span>
          </div>
        </motion.div>
      )}

      {/* draggable content */}
      <motion.div
        role="listitem"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -140, right: 140 }}
        dragElastic={0.55}
        style={{ x }}
        onDragStart={() => {
          dragged.current = true;
          armed.current = null;
        }}
        onDragEnd={(_, info) => {
          const logicalOffset = isRtl ? -info.offset.x : info.offset.x;
          if (logicalOffset > THRESHOLD) {
            haptic("medium");
            onEnd?.();
          } else if (logicalOffset < -THRESHOLD) {
            haptic("medium");
            onStart?.();
          }
          settle();
          // swallow the trailing click of a real drag
          window.setTimeout(() => {
            dragged.current = false;
          }, 350);
        }}
        onClick={() => {
          if (dragged.current) return;
          onTap?.();
        }}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}
