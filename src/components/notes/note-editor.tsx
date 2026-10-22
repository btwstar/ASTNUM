"use client";

/**
 * NoteEditor — full-screen bottom Sheet.
 * Title input + body textarea + optional image attachment (canvas-compressed
 * pair: full + list thumbnail) + live markdown preview toggle + tag editor
 * (chips + inline add) + header menu (pin / archive / trash) + manual save
 * button + 1.2s debounced autosave + save-on-close. Checklist items
 * (Tasks with noteId) render under the body with due/priority via the ⋮ menu.
 *
 * New-note flow: the editor starts unsaved (noteId=null); the first
 * debounced/manual save POSTs once, then PATCHes. Adding a checklist item,
 * a tag — or attaching an image — on an unsaved note force-persists it first.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  Eye,
  ImagePlus,
  ListChecks,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  MoreVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { compressNoteImagePair } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import {
  useCreateNote,
  useCreateTask,
  useDeleteNote,
  useNoteQuery,
  useNoteTasksQuery,
  useRestoreNote,
  useSetNoteTags,
  useUpdateNote,
  useUpdateTask,
} from "./api-hooks";
import { MarkdownView } from "./markdown-view";
import { TaskCheckbox, DueChip, PriorityDot, StrikeText } from "./task-bits";
import { TaskMenu } from "./task-menu";
import type { TaskDTO } from "./types";

interface NoteEditorProps {
  open: boolean;
  /** null = brand-new note */
  noteId: string | null;
  onClose: () => void;
}

export function NoteEditor({ open, noteId, onClose }: NoteEditorProps) {
  const { t } = useI18n();
  const noteQuery = useNoteQuery(noteId);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const restoreNote = useRestoreNote();
  const setTagsMut = useSetNoteTags();
  const createTask = useCreateTask();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  /* image attachment (pair: full for the editor, thumb for lists) */
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const lastPairRef = useRef<{ image: string; imageThumb: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveId = noteId ?? createdId;
  const titleRef = useRef<HTMLInputElement>(null);

  // latest state for the persist closure (avoids stale timers)
  const stateRef = useRef({ title, body, tagNames, dirty, effectiveId });
  stateRef.current = { title, body, tagNames, dirty, effectiveId };
  const savingRef = useRef(false);

  /**
   * persist — single save entry-point.
   * - unsaved note → POST once (title/body/tags), remember id
   * - existing note → PATCH {title, body}
   * manual=true → haptic + toast (button press)
   */
  const persist = async (manual: boolean): Promise<string | null> => {
    const s = stateRef.current;
    if (savingRef.current) return s.effectiveId;
    if (!s.dirty && !manual) return s.effectiveId; // nothing new
    if (!s.effectiveId && !s.title.trim() && !s.body.trim()) return null; // empty → never create
    savingRef.current = true;
    setSaving(true);
    setDirty(false);
    try {
      if (!s.effectiveId) {
        const created = await createNote.mutateAsync({
          title: s.title,
          body: s.body,
          tagNames: s.tagNames,
        });
        setCreatedId(created.id);
        if (manual) {
          haptic("medium");
          toast.success(t("state.saved"));
        }
        return created.id;
      }
      await updateNote.mutateAsync({ id: s.effectiveId, patch: { title: s.title, body: s.body } });
      if (manual) {
        haptic("medium");
        toast.success(t("state.saved"));
      }
      return s.effectiveId;
    } catch {
      setDirty(true);
      toast.error(t("state.errorGeneric"));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // hydrate local state from the server note once per open
  useEffect(() => {
    if (open && noteId && noteQuery.data && !initialized && !dirty) {
      setTitle(noteQuery.data.title);
      setBody(noteQuery.data.body);
      setTagNames(noteQuery.data.tags.map((tag) => tag.name));
      setImage(noteQuery.data.image);
      lastPairRef.current =
        noteQuery.data.image && noteQuery.data.imageThumb
          ? { image: noteQuery.data.image, imageThumb: noteQuery.data.imageThumb }
          : null;
      setInitialized(true);
    }
  }, [open, noteId, noteQuery.data, initialized, dirty]);

  // reset everything shortly after close (after exit animation + save flush)
  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => {
      setTitle("");
      setBody("");
      setTagNames([]);
      setTagDraft("");
      setPreview(false);
      setDirty(false);
      setInitialized(false);
      setCreatedId(null);
      setImage(null);
      setImageBusy(false);
      setViewerOpen(false);
      lastPairRef.current = null;
    }, 350);
    return () => window.clearTimeout(id);
  }, [open]);

  // focus the title when composing a brand-new note
  useEffect(() => {
    if (open && !noteId) {
      const id = window.setTimeout(() => titleRef.current?.focus(), 320);
      return () => window.clearTimeout(id);
    }
  }, [open, noteId]);

  // debounced autosave (1.2s after typing stops)
  useEffect(() => {
    if (!open || !dirty) return;
    const id = window.setTimeout(() => {
      void persistRef.current(false);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [open, dirty, title, body]);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      void persistRef.current(false); // autosave on close
      onClose();
    }
  };

  const markDirty = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setDirty(true);
  };

  /* ── tag actions ─────────────────────────────────────────────── */
  const applyTags = (next: string[]) => {
    setTagNames(next);
    const id = stateRef.current.effectiveId;
    if (id) setTagsMut.mutate({ id, tagNames: next });
  };
  const addTagFromDraft = () => {
    const name = tagDraft.trim().replace(/^#/, "");
    if (!name) return;
    setTagDraft("");
    if (tagNames.includes(name)) return;
    haptic("light");
    applyTags([...tagNames, name]);
  };
  const removeTag = (name: string) => {
    haptic("light");
    applyTags(tagNames.filter((n) => n !== name));
  };

  /* ── image attachment ─────────────────────────────────────── */
  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("notes.editor.imageInvalid"));
      return;
    }
    setImageBusy(true);
    try {
      const pair = await compressNoteImagePair(file);
      const s = stateRef.current;
      if (!s.effectiveId) {
        // unsaved note → persist title/body/tags together with the image pair
        const created = await createNote.mutateAsync({
          title: s.title,
          body: s.body,
          image: pair.image,
          imageThumb: pair.imageThumb,
          tagNames: s.tagNames,
        });
        setCreatedId(created.id);
        setDirty(false); // everything just went to the server
      } else {
        await updateNote.mutateAsync({
          id: s.effectiveId,
          patch: { image: pair.image, imageThumb: pair.imageThumb },
        });
      }
      lastPairRef.current = pair;
      setImage(pair.image);
      haptic("success");
      toast.success(t("notes.editor.imageAttached"));
    } catch (err) {
      haptic("heavy");
      toast.error(
        err instanceof Error && err.message === "too-large"
          ? t("notes.editor.imageTooLarge")
          : err instanceof Error
            ? err.message
            : t("state.errorGeneric")
      );
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = () => {
    const id = stateRef.current.effectiveId;
    if (!id) {
      setImage(null);
      lastPairRef.current = null;
      return;
    }
    const prev = lastPairRef.current;
    setImage(null);
    lastPairRef.current = null;
    haptic("medium");
    updateNote.mutate(
      { id, patch: { image: null, imageThumb: null } },
      {
        onSuccess: () => {
          toast(t("notes.editor.imageRemoved"), {
            action: {
              label: t("action.undo"),
              onClick: () => {
                if (!prev) return;
                haptic("light");
                updateNote.mutate(
                  { id, patch: { image: prev.image, imageThumb: prev.imageThumb } },
                  {
                    onSuccess: () => {
                      setImage(prev.image);
                      lastPairRef.current = prev;
                    },
                  }
                );
              },
            },
          });
        },
      }
    );
  };

  /* ── header menu actions ─────────────────────────────────────── */
  const serverNote = noteQuery.data;
  const togglePin = () => {
    if (!effectiveId || !serverNote) return;
    haptic("medium");
    updateNote.mutate({ id: effectiveId, patch: { pinned: !serverNote.pinned } });
    toast.success(t(serverNote.pinned ? "notes.noteUnpinned" : "notes.notePinned"));
  };
  const toggleArchive = () => {
    if (!effectiveId || !serverNote) return;
    haptic("medium");
    updateNote.mutate({ id: effectiveId, patch: { archived: !serverNote.archived } });
    toast.success(t(serverNote.archived ? "notes.noteUnarchived" : "notes.noteArchived"));
  };
  const moveToTrash = () => {
    if (!effectiveId) return;
    haptic("heavy");
    const id = effectiveId;
    deleteNote.mutate(id, {
      onSuccess: () => {
        toast(t("notes.noteTrashed"), {
          action: {
            label: t("action.undo"),
            onClick: () => {
              restoreNote.mutate(id, {
                onSuccess: () => toast.success(t("notes.restoredToast")),
              });
            },
          },
        });
        onClose();
      },
    });
  };

  /* ── checklist add (force-persists unsaved notes) ────────────── */
  const [itemDraft, setItemDraft] = useState("");
  const [itemBusy, setItemBusy] = useState(false);
  const addItem = async () => {
    const text = itemDraft.trim();
    if (!text || itemBusy) return;
    setItemBusy(true);
    haptic("light");
    try {
      const id = await persistRef.current(false); // ensure the note exists
      if (!id) {
        toast.error(t("state.errorGeneric"));
        return;
      }
      await createTask.mutateAsync({ noteId: id, title: text });
      setItemDraft("");
    } catch {
      toast.error(t("state.errorGeneric"));
    } finally {
      setItemBusy(false);
    }
  };

  const loadingExisting = Boolean(noteId) && noteQuery.isLoading && !initialized;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] flex-col gap-0 rounded-t-3xl border-t p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t(noteId ? "notes.title" : "notes.editor.newTitle")}</SheetTitle>
          <SheetDescription>{t("notes.editor.bodyPlaceholder")}</SheetDescription>
        </SheetHeader>

        {/* header row — built-in close X sits at physical top-end; pr-12 keeps it clear */}
        <div className="flex items-center gap-1 border-b border-border/40 p-2 pr-12">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("action.more")}
                className="h-11 w-11 rounded-xl text-muted-foreground hover:bg-muted"
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 rounded-2xl">
              <DropdownMenuItem
                onClick={togglePin}
                disabled={!effectiveId || !serverNote}
                className="min-h-10"
              >
                {serverNote?.pinned ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
                {t(serverNote?.pinned ? "action.unpin" : "action.pin")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={toggleArchive}
                disabled={!effectiveId || !serverNote}
                className="min-h-10"
              >
                {serverNote?.archived ? (
                  <ArchiveRestore className="h-4 w-4" aria-hidden />
                ) : (
                  <Archive className="h-4 w-4" aria-hidden />
                )}
                {t(serverNote?.archived ? "action.unarchive" : "action.archive")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={moveToTrash}
                disabled={!effectiveId}
                className="min-h-10 text-danger focus:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("notes.editor.moveTrash")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* attach image — force-persists unsaved notes (pair: full + thumb) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              haptic("light");
              fileInputRef.current?.click();
            }}
            disabled={imageBusy}
            aria-label={t(imageBusy ? "notes.editor.imageProcessing" : "notes.editor.attachImage")}
            aria-haspopup="dialog"
            className="h-10 w-10 rounded-full p-0 text-muted-foreground hover:bg-muted"
          >
            {imageBusy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-5 w-5" aria-hidden />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickImage}
            aria-hidden
            tabIndex={-1}
          />

          <Button
            variant="ghost"
            size="sm"
            aria-pressed={preview}
            aria-label={t(preview ? "notes.editor.previewOff" : "notes.editor.previewOn")}
            onClick={() => {
              haptic("light");
              setPreview((p) => !p);
            }}
            className="min-h-10 gap-1.5 rounded-full px-3 text-muted-foreground hover:bg-muted"
          >
            {preview ? <Pencil className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            <span className="text-xs font-medium">
              {t(preview ? "notes.editor.previewOff" : "notes.editor.previewOn")}
            </span>
          </Button>

          <div className="flex-1" />

          <Button
            size="sm"
            onClick={() => void persistRef.current(true)}
            disabled={!dirty || saving}
            aria-label={t("action.save")}
            className="min-h-10 gap-1.5 rounded-full px-4 font-semibold disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            {t("action.save")}
          </Button>
        </div>

        {/* body */}
        <div className="slim-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-16">
          {loadingExisting ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-8 w-2/3 rounded-lg" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-5/6 rounded-lg" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => markDirty(setTitle)(e.target.value)}
                placeholder={t("notes.editor.titlePlaceholder")}
                aria-label={t("notes.editor.titlePlaceholder")}
                maxLength={500}
                className="min-h-11 w-full bg-transparent text-xl font-bold leading-snug outline-none placeholder:text-muted-foreground/50"
              />

              {preview ? (
                <MarkdownView source={body} />
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => markDirty(setBody)(e.target.value)}
                  placeholder={t("notes.editor.bodyPlaceholder")}
                  aria-label={t("notes.editor.bodyPlaceholder")}
                  maxLength={100000}
                  className="min-h-48 flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/50"
                />
              )}

              {/* attached image (compressed pair — thumb goes to lists) */}
              {imageBusy && (
                <Skeleton className="h-44 w-full rounded-2xl" aria-busy="true" />
              )}
              {image && !imageBusy && (
                <div className="relative">
                  <div className="overflow-hidden rounded-2xl border border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        haptic("light");
                        setViewerOpen(true);
                      }}
                      aria-label={t("notes.editor.viewImage")}
                      className="block w-full"
                    >
                      <img
                        src={image}
                        alt={t("notes.imageAlt")}
                        className="max-h-72 w-full object-cover object-top"
                        decoding="async"
                      />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label={t("notes.editor.removeImage")}
                    className="absolute end-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/75 active:scale-90"
                  >
                    <X className="h-4.5 w-4.5" aria-hidden />
                  </button>
                </div>
              )}

              {/* tags */}
              <section aria-label={t("notes.editor.tags")} className="flex flex-wrap items-center gap-2">
                {tagNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                  >
                    #{name}
                    <button
                      type="button"
                      onClick={() => removeTag(name)}
                      aria-label={`${t("action.delete")} ${name}`}
                      className="-me-0.5 flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
                    >
                      <span aria-hidden className="font-bold leading-none">
                        ×
                      </span>
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTagFromDraft();
                    }
                  }}
                  onBlur={addTagFromDraft}
                  placeholder={t("notes.editor.addTagPlaceholder")}
                  aria-label={t("notes.editor.addTag")}
                  maxLength={50}
                  className="min-h-9 min-w-28 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
              </section>

              {/* checklist (tasks bound to this note) */}
              {effectiveId ? (
                <ChecklistSection noteId={effectiveId} draft={itemDraft} onDraft={setItemDraft} onAdd={addItem} busy={itemBusy} />
              ) : (
                <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                  {t("notes.editor.checklistHint")}
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                {t("notes.editor.markdownHint")}
              </p>
            </>
          )}
        </div>

        {/* full-size image viewer */}
        <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
          <DialogContent className="max-w-md rounded-3xl p-0" dir="auto">
            <DialogHeader className="px-5 pt-5">
              <DialogTitle className="text-base">{t("notes.imageAlt")}</DialogTitle>
              <DialogDescription className="sr-only">{t("notes.editor.viewImage")}</DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-5">
              {image && (
                <img
                  src={image}
                  alt={t("notes.imageAlt")}
                  className="max-h-[70vh] w-full rounded-2xl object-contain"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

/* ── checklist section ───────────────────────────────────────────── */

function ChecklistSection({
  noteId,
  draft,
  onDraft,
  onAdd,
  busy,
}: {
  noteId: string;
  draft: string;
  onDraft: (v: string) => void;
  onAdd: () => void | Promise<void>;
  busy: boolean;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const tasksQuery = useNoteTasksQuery(noteId);
  const tasks = tasksQuery.data ?? [];
  const remaining = tasks.filter((task) => !task.doneToday).length;

  return (
    <section aria-label={t("notes.editor.checklist")} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-bold">{t("notes.editor.checklist")}</h3>
        {tasks.length > 0 && (
          <Badge variant="secondary" className="tnum rounded-full">
            {fmt.number(remaining)}/{fmt.number(tasks.length)}
          </Badge>
        )}
      </div>

      {tasksQuery.isLoading ? (
        <Skeleton className="h-11 w-full rounded-xl" />
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.map((task) => (
            <ChecklistRow key={task.id} task={task} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onAdd();
            }
          }}
          placeholder={t("notes.editor.addItemPlaceholder")}
          aria-label={t("notes.editor.addItem")}
          maxLength={500}
          className="min-h-11 flex-1 rounded-xl border border-border/60 bg-card px-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => void onAdd()}
          disabled={!draft.trim() || busy}
          aria-label={t("notes.editor.addItem")}
          className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary hover:bg-primary/20"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}

function ChecklistRow({ task }: { task: TaskDTO }) {
  const updateTask = useUpdateTask();
  const toggle = () => {
    haptic("light");
    updateTask.mutate({ id: task.id, patch: { done: !task.doneToday } });
  };
  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted/40 pe-1 ps-0">
      <TaskCheckbox done={task.doneToday} onToggle={toggle} size="sm" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-1.5">
          <StrikeText done={task.doneToday}>
            <span className="truncate text-sm leading-snug">{task.title}</span>
          </StrikeText>
        </div>
        {(task.dueAt || task.priority < 3) && (
          <div className="mt-0.5 flex items-center gap-1.5 ps-0.5">
            <PriorityDot priority={task.priority} />
            {task.dueAt && <DueChip dueAt={task.dueAt} overdue={task.overdue} />}
          </div>
        )}
      </div>
      <TaskMenu
        task={task}
        showPostpone={false}
        onDone={(done) => updateTask.mutate({ id: task.id, patch: { done } })}
      />
    </div>
  );
}
