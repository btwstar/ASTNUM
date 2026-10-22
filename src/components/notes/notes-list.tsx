"use client";

/**
 * NotesList — notes & archive lists.
 * Cards: derived title / 2-line preview / tag chips / pin indicator /
 * relative updatedAt. Swipe: start→pin-toggle, end→archive/unarchive.
 */
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArchiveRestore, NotebookPen, Pin, PinOff, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useNotesQuery, useUpdateNote } from "./api-hooks";
import { SwipeRow } from "./swipe-row";
import { EmptyState, InlineError, ListSkeleton } from "./empty-state";
import type { NoteDTO } from "./types";

interface NotesListProps {
  mode: "active" | "archived";
  q: string;
  tag: string | null;
  onOpenNote: (id: string) => void;
  onNewNote?: () => void;
}

export function NotesList({ mode, q, tag, onOpenNote, onNewNote }: NotesListProps) {
  const { t } = useI18n();
  const query = useNotesQuery(mode, q, tag);

  if (query.isLoading) {
    return <ListSkeleton rows={4} />;
  }
  if (query.isError) {
    return <InlineError onRetry={() => void query.refetch()} />;
  }

  const notes = query.data ?? [];
  if (notes.length === 0) {
    if (q || tag) {
      return (
        <EmptyState
          icon={SearchX}
          title={t("notes.empty.search.title")}
        />
      );
    }
    if (mode === "active") {
      return (
        <EmptyState
          icon={NotebookPen}
          title={t("notes.empty.title")}
          ctaKey="notes.empty.cta"
          onCta={onNewNote}
        />
      );
    }
    return (
      <EmptyState icon={Archive} title={t("notes.empty.archived.title")} hint={t("notes.empty.archived.hint")} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} mode={mode} onOpen={() => onOpenNote(note.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NoteCard({
  note,
  mode,
  onOpen,
}: {
  note: NoteDTO;
  mode: "active" | "archived";
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const updateNote = useUpdateNote();

  const bodyLines = note.body.split("\n");
  const firstMeaningful = bodyLines.map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const displayTitle = note.title || firstMeaningful || t("notes.untitled");
  const preview = note.title ? note.body : bodyLines.slice(1).join(" ").trim();

  const archiveNext = mode === "active"; // end-swipe archives from active, unarchives from archived

  const togglePin = () => {
    haptic("medium");
    updateNote.mutate({ id: note.id, patch: { pinned: !note.pinned } });
    toast.success(t(note.pinned ? "notes.noteUnpinned" : "notes.notePinned"));
  };
  const toggleArchive = () => {
    haptic("medium");
    updateNote.mutate({ id: note.id, patch: { archived: archiveNext } });
    toast.success(t(archiveNext ? "notes.noteArchived" : "notes.noteUnarchived"));
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <SwipeRow
        startAction={{
          icon: note.pinned ? PinOff : Pin,
          label: t(note.pinned ? "action.unpin" : "action.pin"),
          paneClass: "bg-primary/15 text-primary",
        }}
        endAction={{
          icon: archiveNext ? Archive : ArchiveRestore,
          label: t(archiveNext ? "action.archive" : "action.unarchive"),
          paneClass: archiveNext ? "bg-accent text-foreground" : "bg-success/15 text-success",
        }}
        onStart={togglePin}
        onEnd={toggleArchive}
        onTap={onOpen}
      >
        <article className="card-hi cursor-pointer rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug">
              {displayTitle}
            </h3>
            {note.pinned && (
              <Pin
                className="mt-0.5 h-4 w-4 shrink-0 -rotate-45 text-primary"
                aria-label={t("notes.pinnedAria")}
              />
            )}
          </div>
          {note.imageThumb && (
            <div className="mt-2.5 overflow-hidden rounded-xl border border-border/50">
              <img
                src={note.imageThumb}
                alt={t("notes.imageAlt")}
                className="h-28 w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
          {preview && (
            <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm leading-[1.65] text-muted-foreground">
              {preview}
            </p>
          )}
          <div className="mt-3.5 flex items-center gap-1.5 overflow-hidden border-t border-border/40 pt-2.5">
            {note.tags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="max-w-24 shrink truncate rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] leading-none text-primary"
              >
                #{tag.name}
              </span>
            ))}
            {note.tags.length > 4 && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                +{fmt.number(note.tags.length - 4)}
              </span>
            )}
            <span className="ms-auto shrink-0 text-[11px] text-muted-foreground/80 tnum">
              {fmt.relative(note.updatedAt)}
            </span>
          </div>
        </article>
      </SwipeRow>
    </motion.div>
  );
}
