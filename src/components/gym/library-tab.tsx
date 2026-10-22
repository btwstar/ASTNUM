"use client";

/**
 * Library tab — the exercise library (v1.7 redesign).
 *
 * Card anatomy (single list item, three tap zones — no nested <button>s):
 *  [thumbnail]  → media present: opens the form viewer (image/GIF animates,
 *                 video plays) · no media: opens the attach picker directly
 *  [main body]  → adds the exercise to the ACTIVE session (fast logger)
 *  [side rail]  → attach (ImagePlus) + delete (Trash2, confirm dialog)
 *
 * Media pipeline: compressExerciseMedia (shared canvas compressor) →
 * PATCH /api/gym/exercises/[id] { image, imageThumb }. Static images are
 * resized (≤640px), GIFs keep their animation (≤1.5MB), videos pass through
 * (≤2.5MB) with a best-effort first-frame thumbnail. Lists only ever carry
 * the ≤48KB thumb — the full media is fetched by the viewer route.
 *
 * "+ custom exercise" opens a create sheet (nameAr required, ≥1 primary
 * muscle, optional media) POSTing /api/gym/exercises.
 */
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Check,
  Dumbbell,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { compressExerciseMedia } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  CANONICAL_MUSCLES,
  EQUIPMENT_KEYS,
  exerciseName,
  type GymExercise,
  type GymExerciseMedia,
  type WorkoutSummary,
} from "./shared";

const MUSCLE_ALL = "all";

export interface LibraryTabProps {
  /** the active (unfinished) session, if any — taps without it just hint */
  active: WorkoutSummary | null;
  /** parent opens the fast logger for the tapped exercise */
  onAddToSession: (exercise: GymExercise) => void;
}

type MuscleRole = "primary" | "secondary";

/* ── media pick + upload (shared by attach & create flows) ─────────── */

function mediaErrorKey(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "video-too-large") return "gym.media.error.video";
  if (msg === "gif-too-large") return "gym.media.error.gif";
  if (msg === "image-too-large" || msg === "too-large") return "gym.media.error.image";
  if (msg === "unsupported-type") return "gym.media.error.type";
  return "gym.media.error.generic";
}

/* ── the tab ────────────────────────────────────────────────────────── */

export function LibraryTab({ active, onAddToSession }: LibraryTabProps) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();

  /* ── filters (250ms debounce on the search input) ───────────────────── */
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string>(MUSCLE_ALL);
  const [equipment, setEquipment] = useState<string>("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const libQuery = useQuery({
    queryKey: ["gym-exercises", q, muscle, equipment],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (muscle !== MUSCLE_ALL) params.set("muscle", muscle);
      if (equipment) params.set("equipment", equipment);
      const suffix = params.toString();
      return apiGet<{ exercises: GymExercise[] }>(
        suffix ? `/api/gym/exercises?${suffix}` : "/api/gym/exercises"
      );
    },
    staleTime: 30 * 1000,
  });

  const exercises = libQuery.data?.exercises ?? [];

  /* ── optimistic "just added" ring ───────────────────────────────────── */
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const addedTimers = useRef<number[]>([]);
  useEffect(() => {
    const timers = addedTimers.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  const handleTap = (ex: GymExercise) => {
    if (!active) {
      haptic("light");
      toast.info(t("gym.library.noSession"));
      return;
    }
    haptic("medium");
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(ex.id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(ex.id);
        return next;
      });
    }, 1500);
    addedTimers.current.push(timer);
    onAddToSession(ex);
  };

  /* ── media attach / replace / remove ───────────────────────────────── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** exercise targeted by the attach picker (list row or viewer) */
  const [attachTarget, setAttachTarget] = useState<GymExercise | null>(null);
  /** viewer sheet target */
  const [viewerEx, setViewerEx] = useState<GymExercise | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removeEx, setRemoveEx] = useState<GymExercise | null>(null);

  const openPickerFor = (ex: GymExercise) => {
    haptic("light");
    setAttachTarget(ex);
    fileInputRef.current?.click();
  };

  const uploadMutation = useMutation({
    mutationFn: ({ id, image, imageThumb }: { id: string; image: string; imageThumb: string | null }) =>
      apiPatch(`/api/gym/exercises/${id}`, { image, imageThumb }),
    onSuccess: () => {
      toast.success(t("gym.media.attached"));
      void qc.invalidateQueries({ queryKey: ["gym-exercises"] });
      void qc.invalidateQueries({ queryKey: ["gym", "exercises"] });
      void qc.invalidateQueries({ queryKey: ["gym-exercise-media"] });
    },
    onError: () => toast.error(t("gym.media.error.generic")),
  });

  const removeMediaMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/gym/exercises/${id}`, { image: null, imageThumb: null }),
    onSuccess: () => {
      toast.success(t("gym.media.removed"));
      void qc.invalidateQueries({ queryKey: ["gym-exercises"] });
      void qc.invalidateQueries({ queryKey: ["gym", "exercises"] });
      void qc.invalidateQueries({ queryKey: ["gym-exercise-media"] });
      setViewerEx(null);
      setRemoveEx(null); // the confirm dialog state must not leak into the next open
    },
    onError: () => toast.error(t("gym.media.error.generic")),
  });

  const handleFilePicked = async (file: File | undefined) => {
    const target = attachTarget;
    setAttachTarget(null);
    if (!file || !target) return;
    if (uploading) return;
    haptic("medium");
    setUploading(true);
    try {
      const { image, imageThumb } = await compressExerciseMedia(file);
      await uploadMutation.mutateAsync({ id: target.id, image, imageThumb });
    } catch (err) {
      toast.error(t(mediaErrorKey(err)));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── exercise delete (soft) ────────────────────────────────────────── */
  const [deleteEx, setDeleteEx] = useState<GymExercise | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/gym/exercises/${id}`),
    onSuccess: () => {
      toast.success(t("gym.library.deleted"));
      void qc.invalidateQueries({ queryKey: ["gym-exercises"] });
      void qc.invalidateQueries({ queryKey: ["gym", "exercises"] });
      setDeleteEx(null);
    },
    onError: () => toast.error(t("gym.library.deleteError")),
  });

  /* ── custom exercise sheet ─────────────────────────────────────────── */
  const [customOpen, setCustomOpen] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [equipmentSel, setEquipmentSel] = useState<string>("barbell");
  const [roles, setRoles] = useState<Record<string, MuscleRole>>({});
  const [nameArError, setNameArError] = useState(false);
  const [musclesError, setMusclesError] = useState(false);
  /** optional media picked inside the create sheet (committed with the POST) */
  const [draftMedia, setDraftMedia] = useState<{ image: string; imageThumb: string | null } | null>(null);
  const [draftMediaBusy, setDraftMediaBusy] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setNameAr("");
    setNameEn("");
    setEquipmentSel("barbell");
    setRoles({});
    setNameArError(false);
    setMusclesError(false);
    setDraftMedia(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/gym/exercises", {
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim(),
        equipment: equipmentSel,
        muscles: (Object.keys(roles) as string[]).map((muscleId) => ({
          muscleId,
          role: roles[muscleId],
        })),
        image: draftMedia?.image ?? undefined,
        imageThumb: draftMedia ? draftMedia.imageThumb : undefined,
      }),
    onSuccess: () => {
      toast.success(t("gym.library.customCreated"));
      void qc.invalidateQueries({ queryKey: ["gym-exercises"] });
      void qc.invalidateQueries({ queryKey: ["gym", "exercises"] });
      setCustomOpen(false);
      resetForm();
    },
    onError: () => toast.error(t("gym.library.customError")),
  });

  const handleDraftFilePicked = async (file: File | undefined) => {
    if (!file) return;
    if (draftMediaBusy) return;
    haptic("medium");
    setDraftMediaBusy(true);
    try {
      const media = await compressExerciseMedia(file);
      setDraftMedia({ image: media.image, imageThumb: media.imageThumb });
    } catch (err) {
      toast.error(t(mediaErrorKey(err)));
    } finally {
      setDraftMediaBusy(false);
      if (createFileRef.current) createFileRef.current.value = "";
    }
  };

  const cycleRole = (id: string) => {
    haptic("light");
    setMusclesError(false);
    setRoles((prev) => {
      const next = { ...prev };
      const current = prev[id];
      if (current === undefined) next[id] = "primary";
      else if (current === "primary") next[id] = "secondary";
      else delete next[id];
      return next;
    });
  };

  const submitCustom = () => {
    const hasPrimary = Object.values(roles).includes("primary");
    const nameMissing = nameAr.trim().length === 0;
    setNameArError(nameMissing);
    setMusclesError(!hasPrimary);
    if (nameMissing) {
      toast.error(t("gym.custom.nameArRequired"));
      return;
    }
    if (!hasPrimary) {
      toast.error(t("gym.custom.needPrimary"));
      return;
    }
    createMutation.mutate();
  };

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-3 px-4 pt-4">
      {/* search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("gym.library.search")}
          className="min-h-11 rounded-2xl bg-muted/50 ps-9"
          aria-label={t("gym.library.search")}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {/* equipment chips + muscle select */}
      <div className="flex items-center gap-2">
        <Select
          value={muscle}
          onValueChange={(v) => {
            haptic("light");
            setMuscle(v);
          }}
        >
          <SelectTrigger
            className="h-11 w-36 shrink-0 rounded-2xl text-xs font-semibold"
            aria-label={t("gym.library.muscle")}
          >
            <SelectValue placeholder={t("gym.library.muscle")} />
          </SelectTrigger>
          <SelectContent className="max-h-72 rounded-2xl">
            <SelectItem value={MUSCLE_ALL}>{t("gym.library.all")}</SelectItem>
            {CANONICAL_MUSCLES.map((m) => (
              <SelectItem key={m} value={m}>
                {t(`gym.muscle.${m}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="slim-scroll -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1"
          role="group"
          aria-label={t("gym.library.equipment")}
        >
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setEquipment("");
            }}
            aria-pressed={equipment === ""}
            className={cn(
              "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
              equipment === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground"
            )}
          >
            {t("gym.library.all")}
          </button>
          {EQUIPMENT_KEYS.map((eq) => (
            <button
              key={eq}
              type="button"
              onClick={() => {
                haptic("light");
                setEquipment(equipment === eq ? "" : eq);
              }}
              aria-pressed={equipment === eq}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                equipment === eq
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              {t(`gym.equipment.${eq}`)}
            </button>
          ))}
        </div>
      </div>

      {/* hidden pickers — list attach + create-sheet attach */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleFilePicked(file);
        }}
      />
      <input
        ref={createFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleDraftFilePicked(file);
        }}
      />

      {/* list */}
      {libQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label={t("gym.loading.aria")}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center" role="status">
          <Dumbbell className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="max-w-xs text-sm text-muted-foreground">{t("gym.library.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {exercises.map((ex) => {
            const name = exerciseName(ex, lang);
            const isAdded = addedIds.has(ex.id);
            const muscles = [...ex.muscles].sort((a, b) =>
              a.role === b.role ? 0 : a.role === "primary" ? -1 : 1
            );
            const hasMedia = Boolean(ex.imageThumb);
            return (
              <motion.li
                key={ex.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className={cn(
                  "flex min-h-24 w-full gap-1 rounded-2xl border bg-card p-2.5 transition-colors",
                  isAdded ? "border-success/50 bg-success/5" : "border-border hover:border-primary/40"
                )}
              >
                {/* thumbnail → viewer (with media) or attach picker (without) */}
                <button
                  type="button"
                  onClick={() =>
                    hasMedia ? setViewerEx(ex) : openPickerFor(ex)
                  }
                  aria-label={
                    hasMedia
                      ? `${name} — ${t("gym.media.viewAria")}`
                      : `${name} — ${t("gym.library.media.add")}`
                  }
                  className="group relative h-[5.5rem] w-[5.5rem] shrink-0 self-center overflow-hidden rounded-xl border border-border/70 bg-muted/60 transition-colors hover:border-primary/50"
                >
                  {hasMedia ? (
                     
                    <img
                      src={ex.imageThumb ?? undefined}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/70 transition-colors group-hover:text-primary">
                      <ImagePlus className="h-5 w-5" aria-hidden />
                      <span className="px-1 text-center text-[9px] font-medium leading-tight">
                        {t("gym.library.media.addShort")}
                      </span>
                    </span>
                  )}
                </button>

                {/* main body → add to session */}
                <button
                  type="button"
                  onClick={() => handleTap(ex)}
                  aria-label={`${name} — ${t("gym.library.add")}`}
                  className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl px-2.5 py-0.5 text-start transition-colors hover:bg-primary/5"
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-bold text-foreground">{name}</span>
                    {isAdded ? (
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge
                      variant="outline"
                      className="border-border bg-muted/50 text-[10px] text-muted-foreground"
                    >
                      {t(`gym.equipment.${ex.equipment}`)}
                    </Badge>
                    {ex.custom && (
                      <Badge className="bg-accent text-[10px] text-accent-foreground">
                        {t("gym.library.newCustom")}
                      </Badge>
                    )}
                  </span>
                  {muscles.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {muscles.map((m) => (
                        <span
                          key={m.muscleId}
                          title={
                            m.role === "primary"
                              ? t("gym.library.primary")
                              : t("gym.library.secondary")
                          }
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px]",
                            m.role === "primary"
                              ? "bg-primary/10 font-bold text-primary"
                              : "bg-muted font-medium text-muted-foreground"
                          )}
                        >
                          {t(`gym.muscle.${m.muscleId}`)}
                        </span>
                      ))}
                    </span>
                  )}
                </button>

                {/* side rail → attach + delete */}
                <span className="flex shrink-0 flex-col items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => openPickerFor(ex)}
                    aria-label={`${name} — ${t("gym.library.media.add")}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {uploading && attachTarget?.id === ex.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ImagePlus className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("light");
                      setDeleteEx(ex);
                    }}
                    aria-label={`${name} — ${t("gym.library.delete")}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* new custom exercise */}
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-2xl border-dashed border-border text-sm font-semibold text-muted-foreground"
        onClick={() => {
          haptic("light");
          setCustomOpen(true);
        }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("gym.library.newCustom")}
      </Button>
      <div className="h-24" aria-hidden />

      {/* exercise delete confirm */}
      <AlertDialog open={deleteEx !== null} onOpenChange={(open) => !open && setDeleteEx(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-danger" aria-hidden />
              {t("gym.library.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("gym.library.deleteBody", {
                name: deleteEx ? exerciseName(deleteEx, lang) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl">{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteEx) deleteMutation.mutate(deleteEx.id);
              }}
              className="rounded-xl bg-danger text-white hover:bg-danger/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                t("action.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* media viewer (image / GIF / video) */}
      {viewerEx && (
        <MediaViewerSheet
          exercise={viewerEx}
          onOpenChange={(open) => {
            if (!open) {
              setViewerEx(null);
              setRemoveEx(null);
            }
          }}
          onReplace={() => {
            const ex = viewerEx;
            setViewerEx(null);
            openPickerFor(ex);
          }}
          onRemove={() => setRemoveEx(viewerEx)}
          removing={removeMediaMutation.isPending}
          removeOpen={removeEx !== null}
          onRemoveCancel={() => setRemoveEx(null)}
          onRemoveConfirm={() => {
            if (removeEx) removeMediaMutation.mutate(removeEx.id);
          }}
        />
      )}

      {/* create custom exercise sheet */}
      <Sheet open={customOpen} onOpenChange={setCustomOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
        >
          <SheetHeader className="pb-1">
            <SheetTitle className="text-start">{t("gym.custom.title")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("gym.custom.title")}
            </SheetDescription>
          </SheetHeader>

          <div className="slim-scroll flex-1 space-y-4 overflow-y-auto px-4 pb-5">
            <div>
              <Label
                htmlFor="custom-name-ar"
                className="pb-1.5 text-xs font-medium text-muted-foreground"
              >
                {t("gym.custom.nameAr")}
              </Label>
              <Input
                id="custom-name-ar"
                value={nameAr}
                onChange={(e) => {
                  setNameAr(e.target.value);
                  setNameArError(false);
                }}
                aria-invalid={nameArError}
                className={cn(
                  "min-h-11 rounded-2xl bg-muted/50",
                  nameArError && "border-danger"
                )}
                maxLength={120}
              />
              {nameArError && (
                <p className="pt-1 text-xs text-danger" role="alert">
                  {t("gym.custom.nameArRequired")}
                </p>
              )}
            </div>

            <div>
              <Label
                htmlFor="custom-name-en"
                className="pb-1.5 text-xs font-medium text-muted-foreground"
              >
                {t("gym.custom.nameEn")}
              </Label>
              <Input
                id="custom-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="min-h-11 rounded-2xl bg-muted/50"
                maxLength={120}
                dir="ltr"
              />
            </div>

            <div>
              <Label className="pb-1.5 text-xs font-medium text-muted-foreground">
                {t("gym.custom.equipment")}
              </Label>
              <Select value={equipmentSel} onValueChange={setEquipmentSel}>
                <SelectTrigger className="h-11 w-full rounded-2xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-2xl">
                  {EQUIPMENT_KEYS.map((eq) => (
                    <SelectItem key={eq} value={eq}>
                      {t(`gym.equipment.${eq}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* optional exercise-form media (image / GIF / video) */}
            <div>
              <Label className="pb-1.5 text-xs font-medium text-muted-foreground">
                {t("gym.custom.media")}
              </Label>
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  createFileRef.current?.click();
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-3 text-start transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
                  {draftMediaBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : draftMedia ? (
                     
                    <img
                      src={draftMedia.imageThumb ?? undefined}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="h-5 w-5" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {draftMedia || draftMediaBusy
                      ? t("gym.media.changeFile")
                      : t("gym.media.pickFile")}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t("gym.media.formats")}
                  </span>
                </span>
                {draftMedia && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t("gym.media.removeDraft")}
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic("light");
                      setDraftMedia(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        setDraftMedia(null);
                      }
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </button>
            </div>

            <div>
              <Label className="pb-1.5 text-xs font-medium text-muted-foreground">
                {t("gym.custom.muscles")}
              </Label>
              <p className="pb-2 text-[11px] leading-snug text-muted-foreground/80">
                {t("gym.custom.musclesHint")}
              </p>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t("gym.custom.muscles")}>
                {CANONICAL_MUSCLES.map((m) => {
                  const role = roles[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => cycleRole(m)}
                      aria-pressed={role !== undefined}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-[11px] font-semibold leading-tight transition-colors",
                        role === "primary"
                          ? "border-primary bg-primary text-primary-foreground"
                          : role === "secondary"
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span>{t(`gym.muscle.${m}`)}</span>
                      <span className="text-[9px] font-medium opacity-80">
                        {role === "primary"
                          ? t("gym.library.primary")
                          : role === "secondary"
                            ? t("gym.library.secondary")
                            : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              {musclesError && (
                <p className="pt-1.5 text-xs text-danger" role="alert">
                  {t("gym.custom.needPrimary")}
                </p>
              )}
            </div>

            <Button
              type="button"
              className="min-h-12 w-full rounded-2xl bg-gradient-accent text-base font-bold text-background shadow-lg shadow-primary/25"
              onClick={() => {
                haptic("medium");
                submitCustom();
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  {t("state.loading")}
                </>
              ) : (
                t("gym.custom.save")
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── media viewer sheet ─────────────────────────────────────────────── */

function MediaViewerSheet({
  exercise,
  onOpenChange,
  onReplace,
  onRemove,
  removing,
  removeOpen,
  onRemoveCancel,
  onRemoveConfirm,
}: {
  exercise: GymExercise;
  onOpenChange: (open: boolean) => void;
  onReplace: () => void;
  onRemove: () => void;
  removing: boolean;
  removeOpen: boolean;
  onRemoveCancel: () => void;
  onRemoveConfirm: () => void;
}) {
  const { t, lang } = useI18n();
  const name = exerciseName(exercise, lang);

  // full media fetched ONLY here (lists carry just the thumb)
  const mediaQuery = useQuery({
    queryKey: ["gym-exercise-media", exercise.id],
    queryFn: () =>
      apiGet<{ exercise: GymExerciseMedia }>(`/api/gym/exercises/${exercise.id}`),
    staleTime: 60 * 1000,
  });

  const media = mediaQuery.data?.exercise.image ?? null;
  const isVideo = media?.startsWith("data:video/") ?? false;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
      >
        <SheetHeader className="pb-1">
          <SheetTitle className="flex items-center gap-2 text-start">
            <Pencil className="h-4 w-4 text-primary" aria-hidden />
            <span className="truncate">{name}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">{t("gym.media.viewer")}</SheetDescription>
        </SheetHeader>

        <div className="slim-scroll flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-5">
          {/* the form media itself */}
          {mediaQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : media ? (
            isVideo ? (
              <video
                key={exercise.id}
                src={media}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="max-h-[55vh] w-full rounded-2xl bg-black object-contain"
                aria-label={`${name} — ${t("gym.media.viewAria")}`}
              />
            ) : (
               
              <img
                key={exercise.id}
                src={media}
                alt={`${name} — ${t("gym.media.viewAria")}`}
                className="max-h-[55vh] w-full rounded-2xl bg-black/40 object-contain"
              />
            )
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("gym.media.none")}
            </p>
          )}

          {/* actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 rounded-2xl text-sm font-semibold"
              onClick={onReplace}
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
              {t("gym.media.replace")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 rounded-2xl text-sm font-semibold text-danger hover:bg-danger/10 hover:text-danger"
              onClick={onRemove}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              {t("gym.media.remove")}
            </Button>
          </div>
        </div>

        {/* remove confirm */}
        <AlertDialog open={removeOpen} onOpenChange={(open) => !open && onRemoveCancel()}>
          <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-sm rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-danger" aria-hidden />
                {t("gym.media.removeTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>{t("gym.media.removeBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-xl">{t("action.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  onRemoveConfirm();
                }}
                className="rounded-xl bg-danger text-white hover:bg-danger/90"
              >
                {t("action.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
