"use client";

/**
 * Barcode lookup sheet .
 * Manual entry is the PRIMARY path (always works). Camera scanning uses the
 * platform BarcodeDetector API when available; otherwise an honest hint is
 * shown. Search hits /api/nutrition/barcode (local cache → Open Food Facts,
 * which caches the product into Foods) and hands the FoodRow to PortionSheet.
 *
 * State resets via the keyed inner component (no setState-in-effect).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Barcode, CameraOff, PackageSearch, ScanLine, Search } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { ApiError, apiGet } from "@/lib/api";
import type { FoodRow } from "@/components/nutrition/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Minimal typings for the platform BarcodeDetector API. */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

type SearchPhase = "idle" | "searching" | "notFound" | "offline" | "invalid";

export function BarcodeSheet({
  open,
  onOpenChange,
  onFoundFood,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoundFood: (food: FoodRow) => void;
}) {
  const { t } = useI18n();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="slim-scroll max-h-[90vh] overflow-y-auto rounded-t-3xl px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 pb-1">
          <SheetTitle className="flex items-center gap-2 text-start">
            <Barcode className="h-4 w-4 text-primary" aria-hidden />
            {t("nutrition.barcode.title")}
          </SheetTitle>
          <SheetDescription className="text-start">{t("nutrition.barcode.manualHint")}</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-6">
          {open && (
            <BarcodeInner
              key={`bc-${open}`}
              onFoundFood={(food) => {
                onOpenChange(false);
                onFoundFood(food);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BarcodeInner({ onFoundFood }: { onFoundFood: (food: FoodRow) => void }) {
  const { t } = useI18n();

  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<"unsupported" | "denied" | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  // Safety net: always release the camera when the sheet unmounts.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const search = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!/^\d{4,20}$/.test(value)) {
        haptic("heavy");
        setPhase("invalid");
        return;
      }
      setPhase("searching");
      try {
        const result = await apiGet<{ food: FoodRow; source: string }>(
          `/api/nutrition/barcode?code=${encodeURIComponent(value)}`
        );
        haptic("success");
        setPhase("idle");
        onFoundFood(result.food);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "PRODUCT_NOT_FOUND") setPhase("notFound");
          else if (err.code === "OFFLINE") setPhase("offline");
          else if (err.status === 400) setPhase("invalid");
          else toast.error(err.message || t("state.errorGeneric"));
        } else {
          toast.error(t("state.errorGeneric"));
        }
      }
    },
    [onFoundFood, t]
  );

  const startCamera = useCallback(async () => {
    haptic("light");
    const Ctor = getDetectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setCamError("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCamError(null);
      setScanning(true);
    } catch {
      setCamError("denied");
    }
  }, []);

  // Detect loop while the camera is on.
  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const Ctor = getDetectorCtor();
    if (!video || !stream || !Ctor) return;

    video.srcObject = stream;
    void video.play().catch(() => {});

    const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    let cancelled = false;
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      const el = videoRef.current;
      if (!el || el.readyState < 2) return;
      try {
        const hits = await detector.detect(el);
        if (!cancelled && hits.length > 0 && hits[0].rawValue) {
          cancelled = true;
          window.clearInterval(interval);
          haptic("success");
          stopCamera();
          void search(hits[0].rawValue);
        }
      } catch {
        /* transient detect errors — keep scanning */
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scanning, stopCamera, search]);

  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  return (
    <div className="space-y-4">
      {/* manual entry — the always-works primary path */}
      <div className="space-y-1.5">
        <Label htmlFor="barcode-input" className="text-xs font-medium text-muted-foreground">
          {t("nutrition.barcode.manual")}
        </Label>
        <div className="flex gap-2">
          <Input
            id="barcode-input"
            inputMode="numeric"
            dir="ltr"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 20));
              if (phase !== "idle") setPhase("idle");
            }}
            placeholder="6281006520049"
            aria-label={t("nutrition.barcode.manual")}
            className="tnum h-12 flex-1 rounded-xl"
          />
          <Button
            onClick={() => void search(code)}
            disabled={phase === "searching"}
            aria-label={t("action.search")}
            className="h-12 shrink-0 rounded-xl bg-gradient-accent font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            {phase === "searching" ? (
              <span className="tnum">{t("nutrition.barcode.searching")}</span>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden />
                {t("action.search")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* camera section */}
      {!supported ? (
        <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">
          <CameraOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("nutrition.barcode.unsupported")}
        </p>
      ) : scanning ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-2xl bg-black/90">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label={t("nutrition.barcode.scanning")}
              className="h-48 w-full object-cover"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded bg-primary shadow-[0_0_12px_var(--primary)]"
            />
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ScanLine className="h-4 w-4 animate-pulse text-primary" aria-hidden />
            {t("nutrition.barcode.scanning")}
          </p>
          <Button variant="outline" onClick={stopCamera} className="h-11 w-full rounded-2xl">
            {t("nutrition.barcode.stopScan")}
          </Button>
        </div>
      ) : (
        <>
          {camError === "denied" && (
            <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground" role="alert">
              <CameraOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("nutrition.barcode.cameraDenied")}
            </p>
          )}
          <Button variant="outline" onClick={() => void startCamera()} className="h-11 w-full rounded-2xl">
            <ScanLine className="h-4 w-4" aria-hidden />
            {t("nutrition.barcode.scan")}
          </Button>
        </>
      )}

      {/* search result feedback */}
      {phase === "notFound" && (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted/50 p-5 text-center">
          <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{t("nutrition.barcode.notFound")}</p>
          <p className="text-[11px] text-muted-foreground">{t("nutrition.addCustomFood")}</p>
        </div>
      )}
      {phase === "offline" && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-[11px] font-medium text-warning" role="alert">
          <CameraOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("nutrition.barcode.offline")}
        </p>
      )}
      {phase === "invalid" && (
        <p className="text-xs text-destructive" role="alert">
          {t("nutrition.barcode.invalid")}
        </p>
      )}
    </div>
  );
}
