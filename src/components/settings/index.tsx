"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n, useFormat, translateKey } from "@/lib/i18n";
import { addDaysToKey, dayKeyToWeekday, toLocalDateKey } from "@/lib/i18n/format";
import {
  useAppStore,
  type Accent,
  type LengthUnit,
  type ThemeMode,
  type WeekStart,
  type WeightUnit,
} from "@/lib/store/app-store";
import { apiGet, apiPatch, apiDelete, apiPost } from "@/lib/api";
import {
  customSwatchGradient,
  hexToHsl,
  hexToRgb255,
  hslToHex,
  hueDistance,
  normalizeHex,
  rgb255ToHex,
  type Rgb255,
} from "@/lib/theme/custom-color";
import { haptic } from "@/lib/haptics";
import { ApkSettingsBody, SHOW_APK_DOWNLOAD, SOURCE_ZIP_URL, SOURCE_ZIP_FILENAME } from "@/components/apk-download";
import { pushWidgetSnapshot } from "@/lib/widgets/bridge";
import WidgetsSettingsSection from "@/components/widgets/settings-section";
import { LanguageSheet, LanguageRowTrigger } from "@/components/settings/language-sheet";
import { AstnumLogo } from "@/components/shell/logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  Database,
  Download,
  ExternalLink,
  Github,
  Info,
  Languages,
  Minus,
  Moon,
  Palette,
  Plus,
  Ruler,
  ShieldAlert,
  Smartphone,
  Sun,
  SunMoon,
  Trash2,
  Upload,
} from "lucide-react";

const APP_VERSION = "1.24.0";
const KEEP_AWAKE_KEY = "astnum-gym-keep-awake";

interface MuscleGroupRow {
  id: string;
  nameAr: string;
  nameEn: string;
  weeklyTarget: number;
  region: string;
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </h3>
      <div className="mb-4 rounded-2xl border border-border/70 bg-card card-hi">{children}</div>
    </section>
  );
}

function Row({ label, sub, children }: { label: React.ReactNode; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ElementType }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex shrink-0 gap-1 rounded-full bg-muted/70 p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              haptic("light");
              onChange(opt.value);
            }}
            className={`flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors ${
              active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const ACCENTS: Array<{ value: Accent; labelKey: string; swatch: string; swatchClass?: string }> = [
  { value: "mint", labelKey: "settings.accent.mint", swatch: "linear-gradient(135deg,#22d3ee,#a3e635)" },
  { value: "amber", labelKey: "settings.accent.amber", swatch: "linear-gradient(135deg,#fbbf24,#f97316)" },
  { value: "rose", labelKey: "settings.accent.rose", swatch: "linear-gradient(135deg,#fb7185,#e11d48)" },
  { value: "violet", labelKey: "settings.accent.violet", swatch: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
  /* the RGB rainbow — a slowly spinning full hue wheel (same L/C as the
     live theme so the chip reads true); adores prefers-reduced-motion */
  {
    value: "rainbow",
    labelKey: "settings.accent.rainbow",
    swatch: `conic-gradient(from 180deg, ${Array.from(
      { length: 9 },
      (_, i) => `oklch(0.76 0.17 ${i * 45})`
    ).join(", ")})`,
    swatchClass: "rb-wheel",
  },
];

/* ── custom color picker — UNLIMITED colors ─────────── */

/** Rainbow guide for the hue dial — pure HSL hues (the picker space).
 *  13 stops = the full wheel at 30° steps. */
const HUE_RAINBOW = `linear-gradient(to right, ${Array.from(
  { length: 13 },
  (_, i) => `hsl(${i * 30} 100% 50%)`
).join(", ")})`;

/** One-tap stops spread across the wheel (includes brand hues). */
const QUICK_HUES = [0, 25, 48, 75, 105, 140, 168, 195, 220, 255, 295, 330];
const QUICK_HUE_SAT = 0.85;
const QUICK_HUE_LIGHT = 0.55;

/* RGB channel rows — direct 0-255 control over the exact color.
 * Track gradients sweep ONLY the edited channel against the live values of
 * the other two (pro-picker behavior: the row previews what moving it does). */
const RGB_CHANNELS = [
  {
    key: "r",
    label: "R",
    ariaKey: "settings.accent.chR",
    tint: "#ef4444",
    track: (c: Rgb255) => `linear-gradient(to right, rgb(0, ${c.g}, ${c.b}), rgb(255, ${c.g}, ${c.b}))`,
  },
  {
    key: "g",
    label: "G",
    ariaKey: "settings.accent.chG",
    tint: "#22c55e",
    track: (c: Rgb255) => `linear-gradient(to right, rgb(${c.r}, 0, ${c.b}), rgb(${c.r}, 255, ${c.b}))`,
  },
  {
    key: "b",
    label: "B",
    ariaKey: "settings.accent.chB",
    tint: "#3b82f6",
    track: (c: Rgb255) => `linear-gradient(to right, rgb(${c.r}, ${c.g}, 0), rgb(${c.r}, ${c.g}, 255))`,
  },
] as const;
type RgbKey = (typeof RGB_CHANNELS)[number]["key"];

function CustomAccentPicker() {
  const { t } = useI18n();
  const customColor = useAppStore((s) => s.customColor);
  const setCustomColor = useAppStore((s) => s.setCustomColor);
  const hsl = hexToHsl(customColor);
  const rgb = hexToRgb255(customColor);

  const fieldRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hexDraft, setHexDraft] = useState(customColor.replace(/^#/, ""));
  const [hexFocused, setHexFocused] = useState(false);

  /* RGB numeric drafts — kept in sync with the live color EXCEPT the channel
   * the user is currently editing (same contract as the hex draft). */
  const [rgbDrafts, setRgbDrafts] = useState<Record<RgbKey, string>>({
    r: String(rgb.r),
    g: String(rgb.g),
    b: String(rgb.b),
  });
  const [focusedCh, setFocusedCh] = useState<RgbKey | null>(null);

  // keep the hex draft in sync while the user is not editing it
  // (deferred via queueMicrotask — react-hooks/set-state-in-effect)
  useEffect(() => {
    if (!hexFocused) queueMicrotask(() => setHexDraft(customColor.replace(/^#/, "")));
  }, [customColor, hexFocused]);

  // keep the RGB drafts in sync while their channel is not focused
  useEffect(() => {
    queueMicrotask(() =>
      setRgbDrafts((prev) => ({
        r: focusedCh === "r" ? prev.r : String(rgb.r),
        g: focusedCh === "g" ? prev.g : String(rgb.g),
        b: focusedCh === "b" ? prev.b : String(rgb.b),
      }))
    );
  }, [rgb.r, rgb.g, rgb.b, focusedCh]);

  const applyHsl = (h: number, s: number, l: number) => setCustomColor(hslToHex(h, s, l));

  /* move one RGB channel (slider or numeric commit) — the other two keep
   * their live values, so the three rows always describe the exact color */
  const applyRgbChannel = (key: RgbKey, v: number) =>
    setCustomColor(rgb255ToHex({ ...rgb, [key]: v }));

  const commitRgbChannel = (key: RgbKey) => {
    const raw = rgbDrafts[key].trim();
    const parsed = parseInt(raw, 10);
    if (raw !== "" && /^\d{1,3}$/.test(raw) && Number.isFinite(parsed)) {
      const v = Math.max(0, Math.min(255, parsed));
      setRgbDrafts((p) => ({ ...p, [key]: String(v) }));
      applyRgbChannel(key, v);
      haptic("light");
    } else {
      setRgbDrafts((p) => ({ ...p, [key]: String(rgb[key]) }));
    }
  };

  /* x = saturation, y = 1 − lightness (classic color-field geometry) */
  const updateFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = fieldRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    applyHsl(hsl.h, x, 1 - y);
  };

  /* keyboard: arrows nudge saturation/lightness (Shift = bigger steps) */
  const onFieldKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.08 : 0.02;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyHsl(hsl.h, hsl.s - step, hsl.l);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyHsl(hsl.h, hsl.s + step, hsl.l);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      applyHsl(hsl.h, hsl.s, hsl.l + step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyHsl(hsl.h, hsl.s, hsl.l - step);
    }
  };

  const commitHex = () => {
    const normalized = normalizeHex(hexDraft);
    if (normalized) {
      setCustomColor(normalized);
      haptic("light");
    } else {
      setHexDraft(customColor.replace(/^#/, ""));
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
      {/* live preview — the traced mark re-colors while dragging */}
      <div className="flex items-center gap-3">
        <AstnumLogo size={44} glow={false} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("settings.accent.custom")}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {t("settings.accent.customHint")}
          </p>
        </div>
        <span
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-full border-2 border-border"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-to))" }}
        />
      </div>

      {/* saturation × lightness field — the entire gamut under the thumb */}
      <div
        ref={fieldRef}
        dir="ltr"
        tabIndex={0}
        role="slider"
        aria-label={t("settings.accent.fieldLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsl.s * 100)}
        aria-valuetext={customColor}
        onKeyDown={onFieldKeyDown}
        onPointerDown={(e) => {
          fieldRef.current?.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          updateFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromPointer(e);
        }}
        onPointerUp={() => {
          if (draggingRef.current) {
            draggingRef.current = false;
            haptic("light");
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className="relative mt-4 h-36 w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-border/70 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{
          background:
            "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), " +
            `hsl(${hsl.h} 100% 50%)`,
        }}
      >
        {/* clamp keeps the 20px marker fully visible at the field edges
            (center stops 10px short of each border, like a native thumb) */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.5)]"
          style={{
            left: `clamp(10px, ${hsl.s * 100}%, calc(100% - 10px))`,
            top: `clamp(10px, ${(1 - hsl.l) * 100}%, calc(100% - 10px))`,
            background: customColor,
          }}
        />
      </div>

      {/* hue dial over a rainbow guide — dir=ltr: hue is a value axis */}
      <div className="relative mt-3 h-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0.5 top-1/2 h-3.5 -translate-y-1/2 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)]"
          style={{ background: HUE_RAINBOW }}
        />
        <input
          type="range"
          dir="ltr"
          min={0}
          max={359}
          step={1}
          value={Math.round(hsl.h)}
          onChange={(e) => applyHsl(Number(e.target.value), hsl.s, hsl.l)}
          onPointerUp={() => haptic("light")}
          onKeyUp={() => haptic("light")}
          aria-label={t("settings.accent.hueLabel")}
          className="hue-slider absolute inset-0 h-7 w-full"
        />
      </div>

      {/* quick hue stops */}
      <div className="mt-3 flex flex-wrap justify-between gap-1.5" role="group" aria-label={t("settings.accent.hueLabel")}>
        {QUICK_HUES.map((h) => {
          const dotHex = hslToHex(h, QUICK_HUE_SAT, QUICK_HUE_LIGHT);
          const active = hsl.s > 0.1 && hueDistance(hsl.h, h) < 8;
          return (
            <button
              key={h}
              type="button"
              onClick={() => {
                haptic("light");
                setCustomColor(dotHex);
              }}
              aria-label={`${t("settings.accent.hueLabel")} ${h}`}
              aria-pressed={active}
              className={`h-7 w-7 rounded-full border-2 transition-transform duration-150 active:scale-90 ${
                active ? "scale-110 border-foreground" : "border-transparent hover:scale-105"
              }`}
              style={{ background: dotHex }}
            />
          );
        })}
      </div>

      {/* RGB channels — direct 0-255 control over the exact color */}
      <div className="mt-3" role="group" aria-label={t("settings.accent.rgb")}>
        {RGB_CHANNELS.map(({ key, label, ariaKey, tint, track }) => (
          <div key={key} className="mt-2 flex items-center gap-2.5" dir="ltr">
            <span
              aria-hidden
              className="w-3 shrink-0 text-center font-mono text-xs font-bold"
              style={{ color: tint }}
            >
              {label}
            </span>
            <div className="relative h-6 min-w-0 flex-1">
              {/* channel guide — sweeps only this channel against the live
                  values of the other two */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0.5 top-1/2 h-3 -translate-y-1/2 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]"
                style={{ background: track(rgb) }}
              />
              <input
                type="range"
                dir="ltr"
                min={0}
                max={255}
                step={1}
                value={rgb[key]}
                onChange={(e) => applyRgbChannel(key, Number(e.target.value))}
                onPointerUp={() => haptic("light")}
                onKeyUp={() => haptic("light")}
                aria-label={t(ariaKey)}
                aria-valuetext={String(rgb[key])}
                className="rgb-slider absolute inset-0 h-6 w-full"
                style={{ "--rgb-thumb": customColor } as React.CSSProperties}
              />
            </div>
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={rgbDrafts[key]}
              onChange={(e) =>
                setRgbDrafts((p) => ({ ...p, [key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) }))
              }
              onFocus={() => setFocusedCh(key)}
              onBlur={() => {
                setFocusedCh(null);
                commitRgbChannel(key);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              aria-label={t(ariaKey)}
              autoComplete="off"
              spellCheck={false}
              className="tnum h-8 w-11 shrink-0 rounded-lg border border-input bg-muted/50 px-1 text-center font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ))}
      </div>

      {/* exact hex code — any of the 16.7M colors */}
      <div className="mt-3 flex items-center gap-2.5">
        <label htmlFor="custom-accent-hex" className="shrink-0 text-xs font-medium text-muted-foreground">
          {t("settings.accent.hexLabel")}
        </label>
        <div
          dir="ltr"
          className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-lg border border-input bg-muted/50 px-2 focus-within:ring-2 focus-within:ring-ring"
        >
          <span aria-hidden className="font-mono text-sm text-muted-foreground">#</span>
          <input
            id="custom-accent-hex"
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
            onFocus={() => setHexFocused(true)}
            onBlur={() => {
              setHexFocused(false);
              commitHex();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="33ebb6"
            className="tnum w-full min-w-0 bg-transparent font-mono text-sm uppercase outline-none placeholder:text-muted-foreground/50"
            aria-label={t("settings.accent.hexLabel")}
            autoComplete="off"
            spellCheck={false}
          />
          <span
            aria-hidden
            className="ms-auto h-5 w-5 shrink-0 rounded-full border border-border"
            style={{ background: customColor }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── v2.4 calendar editor: live month-grid preview ──────────────────────
 * Structure-only preview (NO data dots/queries) — it demonstrates the
 * week-start shift + weekday-header rotation exactly like the calendar
 * sheet and the month widget render it. Reads the store directly, so it
 * re-renders instantly as the user taps a different week start. */
function CalendarPreview() {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const weekStart = useAppStore((s) => s.calendarWeekStart);

  const { dow, cells } = useMemo(() => {
    const todayKey = toLocalDateKey();
    const first = `${todayKey.slice(0, 8)}01`; // first of the CURRENT month
    // the same math as calendar-sheet.tsx + the widget snapshot builder
    const start = addDaysToKey(first, -((dayKeyToWeekday(first) - weekStart + 7) % 7));
    const prefix = first.slice(0, 8);
    return {
      dow: Array.from(
        { length: 7 },
        (_, i) => translateKey(lang, `gym.dayShort.${(i + weekStart) % 7}`)
      ),
      cells: Array.from({ length: 42 }, (_, i) => {
        const key = addDaysToKey(start, i);
        return {
          key,
          day: key.slice(8, 10),
          inMonth: key.startsWith(prefix),
          isToday: key === todayKey,
        };
      }),
    };
  }, [lang, weekStart]);

  return (
    <div className="border-t border-border/50 px-4 py-3">
      <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
        {t("settings.calendar.preview")}
      </p>
      {/* decorative — the real calendar sheet carries the semantics */}
      <div aria-hidden className="mx-auto w-full max-w-[196px]">
        <div className="grid grid-cols-7 gap-0.5">
          {dow.map((d) => (
            <span
              key={d}
              className="py-0.5 text-center text-[9px] font-bold text-muted-foreground"
            >
              {d}
            </span>
          ))}
          {cells.map((c) => (
            <div
              key={c.key}
              className={`flex aspect-square items-center justify-center rounded-xl text-[10px] font-medium ${
                c.isToday
                  ? "bg-primary font-bold text-primary-foreground"
                  : c.inMonth
                    ? "text-foreground"
                    : "opacity-0"
              }`}
            >
              {fmt.number(Number(c.day))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SettingsSheet() {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const store = useAppStore();
  const queryClient = useQueryClient();

  const [keepAwake, setKeepAwake] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [langSheet, setLangSheet] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // defer state resets so they never run synchronously inside the effect
      // (react-hooks/set-state-in-effect — same pattern as the other sheets)
      queueMicrotask(() => {
        try {
          setKeepAwake(window.localStorage.getItem(KEEP_AWAKE_KEY) !== "0");
        } catch {
          setKeepAwake(true);
        }
        setConfirmText("");
      });
    }
  }, [open]);

  const musclesQ = useQuery({
    queryKey: ["muscles-groups"],
    queryFn: () => apiGet<{ muscles: MuscleGroupRow[] }>("/api/muscles"),
    enabled: open,
  });

  const targetMutation = useMutation({
    mutationFn: ({ id, weeklyTarget }: { id: string; weeklyTarget: number }) =>
      apiPatch("/api/muscles/targets", { muscleId: id, weeklyTarget }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["muscles-groups"] }),
  });

  const wipeMutation = useMutation({
    mutationFn: () => apiDelete("/api/backup?confirm=DELETE"),
    onSuccess: () => {
      haptic("success");
      toast.success(t("settings.deleteAll") + " — " + t("state.saved"));
      queryClient.invalidateQueries();
      setOpen(false);
    },
    onError: () => toast.error(t("state.errorGeneric")),
  });

  const doExport = async () => {
    haptic("medium");
    try {
      const payload = await apiGet<Record<string, unknown>>("/api/backup");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("settings.export.file")}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("settings.exportSuccess"));
    } catch {
      toast.error(t("state.errorGeneric"));
    }
  };

  const doImport = async (file: File) => {
    haptic("medium");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      await apiPost("/api/backup", parsed);
      toast.success(t("settings.importSuccess"));
      queryClient.invalidateQueries();
      setOpen(false);
    } catch {
      toast.error(t("settings.importError"));
    }
  };

  const muscleName = (m: MuscleGroupRow) => (lang === "ar" ? m.nameAr : m.nameEn);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="inset-x-0 mx-auto max-h-[88vh] rounded-t-3xl border-t-2 border-primary/30 bg-background"
      >
        <div className="mx-auto max-h-[84vh] w-full max-w-md overflow-y-auto slim-scroll px-4 pb-10 pt-2">
          <SheetHeader className="px-0">
            <SheetTitle className="flex items-center gap-2 text-lg font-bold">
              <AstnumLogo size={26} glow={false} />
              {t("settings.title")}
              <span className="tnum ms-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                v{APP_VERSION}
              </span>
            </SheetTitle>
          </SheetHeader>

          {/* Language — 160 languages (v1.23) */}
          <Section icon={Languages} title={t("settings.language")}>
            <Row label={t("misc.language")}>
              <LanguageRowTrigger onOpen={() => setLangSheet(true)} />
            </Row>
          </Section>

          {/* Appearance */}
          <Section icon={Palette} title={t("settings.appearance")}>
            <Row label={t("misc.theme")}>
              <Segmented<ThemeMode>
                value={store.themeMode}
                onChange={store.setThemeMode}
                options={[
                  { value: "dark", label: t("settings.theme.dark"), icon: Moon },
                  { value: "light", label: t("settings.theme.light"), icon: Sun },
                  { value: "system", label: t("settings.theme.system"), icon: SunMoon },
                ]}
              />
            </Row>
            <div className="border-t border-border/50 px-4 py-3">
              <p className="mb-2 text-sm font-medium">{t("settings.accent")}</p>
              <div className="flex gap-2" role="radiogroup" aria-label={t("settings.accent")}>
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={store.accent === a.value}
                    aria-label={t(a.labelKey)}
                    onClick={() => {
                      haptic("light");
                      store.setAccent(a.value);
                    }}
                    className={`relative flex h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl border transition-all ${
                      store.accent === a.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full ${a.swatchClass ?? ""}`}
                      style={{ background: a.swatch }}
                      aria-hidden
                    />
                    {store.accent === a.value && (
                      <Check className="absolute end-1 top-1 h-3 w-3 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
                {/* 5th chip — the custom hue picker */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={store.accent === "custom"}
                  aria-label={t("settings.accent.custom")}
                  onClick={() => {
                    haptic("light");
                    store.setAccent("custom");
                  }}
                  className={`relative flex h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl border transition-all ${
                    store.accent === "custom"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{
                      background:
                        "conic-gradient(from 180deg, oklch(0.75 0.19 0), oklch(0.84 0.16 85), oklch(0.78 0.15 175), oklch(0.72 0.17 260), oklch(0.74 0.19 305), oklch(0.75 0.19 359))",
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full outline outline-2 outline-background"
                      style={{ background: customSwatchGradient(store.customColor) }}
                    />
                  </span>
                  {store.accent === "custom" && (
                    <Check className="absolute end-1 top-1 h-3 w-3 text-primary" aria-hidden />
                  )}
                </button>
              </div>

              {/* expands only while the custom accent is active */}
              <AnimatePresence initial={false}>
                {store.accent === "custom" && (
                  <motion.div
                    key="custom-accent-picker"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <CustomAccentPicker />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Section>

          {/* Units */}
          <Section icon={Ruler} title={t("settings.units")}>
            <Row label={t("settings.units.weight")}>
              <Segmented<WeightUnit>
                value={store.weightUnit}
                onChange={store.setWeightUnit}
                options={[
                  { value: "kg", label: t("unit.kg") },
                  { value: "lb", label: t("unit.lb") },
                ]}
              />
            </Row>
            <Row label={t("settings.units.length")}>
              <Segmented<LengthUnit>
                value={store.lengthUnit}
                onChange={store.setLengthUnit}
                options={[
                  { value: "cm", label: t("unit.cm") },
                  { value: "in", label: t("unit.in") },
                ]}
              />
            </Row>
            <Row label={t("settings.keepAwake")} sub={t("gym.title")}>
              <Switch
                checked={keepAwake}
                onCheckedChange={(v) => {
                  haptic("light");
                  setKeepAwake(v);
                  try {
                    window.localStorage.setItem(KEEP_AWAKE_KEY, v ? "1" : "0");
                  } catch {
                    /* private mode */
                  }
                }}
                aria-label={t("settings.keepAwake")}
              />
            </Row>
          </Section>

          {/* Calendar — week start + day marks (v2.4 editor) */}
          <Section icon={CalendarDays} title={t("settings.calendar")}>
            <Row label={t("settings.calendar.weekStart")} sub={t("settings.calendar.weekStartHint")}>
              {/* Segmented fires the light haptic itself before onChange; the
                  widget snapshot is re-pushed so the placed calendar widget
                  re-renders with the new week start immediately. */}
              <Segmented<WeekStart>
                value={store.calendarWeekStart}
                onChange={(v) => {
                  store.setCalendarWeekStart(v);
                  void pushWidgetSnapshot();
                }}
                options={[
                  { value: 0, label: translateKey(lang, "gym.dayShort.0") },
                  { value: 1, label: translateKey(lang, "gym.dayShort.1") },
                  { value: 6, label: translateKey(lang, "gym.dayShort.6") },
                ]}
              />
            </Row>

            <div className="border-t border-border/50 bg-muted/30 px-4 py-2">
              <p className="text-[11px] font-bold text-muted-foreground">
                {t("settings.calendar.marks")}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/80">
                {t("settings.calendar.marksHint")}
              </p>
            </div>
            <Row
              label={
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {t("settings.calendar.markSession")}
                </span>
              }
            >
              <Switch
                checked={store.calendarMarks.session}
                onCheckedChange={(v) => {
                  haptic("light");
                  store.setCalendarMarks({ session: v });
                  void pushWidgetSnapshot();
                }}
                aria-label={t("settings.calendar.markSession")}
              />
            </Row>
            <Row
              label={
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
                  {t("settings.calendar.markTask")}
                </span>
              }
            >
              <Switch
                checked={store.calendarMarks.task}
                onCheckedChange={(v) => {
                  haptic("light");
                  store.setCalendarMarks({ task: v });
                  void pushWidgetSnapshot();
                }}
                aria-label={t("settings.calendar.markTask")}
              />
            </Row>
            <Row
              label={
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lime-500" aria-hidden />
                  {t("settings.calendar.markHabit")}
                </span>
              }
            >
              <Switch
                checked={store.calendarMarks.habit}
                onCheckedChange={(v) => {
                  haptic("light");
                  store.setCalendarMarks({ habit: v });
                  void pushWidgetSnapshot();
                }}
                aria-label={t("settings.calendar.markHabit")}
              />
            </Row>

            <CalendarPreview />
          </Section>

          {/* Muscle targets */}
          <Section icon={Smartphone} title={t("settings.muscleTargets")}>
            {musclesQ.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto slim-scroll">
                {(musclesQ.data?.muscles ?? []).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between border-b border-border/40 px-4 py-2 last:border-b-0"
                  >
                    <span className="text-sm">{muscleName(m)}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`${m.nameEn} -`}
                        onClick={() =>
                          targetMutation.mutate({ id: m.id, weeklyTarget: Math.max(4, m.weeklyTarget - 1) })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-accent"
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </button>
                      <span className="tnum w-8 text-center text-sm font-bold">{fmt.number(m.weeklyTarget)}</span>
                      <button
                        type="button"
                        aria-label={`${m.nameEn} +`}
                        onClick={() =>
                          targetMutation.mutate({ id: m.id, weeklyTarget: Math.min(40, m.weeklyTarget + 1) })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-accent"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Data */}
          <Section icon={Database} title={t("settings.data")}>
            <button
              type="button"
              onClick={doExport}
              className="flex min-h-12 w-full items-center gap-3 border-b border-border/50 px-4 py-2 text-start transition-colors hover:bg-accent/40"
            >
              <Download className="h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t("settings.backup.export")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-12 w-full items-center gap-3 border-b border-border/50 px-4 py-2 text-start transition-colors hover:bg-accent/40"
            >
              <Upload className="h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t("settings.backup.import")}</span>
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void doImport(file);
                e.target.value = "";
              }}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-danger/10"
                >
                  <Trash2 className="h-4.5 w-4.5 shrink-0 text-danger" aria-hidden />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-danger">{t("settings.deleteAll")}</span>
                    <span className="block text-xs text-muted-foreground">{t("settings.deleteAllDesc")}</span>
                  </span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-sm rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-danger" aria-hidden />
                    {t("settings.deleteAllConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{t("settings.deleteAllConfirmBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-muted/50 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={t("settings.deleteAllConfirmWord")}
                  aria-label={t("settings.deleteAllConfirmWord")}
                />
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel className="rounded-xl">{t("action.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={confirmText.trim() !== t("settings.deleteAllConfirmWord").trim()}
                    onClick={(e) => {
                      e.preventDefault();
                      wipeMutation.mutate();
                    }}
                    className="rounded-xl bg-danger text-white hover:bg-danger/90"
                  >
                    {t("action.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Section>

          {/* Home-screen widgets — APK build only (renders nothing on web) */}
          <WidgetsSettingsSection />

          {/* Android APK download — web preview only (auto-stripped from the APK build) */}
          {SHOW_APK_DOWNLOAD && (
            <Section icon={Smartphone} title={t("apk.section")}>
              <ApkSettingsBody />
            </Section>
          )}

          {/* Open source — source ZIP + GitHub (web preview) */}
          {SHOW_APK_DOWNLOAD && (
            <Section icon={Github} title={t("apk.sourceTitle")}>
              <div className="px-1 pb-1">
                <p className="pb-2 text-xs leading-relaxed text-muted-foreground">
                  {t("apk.sourceBody")}
                </p>
                <a
                  href={SOURCE_ZIP_URL}
                  download={SOURCE_ZIP_FILENAME}
                  onClick={() => {
                    haptic("medium");
                    toast.success(t("apk.started"), { duration: 5000 });
                  }}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-5 text-sm font-bold text-primary transition-transform active:scale-95"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {t("apk.sourceZip")}
                </a>
                <p className="pt-1.5 text-center text-[10px] text-muted-foreground">
                  {t("apk.sourceZipHint")}
                </p>
              </div>
            </Section>
          )}

          {/* About */}
          <Section icon={Info} title={t("settings.about")}>
            <Row label={t("settings.about.version")}>
              <span className="tnum text-sm text-muted-foreground">{APP_VERSION}</span>
            </Row>
            <Row label={t("settings.github")} sub="github.com/btwstar">
              <a
                href="https://github.com/btwstar"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("settings.githubOpen")}
                onClick={() => haptic("light")}
                className="flex min-h-10 items-center gap-2 rounded-xl bg-muted/60 px-3.5 text-sm font-bold transition-all hover:bg-accent active:scale-95"
              >
                <Github className="h-4 w-4" aria-hidden />
                <span dir="ltr">btwstar</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
              </a>
            </Row>
            <div className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-2 font-semibold text-foreground">{t("settings.about.privacy")}</p>
              <p>{t("settings.about.privacyBody")}</p>
            </div>
          </Section>
        </div>

        {/* 160-language picker — mounts on top of the settings sheet */}
        <LanguageSheet open={langSheet} onOpenChange={setLangSheet} />
      </SheetContent>
    </Sheet>
  );
}
