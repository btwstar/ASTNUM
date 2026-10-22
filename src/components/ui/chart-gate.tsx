"use client";

/**
 * ChartGate (v1.15, review finding 4) — renders its children (recharts)
 * only once the container has a REAL non-zero size, and unmounts them
 * again when the container collapses.
 *
 * Root cause it kills: ResponsiveContainer mounts before the parent has
 * layout (tab switch paint / latched-hidden gym tab) and recharts renders
 * once with width(0)×height(0), logging
 *   "The width(0) and height(0) of chart should be greater than 0"
 * four times across the app (nutrition weekly, body trends, gym weekly
 * volume, gym e1rm). Measuring first is the honest fix — no debounce
 * hacks, and a bonus: charts inside the hidden latched gym tab cost
 * nothing while invisible.
 *
 * ResizeObserver is supported by every target WebView (Android 5+ via
 * Chromium); a belt-and-braces fallback renders immediately if it is
 * somehow missing (old behavior, warning may return — never a crash).
 */
import React, { useEffect, useRef, useState } from "react";

export function ChartGate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      // legacy fallback: defer one tick — async setState keeps the render
      // pass cascading-free (same contract as the observer callback below)
      const id = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(id);
    }
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      setReady(Boolean(box && box.width > 0 && box.height > 0));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full">
      {ready ? children : null}
    </div>
  );
}
