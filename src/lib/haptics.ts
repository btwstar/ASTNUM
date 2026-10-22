/**
 * Haptic feedback — web implementation uses the Vibration API.
 * In the Capacitor build this maps 1:1 to @capacitor/haptics
 * (Haptics.impact({ style: LIGHT|MEDIUM|HEAVY }) / Haptics.notification()).
 */

export type HapticStyle = "light" | "medium" | "heavy" | "success" | "pr";

const PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 8,
  medium: 18,
  heavy: 32,
  success: [12, 60, 12],
  pr: [30, 40, 30, 40, 80],
};

export function haptic(style: HapticStyle = "light"): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate === "function") {
    try {
      nav.vibrate(PATTERNS[style]);
    } catch {
      /* silently ignore unsupported platforms */
    }
  }
}
