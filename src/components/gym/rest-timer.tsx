"use client";

/**
 * Rest timer: drift-proof countdown (anchored to wall-clock, not
 * decrement-per-tick — a throttled background tab still shows the honest
 * remaining time), WebAudio triple beep, document.title countdown (rendered by
 * the chip with locale-aware numbers).
 *
 * (The long web-limit hint was removed in v1.7 — the timer simply stops
 * when the app is closed; behavior unchanged.)
 *  - the interval is throttled by browsers on background tabs, but since the
 *    countdown derives from Date.now() the display self-corrects;
 *  - the beep needs the AudioContext unlocked by a user gesture — it is
 *    created inside the "save set" click chain, so it can play at rest end.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";

/* ── WebAudio ─────────────────────────────────────────────────────────── */

let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tripleBeep(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    for (const delay of [0, 0.25, 0.5]) {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(delay === 0.5 ? 1174.66 : 880, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  } catch {
    /* audio unavailable — the visual + haptic signals still fire */
  }
}

/* ── hook ────────────────────────────────────────────────────────────── */

export interface RestTimerApi {
  isResting: boolean;
  restLeft: number;
  restTotal: number;
  startRest: (seconds: number) => void;
  addRest: (seconds: number) => void;
  skipRest: () => void;
}

export function useRestTimer(onFinished?: () => void): RestTimerApi {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [left, setLeft] = useState(0);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const finish = useCallback(() => {
    finishedRef.current = true;
    setEndsAt(null);
    setLeft(0);
    tripleBeep();
    haptic("success");
    onFinishedRef.current?.();
  }, []);

  useEffect(() => {
    if (endsAt === null) return;
    finishedRef.current = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0 && !finishedRef.current) finish();
    };
    tick();
    // 1s tick — the display shows whole seconds; a sub-second interval would
    // only wake the CPU more often for zero visual difference (lower battery use).
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [endsAt, finish]);

  const startRest = useCallback(
    (seconds: number) => {
      if (seconds <= 0) return;
      ensureAudio(); // unlock audio inside the click chain
      setRestTotal(seconds);
      setEndsAt(Date.now() + seconds * 1000);
    },
    []
  );

  const addRest = useCallback(
    (seconds: number) => {
      setEndsAt((prev) => {
        if (prev === null) return prev;
        return prev + seconds * 1000;
      });
      setRestTotal((prev) => prev + seconds);
    },
    []
  );

  const skipRest = useCallback(() => {
    finishedRef.current = true;
    setEndsAt(null);
    setLeft(0);
  }, []);

  return {
    isResting: endsAt !== null && left > 0,
    restLeft: left,
    restTotal,
    startRest,
    addRest,
    skipRest,
  };
}

/* ── floating chip ────────────────────────────────────────────────────── */

export function RestTimerChip({ api }: { api: RestTimerApi }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const { isResting, restLeft, restTotal, addRest, skipRest } = api;

  // document.title countdown (restored when rest ends or the overlay closes)
  useEffect(() => {
    if (!isResting) return;
    const original = document.title;
    const m = Math.floor(restLeft / 60);
    const s = String(restLeft % 60).padStart(2, "0");
    document.title = `${m}:${s} • ${t("gym.title")}`;
    return () => {
      document.title = original;
    };
  }, [isResting, restLeft, t]);

  const progress = restTotal > 0 ? Math.min(1, restLeft / restTotal) : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  const nearEnd = restLeft <= 10;

  return (
    <motion.div
      key="rest-chip"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
        className="fixed inset-x-0 bottom-5 z-[70] mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-card/95 pe-1 ps-2 py-1 shadow-lg shadow-black/30 backdrop-blur-xl"
        role="timer"
        aria-label={t("gym.rest.countdown", { time: fmt.number(restLeft) })}
      >
        <svg
          className="h-14 w-14 -scale-x-100"
          viewBox="0 0 64 64"
          aria-hidden
        >
          <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border)" strokeWidth="5" />
          <motion.circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={nearEnd ? "var(--warning)" : "var(--primary)"}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={false}
            animate={{ strokeDashoffset: C * (1 - progress) }}
            transition={{ duration: 0.3, ease: "linear" }}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <div className="flex flex-col items-center leading-none">
          <span className="text-[10px] font-medium text-muted-foreground">{t("gym.rest.title")}</span>
          <span
            className={cn(
              "tnum text-lg font-bold tabular-nums",
              nearEnd ? "text-warning" : "text-foreground"
            )}
          >
            {fmt.number(restLeft)}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 w-11 rounded-full text-primary hover:bg-primary/10"
          aria-label={t("gym.rest.add30", { n: 30 })}
          onClick={() => {
            haptic("light");
            addRest(30);
          }}
        >
          <Plus className="h-5 w-5" aria-hidden />
          <span className="sr-only">{t("gym.rest.add30", { n: 30 })}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 w-11 rounded-full text-muted-foreground hover:bg-muted"
          aria-label={t("gym.rest.skip")}
          onClick={() => {
            haptic("light");
            skipRest();
          }}
        >
          <X className="h-5 w-5" aria-hidden />
          <span className="sr-only">{t("gym.rest.skip")}</span>
        </Button>
      </motion.div>
  );
}
