"use client";

/**
 * Progress photos .
 * 2-col grid, canvas-compressed (≤800px JPEG q0.72 → data URL), optional
 * SHA-256 PIN lock (Settings key "photo_pin"), honest manage-lock UI.
 */
import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Camera, Delete, ImageOff, Lock, LockOpen, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { sha256Hex } from "@/components/body/sha256";

interface PhotoRow {
  id: string;
  date: string;
  filePath: string;
}

const MAX_DIM = 800;
const QUALITY = 0.72;
const MAX_DATA_URL = 400 * 1024;

/** Resize to ≤800px JPEG (quality 0.72, retried) → data URL. */
async function compressImage(file: File): Promise<string> {
  return compressImageToDataUrl(file, {
    maxDim: MAX_DIM,
    quality: QUALITY,
    maxDataUrl: MAX_DATA_URL,
  });
}

// ─────────────────────────── PIN pad ───────────────────────────

function PinPad({
  titleKey,
  subtitleKey,
  onComplete,
  error,
  clearSignal,
}: {
  titleKey: string;
  subtitleKey: string;
  onComplete: (pin: string) => void;
  error: boolean;
  clearSignal: number;
}) {
  const { t } = useI18n();
  const [digits, setDigits] = useState("");

  useEffect(() => {
    // Defer the reset so we don't setState synchronously inside the effect.
    queueMicrotask(() => setDigits(""));
  }, [clearSignal]);

  const press = (d: string) => {
    if (digits.length >= 4) return;
    haptic("light");
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      haptic("medium");
      onComplete(next);
    }
  };

  const back = () => {
    haptic("light");
    setDigits((s) => s.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="text-center">
        <p className="text-base font-semibold">{t(titleKey)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t(subtitleKey)}</p>
      </div>

      <motion.div
        key={`${clearSignal}-${error}`}
        animate={error ? { x: [0, -10, 10, -7, 7, 0] } : {}}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3"
        role="status"
        aria-live="polite"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${
              i < digits.length ? "border-primary bg-primary" : "border-border bg-transparent"
            }`}
          />
        ))}
      </motion.div>

      {error && <p className="text-sm font-medium text-danger">{t("body.photoLock.wrong")}</p>}

      <div className="mt-1 grid w-full max-w-xs grid-cols-3 gap-3" role="group">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            aria-label={d}
            className="tnum flex h-14 items-center justify-center rounded-2xl bg-muted/60 text-xl font-semibold transition-all duration-150 hover:bg-accent active:scale-95"
          >
            {d}
          </button>
        ))}
        <span aria-hidden />
        <button
          type="button"
          onClick={() => press("0")}
          aria-label="0"
          className="tnum flex h-14 items-center justify-center rounded-2xl bg-muted/60 text-xl font-semibold transition-all duration-150 hover:bg-accent active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          aria-label={t("action.back")}
          className="flex h-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground transition-all duration-150 hover:bg-accent active:scale-95"
        >
          <Delete className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── main ───────────────────────────

export function ProgressPhotos() {
  const { t } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => apiGet<Record<string, string>>("/api/settings"),
  });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["body-photos"],
    queryFn: () => apiGet<{ photos: PhotoRow[] }>("/api/body/photos"),
  });

  const pinHash = (settings?.photo_pin ?? "").trim();
  const hasPin = pinHash.length > 0;

  const [unlocked, setUnlocked] = useState(false);
  const [gateError, setGateError] = useState(false);
  const [gateClear, setGateClear] = useState(0);
  const [processing, setProcessing] = useState(false);

  // manage lock
  const [manageOpen, setManageOpen] = useState(false);
  const [manageAction, setManageAction] = useState<"set" | "change" | "remove" | null>(null);
  const [manageStage, setManageStage] = useState<"first" | "second">("first");
  const [manageFirstPin, setManageFirstPin] = useState("");
  const [manageError, setManageError] = useState(false);
  const [manageClear, setManageClear] = useState(0);

  // preview + delete
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhotoRow | null>(null);

  const photos = data?.photos ?? [];

  const tryUnlock = (pin: string) => {
    if (sha256Hex(pin) === pinHash) {
      haptic("success");
      setGateError(false);
      setUnlocked(true);
    } else {
      haptic("heavy");
      setGateError(true);
      setGateClear((n) => n + 1);
    }
  };

  const savePin = async (pin: string) => {
    try {
      await apiPost("/api/settings", { entries: { photo_pin: sha256Hex(pin) } });
      await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      haptic("success");
      toast.success(t("body.photoLock.saved"));
      setManageOpen(false);
      setManageAction(null);
      setUnlocked(true); // just set a new pin → stay unlocked in this session
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    }
  };

  const removePin = async () => {
    try {
      await apiPost("/api/settings", { entries: { photo_pin: "" } });
      await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      haptic("success");
      toast.success(t("body.photoLock.removed"));
      setManageOpen(false);
      setManageAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    }
  };

  const onManageComplete = (pin: string) => {
    if (manageAction === "remove") {
      if (sha256Hex(pin) === pinHash) {
        void removePin();
      } else {
        haptic("heavy");
        setManageError(true);
        setManageClear((n) => n + 1);
      }
      return;
    }
    // set / change
    if (manageStage === "first") {
      setManageFirstPin(pin);
      setManageStage("second");
      setManageClear((n) => n + 1);
    } else {
      if (pin === manageFirstPin) {
        void savePin(pin);
      } else {
        haptic("heavy");
        setManageError(true);
        setManageStage("first");
        setManageFirstPin("");
        setManageClear((n) => n + 1);
      }
    }
  };

  const addPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("body.photos.invalidFile"));
      return;
    }
    setProcessing(true);
    try {
      const dataUrl = await compressImage(file);
      await apiPost("/api/body/photos", { date: fmt.todayKey(), dataUrl });
      await queryClient.invalidateQueries({ queryKey: ["body-photos"] });
      haptic("success");
      toast.success(t("state.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "too-large"
          ? t("body.photos.tooLarge")
          : err instanceof Error
            ? err.message
            : t("state.errorGeneric")
      );
    } finally {
      setProcessing(false);
    }
  };

  const deletePhoto = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/body/photos?id=${encodeURIComponent(deleteTarget.id)}`);
      await queryClient.invalidateQueries({ queryKey: ["body-photos"] });
      haptic("heavy");
      toast.success(t("state.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setDeleteTarget(null);
      setPreviewPhoto(null);
    }
  };

  // ── render ──
  const sectionTitle = (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Camera className="h-4 w-4 text-primary" aria-hidden />
        {t("body.photos.title")}
      </p>
      {!hasPin ? (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setManageAction("set");
            setManageStage("first");
            setManageFirstPin("");
            setManageError(false);
            setManageOpen(true);
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
        >
          <LockOpen className="h-4 w-4" aria-hidden />
          {t("body.photoLock.set")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setManageAction(null);
            setManageOpen(true);
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
        >
          <Lock className="h-4 w-4" aria-hidden />
          {t("body.photoLock.manage")}
        </button>
      )}
    </div>
  );

  return (
    <Card className="card-hi p-5">
      {sectionTitle}

      {settings !== undefined && hasPin && !unlocked ? (
        <div className="pt-4">
          <PinPad
            titleKey="body.photoLock.locked"
            subtitleKey="body.photoLock.subtitle"
            onComplete={tryUnlock}
            error={gateError}
            clearSignal={gateClear}
          />
        </div>
      ) : isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">{t("body.photos.loadError")}</p>
          <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => refetch()}>
            {t("action.retry")}
          </Button>
        </div>
      ) : photos.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12">
            <ImageOff className="h-7 w-7 text-primary" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">{t("body.photos.empty")}</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3" role="list">
          {photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  setPreviewPhoto(photo);
                }}
                className="group relative w-full overflow-hidden rounded-2xl border border-border/60"
                aria-label={fmt.date(photo.date + "T00:00:00")}
              >
                {/* data URLs in the web build; app-private file paths in native */}
                <img
                  src={photo.filePath}
                  alt={t("body.photos.title")}
                  className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
                <span className="tnum absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-white">
                  {fmt.date(photo.date + "T00:00:00", { day: "numeric", month: "short" })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(settings === undefined || !hasPin || unlocked) && !isError && (
        <div className="mt-4">
          <Button
            onClick={() => {
              haptic("light");
              fileRef.current?.click();
            }}
            disabled={processing}
            className="h-11 w-full rounded-2xl bg-gradient-accent font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            {processing ? (
              <>
                <Camera className="h-4 w-4 animate-pulse" aria-hidden />
                {t("body.photos.processing")}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden />
                {t("body.photos.add")}
              </>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={addPhoto}
            aria-hidden
            tabIndex={-1}
          />
        </div>
      )}

      {/* preview dialog */}
      <Dialog open={previewPhoto !== null} onOpenChange={(open) => !open && setPreviewPhoto(null)}>
        <DialogContent className="max-w-md rounded-3xl p-0" dir="auto">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="text-base">{t("body.photos.title")}</DialogTitle>
            <DialogDescription>
              {previewPhoto ? fmt.date(previewPhoto.date + "T00:00:00") : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5">
            {previewPhoto && (
              <img
                src={previewPhoto.filePath}
                alt={t("body.photos.title")}
                className="max-h-[60vh] w-full rounded-2xl object-contain"
                decoding="async"
              />
            )}
          </div>
          <DialogFooter className="px-5 pb-5">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-2xl border-destructive/40 text-destructive"
              onClick={() => setDeleteTarget(previewPhoto)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("body.photos.delete")}
            </Button>
            <Button
              variant="ghost"
              className="h-11 flex-1 rounded-2xl text-muted-foreground"
              onClick={() => setPreviewPhoto(null)}
            >
              {t("action.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("body.photos.deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("body.photos.deleteConfirm.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => haptic("light")}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void deletePhoto();
              }}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* manage lock sheet */}
      <Sheet open={manageOpen} onOpenChange={(open) => !open && setManageAction(null)}>
        <SheetContent
          side="bottom"
          className="slim-scroll max-h-[85vh] overflow-y-auto rounded-t-3xl px-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="px-5 pb-1">
            <SheetTitle className="flex items-center gap-2 text-start">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              {t("body.photoLock.manage")}
            </SheetTitle>
            <SheetDescription className="text-start">{t("body.photoLock.note")}</SheetDescription>
          </SheetHeader>

          <div className="px-5 pb-6">
            {/* v1.12: instant atomic menu↔pad swap — the old wait-mode crossfade
                left an empty frame (sheet-bg flash) between the two views */}
            {manageAction === null ? (
              <div className="flex flex-col gap-2">
                  {hasPin ? (
                    <>
                      <Button
                        variant="outline"
                        className="h-12 rounded-2xl"
                        onClick={() => {
                          haptic("light");
                          setManageAction("change");
                          setManageStage("first");
                          setManageFirstPin("");
                          setManageError(false);
                        }}
                      >
                        <Lock className="h-4 w-4" aria-hidden />
                        {t("body.photoLock.change")}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-12 rounded-2xl border-destructive/40 text-destructive"
                        onClick={() => {
                          haptic("light");
                          setManageAction("remove");
                          setManageError(false);
                        }}
                      >
                        <LockOpen className="h-4 w-4" aria-hidden />
                        {t("body.photoLock.remove")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="h-12 rounded-2xl bg-gradient-accent font-semibold text-primary-foreground"
                      onClick={() => {
                        haptic("light");
                        setManageAction("set");
                        setManageStage("first");
                        setManageFirstPin("");
                        setManageError(false);
                      }}
                    >
                      <Lock className="h-4 w-4" aria-hidden />
                      {t("body.photoLock.set")}
                    </Button>
                  )}
              </div>
            ) : (
              <div>
                  <PinPad
                    titleKey={
                      manageAction === "remove"
                        ? "body.photoLock.current"
                        : manageStage === "first"
                          ? "body.photoLock.enterNew"
                          : "body.photoLock.confirmNew"
                    }
                    subtitleKey={
                      manageAction === "remove"
                        ? "body.photoLock.removeHint"
                        : manageStage === "first"
                          ? "body.photoLock.enterNew"
                          : "body.photoLock.confirmNew"
                    }
                    onComplete={onManageComplete}
                    error={manageError}
                    clearSignal={manageClear}
                  />
                  {manageError && (
                    <p className="text-center text-sm font-medium text-danger">
                      {manageAction === "remove" || manageStage === "first"
                        ? t("body.photoLock.wrong")
                        : t("body.photoLock.mismatch")}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    className="mt-2 h-11 w-full rounded-2xl text-muted-foreground"
                    onClick={() => {
                      haptic("light");
                      setManageAction(null);
                      setManageStage("first");
                      setManageFirstPin("");
                      setManageError(false);
                    }}
                  >
                    {t("action.cancel")}
                  </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
