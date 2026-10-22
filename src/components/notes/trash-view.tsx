"use client";

/**
 * TrashView — السلة (tasks group added v1.15).
 * Trashed NOTES (cards with image + days-left badge) + trashed TASKS
 * (compact rows) — each with restore + delete-forever, both confirmed
 * via AlertDialog — plus a destructive "empty trash" that purges BOTH
 * lists in one go.
 *
 * v1.15 (review finding 1): deleted tasks are no longer invisible —
 * they land here for 30 days, restorable, mirrored on the notes trash.
 *
 * v1.16 (resilience): the two lists fail INDEPENDENTLY — a failed tasks
 * query (the APK v1.15 404 class) can no longer blank the notes cards
 * too. Each list renders its own retry; "empty trash" is only offered
 * when BOTH loaded clean.
 */
import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, SquareCheckBig, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import {
  useDeleteNote,
  useDeleteTask,
  usePurgeTaskTrash,
  usePurgeTrash,
  useRestoreNote,
  useRestoreTask,
  useTasksTrashQuery,
  useTrashQuery,
} from "./api-hooks";
import { FromNoteBadge } from "./task-bits";
import { EmptyState, InlineError, ListSkeleton } from "./empty-state";
import type { TrashTask } from "./types";

interface ConfirmState {
  titleKey: string;
  bodyKey?: string;
  bodyParams?: Record<string, string | number>;
  actionKey: string;
  onConfirm: () => void;
}

export function TrashView({ q }: { q: string }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const query = useTrashQuery();
  const tasksQuery = useTasksTrashQuery();
  const restoreNote = useRestoreNote();
  const deleteNote = useDeleteNote();
  const restoreTask = useRestoreTask();
  const deleteTask = useDeleteTask();
  const purgeTrash = usePurgeTrash();
  const purgeTaskTrash = usePurgeTaskTrash();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const runConfirm = () => {
    if (!confirm) return;
    confirm.onConfirm();
    setConfirm(null);
  };

  const needle = q.trim().toLowerCase();
  const notes = (query.data ?? []).filter((n) =>
    needle
      ? n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle)
      : true
  );
  const tasks = (tasksQuery.data ?? []).filter((task) =>
    needle ? task.title.toLowerCase().includes(needle) : true
  );

  const notesTotal = query.data?.length ?? 0;
  const tasksTotal = tasksQuery.data?.length ?? 0;
  const total = notesTotal + tasksTotal;
  const loading = query.isLoading || tasksQuery.isLoading;

  // v1.16: independent failure states — the whole view blanks only if
  // the PRIMARY notes list failed AND the tasks list failed with it.
  const notesErrored = query.isError;
  const tasksErrored = tasksQuery.isError;
  const bothErrored = notesErrored && tasksErrored;

  return (
    <div className="flex flex-col gap-3">
      {loading && <ListSkeleton rows={3} />}

      {!loading && (
        <>
          {/* both failed → one box, retry refetches both (the old full-error) */}
          {bothErrored && (
            <InlineError
              onRetry={() => {
                void query.refetch();
                void tasksQuery.refetch();
              }}
            />
          )}
          {notesErrored && !tasksErrored && (
            <InlineError onRetry={() => void query.refetch()} />
          )}

          {/* count + purge ONLY when both lists loaded clean — never purge
              with incomplete data ("إفراغ السلة" must not run blind). */}
          {!notesErrored && !tasksErrored && total > 0 && (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-muted-foreground">
                {t("notes.trash.count", { count: total })}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  haptic("medium");
                  setConfirm({
                    titleKey: "notes.trash.purgeTitle",
                    bodyKey: "notes.trash.purgeBody",
                    actionKey: "notes.trash.purge",
                    onConfirm: () => {
                      // ONE "empty trash" purges both lists (notes first, then
                      // the standalone trashed tasks) then reports.
                      purgeTrash.mutate(undefined, {
                        onSettled: () => {
                          purgeTaskTrash.mutate(undefined, {
                            onSuccess: () => toast.success(t("notes.trashPurged")),
                          });
                        },
                      });
                    },
                  });
                }}
                className="min-h-11 gap-1.5 rounded-xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("notes.trash.purge")}
              </Button>
            </div>
          )}

          {/* trashed notes — render whatever loaded, independent of the tasks query */}
          {!notesErrored && notes.length > 0 && (
            <div className="flex flex-col gap-3">
              {tasks.length > 0 && !tasksErrored && (
                <GroupHeading>{t("notes.trash.groupLabel")}</GroupHeading>
              )}
              <AnimatePresence initial={false}>
                    {notes.map((note) => (
                      <motion.div
                        key={note.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="card-hi rounded-2xl border border-border/50 bg-card p-4"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[15px] font-semibold leading-snug">
                              {note.title || note.body.split("\n")[0] || t("notes.untitled")}
                            </h3>
                            <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                              {note.title ? note.body : note.body.split("\n").slice(1).join(" ").trim()}
                            </p>
                          </div>
                          <DaysLeftBadge daysLeft={note.daysLeft} />
                        </div>
                        {note.imageThumb && (
                          <div className="mt-2.5 overflow-hidden rounded-xl border border-border/50">
                            <img
                              src={note.imageThumb}
                              alt={t("notes.imageAlt")}
                              className="h-24 w-full object-cover opacity-90"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <p className="tnum flex-1 text-[11px] text-muted-foreground">
                            {t("notes.trash.deletedAgo", { date: fmt.relative(note.deletedAt ?? note.updatedAt) })}
                          </p>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              haptic("medium");
                              restoreNote.mutate(note.id, {
                                onSuccess: () => toast.success(t("notes.restoredToast")),
                              });
                            }}
                            aria-label={t("action.restore")}
                            className="h-11 gap-1.5 rounded-xl px-3 text-primary hover:bg-primary/10"
                          >
                            <RotateCcw className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                            <span className="text-xs font-medium">{t("action.restore")}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              haptic("medium");
                              setConfirm({
                                titleKey: "notes.trash.deleteForeverTitle",
                                bodyKey: "notes.trash.deleteForeverBody",
                                actionKey: "notes.trash.deleteForever",
                                onConfirm: () => {
                                  deleteNote.mutate(note.id, {
                                    onSuccess: () => toast.success(t("notes.notePurged")),
                                  });
                                },
                              });
                            }}
                            aria-label={t("notes.trash.deleteForever")}
                            className="h-11 gap-1.5 rounded-xl px-3 text-danger hover:bg-danger/10"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            <span className="text-xs font-medium">{t("notes.trash.deleteForever")}</span>
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

          {/* ── trashed tasks (v1.15) — independent of the notes query ── */}
          {!tasksErrored && tasks.length > 0 && (
            <>
              <GroupHeading icon={SquareCheckBig}>{t("tasks.trash.groupLabel")}</GroupHeading>
              <AnimatePresence initial={false}>
                {tasks.map((task) => (
                  <TaskTrashRow
                    key={task.id}
                    task={task}
                    onRestore={() =>
                      restoreTask.mutate(task.id, {
                        onSuccess: () => toast.success(t("tasks.trash.restoredToast")),
                      })
                    }
                    onDelete={() =>
                      setConfirm({
                        titleKey: "tasks.trash.deleteForeverTitle",
                        bodyKey: "tasks.trash.deleteForeverBody",
                        actionKey: "notes.trash.deleteForever",
                        onConfirm: () => {
                          deleteTask.mutate(task.id, {
                            onSuccess: () => toast.success(t("tasks.trash.purgedToast")),
                          });
                        },
                      })
                    }
                  />
                ))}
              </AnimatePresence>
            </>
          )}
          {tasksErrored && !notesErrored && (
            <InlineError onRetry={() => void tasksQuery.refetch()} />
          )}

          {/* empty states — only when BOTH lists loaded clean */}
          {!notesErrored && !tasksErrored && total === 0 && (
            <EmptyState
              icon={Trash2}
              title={t("notes.empty.trash.title")}
              hint={t("notes.empty.trash.hint")}
            />
          )}

          {/* search emptied the visible set but trash has content */}
          {!notesErrored &&
            !tasksErrored &&
            notes.length === 0 &&
            tasks.length === 0 &&
            needle && <EmptyState icon={Trash2} title={t("notes.empty.search.title")} />}
        </>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? t(confirm.titleKey) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? t(confirm.bodyKey ?? "notes.trash.deleteForeverBody", confirm.bodyParams) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-xl">{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open pattern manual — we control closing
                runConfirm();
              }}
              className="min-h-11 rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {confirm ? t(confirm.actionKey) : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────── */

function GroupHeading({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs font-bold text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </p>
  );
}

function DaysLeftBadge({ daysLeft }: { daysLeft: number }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={`shrink-0 rounded-full text-[10px] leading-normal ${
        daysLeft <= 7 ? "border-warning/40 text-warning" : "text-muted-foreground"
      }`}
    >
      {t("notes.trash.daysLeft", { count: daysLeft })}
    </Badge>
  );
}

function TaskTrashRow({
  task,
  onRestore,
  onDelete,
}: {
  task: TrashTask;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="card-hi rounded-2xl border border-border/50 bg-card p-4"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-semibold leading-snug">{task.title}</h3>
            {task.noteId && <FromNoteBadge />}
          </div>
          <p className="tnum mt-1 text-[11px] text-muted-foreground">
            {t("notes.trash.deletedAgo", { date: fmt.relative(task.updatedAt) })}
          </p>
        </div>
        <DaysLeftBadge daysLeft={task.daysLeft} />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            haptic("medium");
            onRestore();
          }}
          aria-label={t("action.restore")}
          className="h-11 gap-1.5 rounded-xl px-3 text-primary hover:bg-primary/10"
        >
          <RotateCcw className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          <span className="text-xs font-medium">{t("action.restore")}</span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            haptic("medium");
            onDelete();
          }}
          aria-label={t("notes.trash.deleteForever")}
          className="h-11 gap-1.5 rounded-xl px-3 text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          <span className="text-xs font-medium">{t("notes.trash.deleteForever")}</span>
        </Button>
      </div>
    </motion.div>
  );
}
