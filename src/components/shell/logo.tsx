"use client";

import React, { useId } from "react";

/**
 * ASTNUM mark — fox head fused with a dumbbell.
 *
 * Traced pixel-exact (IoU 0.987, RDP ε=1.5) from the user's uploaded neon
 * icon: aggressive angular mask, negative-space eyes (evenodd cutouts),
 * flame crest, tall ears, pill plates + connector bars. Gradient fitted
 * from the source by regression — nearly horizontal cyan → mint green.
 * Contract-compatible with the previous mark: { size, className, glow }.
 */

/* 140×140 viewBox, 9 subpaths incl. the two eye cutouts. */
const MARK_D =
  "M110.3 72.3 109.7 72.8 109.9 95.7 110.3 95.9 112.6 95.9 114.2 95.5 115.7 93.7 116 92.6 116.1 76.4 115.4 74.2 114.3 73 112.6 72.3 Z " +
  "M27.1 72.3 25.2 73.1 24.2 74.2 23.6 75.9 23.6 92.3 23.9 93.4 25.3 95.3 27.1 95.9 29.6 95.9 30.1 95.6 30.3 73 29.6 72.3 Z " +
  "M55.9 70.6 53.1 73.1 50.7 76 48.5 80.2 47.4 83.4 47.1 85.6 47.1 88.9 47.8 92.4 48.1 92.8 48.8 95.3 49.6 96.3 50.1 97.8 51.9 100.3 56 104.3 56.6 104.4 57.8 105.7 59.6 106.8 64.2 110.5 67.5 114 70 117.4 72.5 113.8 76.3 110 77.1 109.5 78.6 108.1 79.3 107.8 79.9 107 81.1 106.4 82.1 105.3 84.3 103.7 87.1 100.8 89.3 97.9 90.9 94.1 91.4 93.3 92.2 89.8 92.3 86.1 91.8 81.3 91.5 80.8 91.3 80.9 89.9 83.4 87.5 86.1 80.2 92.9 73.1 99.9 70 104.5 68.5 107.8 67.2 107.7 64.1 106.6 62.1 105.1 60.6 101 60.6 99.8 61 99.4 56.7 95 54.9 92.4 53.9 90 53.6 86.4 54 83.1 55.5 79.7 58.2 75.7 59.3 72.9 59.1 72.3 57.5 71.8 Z " +
  "M99.7 66.5 98.8 67.1 98.6 67.8 98.6 80.3 93.7 80.4 93.8 87.5 98.4 87.5 98.6 87.8 98.7 100 99.3 100.9 103 101.1 104.5 100.9 105.7 100.4 107 98.8 107.7 97 107.7 69.6 107.5 68.7 106.5 67.3 105.7 66.8 104.8 66.5 Z " +
  "M35.1 66.5 34.1 66.9 32.9 67.9 32.4 69.3 32.4 97.1 32.9 98.8 35.1 100.8 37.1 101.1 39.5 101.1 40.5 100.9 41.2 100 41.1 93 41.3 87.6 46 87.4 44.9 87.2 44.4 86.7 44.4 85.4 45.1 84.5 46 84.2 46.1 80.4 41.4 80.4 41.2 80 41.3 68.2 41.1 67.2 40.1 66.5 Z " +
  "M92.1 65.5 91.8 65.8 91 65.6 89.9 67.2 86.9 70.2 80.9 75.4 65.6 91 64.8 90.8 58.8 85.4 57.3 84.3 57.5 89.8 58.9 93.4 60.4 95.5 66.9 102.2 79.4 88.6 87 81.2 89.6 77.6 91.1 74.1 91.4 73.9 92 72 92.4 69 92.4 66.5 Z " +
  "M68.1 18.9 69.1 21 69.4 22.4 69.3 24.8 68.7 26.8 66.9 29.5 60.2 36.2 59.2 37.7 57.9 40.6 57.5 40.6 53.7 37.2 52.9 36.8 50.7 34.8 45.2 30.8 44.2 40.6 44.3 44.9 44.8 47.1 45.7 49.6 46.4 50.6 46.6 51.1 48.9 53.5 48.9 53.9 45.7 57.3 43.8 60.6 47.7 61.4 52.2 63.1 56.5 65.4 58.7 67 62.5 70.2 64.8 72.6 67.9 76.5 69.8 79.5 70 79.5 72.2 76 76 71.5 81.5 66.7 85.5 64.1 88.5 62.6 92.2 61.4 95.9 60.7 95.5 59.3 93.6 56.5 91 53.9 91 53.5 93.4 51.1 95 47.7 95.5 45.8 95.6 39.3 95.3 35.3 95 34.3 95.1 32.8 94.8 30.9 94.6 30.8 84.8 38.3 80.5 42.6 78.1 44.7 77.7 44.7 77.6 44 79.3 40.5 79.9 36.5 79.7 33.6 78.8 29.9 77.1 26.6 75.1 23.9 72 21 Z " +
  "M92.3 37.2 92.6 38 92.6 43.5 91.9 47.3 89.9 49.8 89.3 51 88.5 51.7 88 53 87.2 53.7 86.7 54.8 84.5 57 84.3 57.7 82.8 58.8 77.5 62 74.2 66 73.7 66.1 73.6 65.3 75.2 59.5 81.6 55.4 84.6 53.8 85.6 52.9 84.8 51.7 84.2 49.5 84.2 47.9 84.7 46 87.3 42.2 88.3 41.4 88.4 40.9 89.9 39.4 90.7 38.2 91.9 37.2 Z " +
  "M47.7 37.1 48.5 37.3 52.4 41.9 52.6 42.5 53.6 43.4 55.3 46.1 55.8 49 55.3 51.1 54.3 53 64.5 59.4 66.3 65.4 66.3 66.4 65.6 66.2 62.5 62.1 56 58.3 54 56.8 52.4 55.2 51.2 52.2 50.6 51.7 50.1 50.4 48 47.2 47.3 43.4 47.4 37.3 Z";

export function AstnumLogo({
  size = 120,
  className,
  glow = true,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  const uid = useId().replace(/[:]/g, "");
  const gradId = `astnum-grad-${uid}`;
  const glowId = `astnum-glow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="ASTNUM"
    >
      <defs>
        {/* Gradient follows the app accent theme: stops read the live CSS
            custom properties (--grad-from / --grad-to) — the mark re-colors
            instantly with every accent switch and the custom hue picker. */}
        <linearGradient id={gradId} x1="25.8" y1="76.3" x2="97.8" y2="78.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--grad-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--grad-to)" }} />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={glow ? `url(#${glowId})` : undefined}>
        <path d={MARK_D} fill={`url(#${gradId})`} fillRule="evenodd" />
      </g>
    </svg>
  );
}

/** Small gradient wordmark for the header. */
export function AstnumWordmark({ className }: { className?: string }) {
  return (
    <span className={`text-gradient font-bold tracking-tight ${className ?? ""}`} aria-label="ASTNUM">
      ASTNUM
    </span>
  );
}
