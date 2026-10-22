"use client";

/**
 * TanStack Query hooks & mutations for notes + tasks.
 * All server state flows through these; components never fetch directly.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type {
  CreateNoteInput,
  CreateTaskInput,
  NoteDetail,
  NoteDTO,
  TagWithCount,
  TaskDTO,
  TasksTodayResponse,
  TrashNote,
  TrashTask,
  UpdateNoteInput,
  UpdateTaskInput,
} from "./types";

/* ── Queries ────────────────────────────────────────────────────── */

export function useNotesQuery(filter: "active" | "archived", q: string, tag: string | null) {
  return useQuery({
    queryKey: ["notes", "list", filter, q, tag],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("filter", filter);
      if (q) sp.set("q", q);
      if (tag) sp.set("tag", tag);
      return apiGet<NoteDTO[]>(`/api/notes?${sp.toString()}`);
    },
  });
}

export function useTrashQuery() {
  return useQuery<TrashNote[]>({
    queryKey: ["notes", "trash"],
    queryFn: () => apiGet<TrashNote[]>("/api/notes/trash"),
  });
}

export function useTagsQuery() {
  return useQuery<TagWithCount[]>({
    queryKey: ["notes", "tags"],
    queryFn: () => apiGet<TagWithCount[]>("/api/notes/tags"),
  });
}

export function useNoteQuery(noteId: string | null) {
  return useQuery<NoteDetail>({
    queryKey: ["notes", "detail", noteId],
    queryFn: () => apiGet<NoteDetail>(`/api/notes/${noteId}`),
    enabled: Boolean(noteId),
  });
}

export function useTasksTodayQuery(dateKey: string) {
  return useQuery<TasksTodayResponse>({
    queryKey: ["tasks", "today", dateKey],
    queryFn: () => apiGet<TasksTodayResponse>(`/api/tasks?scope=today&date=${dateKey}`),
  });
}

export function useTasksTrashQuery() {
  return useQuery<TrashTask[]>({
    queryKey: ["tasks", "trash"],
    queryFn: () => apiGet<TrashTask[]>("/api/tasks/trash"),
  });
}

export function useNoteTasksQuery(noteId: string | null) {
  return useQuery<TaskDTO[]>({
    queryKey: ["tasks", "note", noteId],
    queryFn: () => apiGet<TaskDTO[]>(`/api/tasks?scope=note&noteId=${noteId}`),
    enabled: Boolean(noteId),
  });
}

/* ── Note mutations ─────────────────────────────────────────────── */

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => apiPost<NoteDTO>("/api/notes", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateNoteInput }) =>
      apiPatch<NoteDTO & { image: string | null }>(`/api/notes/${id}`, patch),
    onSuccess: (note) => {
      // keep the detail cache fresh without losing its tasks sub-list
      qc.setQueryData<NoteDetail>(["notes", "detail", note.id], (old) =>
        old ? { ...note, tasks: old.tasks } : undefined
      );
      void qc.invalidateQueries({ queryKey: ["notes", "list"] });
      void qc.invalidateQueries({ queryKey: ["notes", "trash"] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ action: "trashed" | "purged" }>(`/api/notes/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useRestoreNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<NoteDTO>(`/api/notes/${id}/restore`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useSetNoteTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tagNames }: { id: string; tagNames: string[] }) =>
      apiPut<{ id: string; tags: { id: string; name: string }[] }>(`/api/notes/${id}/tags`, {
        tagNames,
      }),
    onSuccess: (data) => {
      qc.setQueryData<NoteDetail>(["notes", "detail", data.id], (old) =>
        old ? { ...old, tags: data.tags } : undefined
      );
      void qc.invalidateQueries({ queryKey: ["notes", "list"] });
      void qc.invalidateQueries({ queryKey: ["notes", "tags"] });
      void qc.invalidateQueries({ queryKey: ["notes", "trash"] });
    },
  });
}

export function usePurgeTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ purged: number }>("/api/notes/trash"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/* ── Task mutations ──────────────────────────────────────────────── */

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => apiPost<TaskDTO>("/api/tasks", input),
    onSuccess: (task) => {
      if (task.noteId) {
        void qc.invalidateQueries({ queryKey: ["tasks", "note", task.noteId] });
        void qc.invalidateQueries({ queryKey: ["notes", "detail", task.noteId] });
      }
      void qc.invalidateQueries({ queryKey: ["tasks", "today"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      apiPatch<TaskDTO>(`/api/tasks/${id}`, patch),
    onSuccess: (task) => {
      if (task.noteId) {
        void qc.invalidateQueries({ queryKey: ["tasks", "note", task.noteId] });
        void qc.invalidateQueries({ queryKey: ["notes", "detail", task.noteId] });
      }
      void qc.invalidateQueries({ queryKey: ["tasks", "today"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ action: string }>(`/api/tasks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["notes", "detail"] });
      void qc.invalidateQueries({ queryKey: ["notes", "trash"] });
    },
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<TaskDTO>(`/api/tasks/${id}/restore`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["notes", "trash"] });
      void qc.invalidateQueries({ queryKey: ["notes", "detail"] });
    },
  });
}

export function usePurgeTaskTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ purged: number }>("/api/tasks/trash"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
