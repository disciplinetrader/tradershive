/**
 * Phase 8C · reflection query layer for Replay Studio.
 *
 * One React Query cache entry per session holds every reflection artefact.
 * Mutations are optimistic and idempotent-by-id; a failure rolls the cache
 * back to the last server truth. RLS provides owner isolation, so the cache
 * key needs only the session id.
 *
 * This layer touches no execution state.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createReplayBookmark, createReplayCheckpoint, createReplayNote,
  addChecklistItem, deleteReplayBookmark, deleteReplayCheckpoint,
  deleteReplayNote, toggleChecklistItem,
} from "@/lib/replay.functions";
import { deleteReplayChecklistItem, getReplayReflection } from "@/lib/replay-reflection.functions";

export interface ReflectionNote { id: string; note_ts: string; body: string; screenshot_path: string | null }
export interface ReflectionBookmark { id: string; bookmark_ts: string; label: string; category: string; color: string | null }
export interface ReflectionChecklistItem { id: string; label: string; checked: boolean; sort_order: number | null }
export interface ReflectionCheckpoint { id: string; label: string; checkpoint_ts: string; kind: string }
export interface ReflectionScreenshot { id: string; captured_ts: string; storage_path: string; caption: string | null }
export interface ReflectionScore {
  id: string; score: number; discipline: number; risk: number; execution: number;
  patience: number; consistency: number; journal_completion: number; breakdown: unknown;
}

export interface ReflectionBundle {
  notes: ReflectionNote[];
  bookmarks: ReflectionBookmark[];
  checklist: ReflectionChecklistItem[];
  checkpoints: ReflectionCheckpoint[];
  screenshots: ReflectionScreenshot[];
  score: ReflectionScore | null;
}

export const EMPTY_REFLECTION: ReflectionBundle = {
  notes: [], bookmarks: [], checklist: [], checkpoints: [], screenshots: [], score: null,
};

export const reflectionKey = (sessionId: string) => ["replay", "reflection", sessionId] as const;

/** Local id for an optimistic row; replaced by the server row on settle. */
function tempId() {
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function useReplayReflection(sessionId: string) {
  const qc = useQueryClient();
  const load = useServerFn(getReplayReflection);

  const addNoteFn = useServerFn(createReplayNote);
  const delNoteFn = useServerFn(deleteReplayNote);
  const addBookmarkFn = useServerFn(createReplayBookmark);
  const delBookmarkFn = useServerFn(deleteReplayBookmark);
  const addCheckFn = useServerFn(addChecklistItem);
  const toggleCheckFn = useServerFn(toggleChecklistItem);
  const delCheckFn = useServerFn(deleteReplayChecklistItem);
  const addCheckpointFn = useServerFn(createReplayCheckpoint);
  const delCheckpointFn = useServerFn(deleteReplayCheckpoint);

  const key = reflectionKey(sessionId);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await load({ data: { session_id: sessionId } })) as unknown as ReflectionBundle,
    staleTime: 30_000,
  });

  const patch = useCallback(
    (fn: (b: ReflectionBundle) => ReflectionBundle) => {
      const previous = qc.getQueryData<ReflectionBundle>(key) ?? EMPTY_REFLECTION;
      qc.setQueryData<ReflectionBundle>(key, fn(previous));
      return previous;
    },
    [qc, key],
  );

  const settle = useCallback(() => { void qc.invalidateQueries({ queryKey: key }); }, [qc, key]);
  const rollback = useCallback((prev?: ReflectionBundle) => { if (prev) qc.setQueryData(key, prev); }, [qc, key]);

  const addNote = useMutation({
    mutationFn: (v: { body: string; atMs: number }) =>
      addNoteFn({ data: { session_id: sessionId, note_ts: new Date(v.atMs).toISOString(), body: v.body } }),
    onMutate: (v) =>
      patch((b) => ({
        ...b,
        notes: [...b.notes, { id: tempId(), note_ts: new Date(v.atMs).toISOString(), body: v.body, screenshot_path: null }],
      })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const removeNote = useMutation({
    mutationFn: (id: string) => delNoteFn({ data: { id } }),
    onMutate: (id) => patch((b) => ({ ...b, notes: b.notes.filter((n) => n.id !== id) })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const addBookmark = useMutation({
    mutationFn: (v: { label: string; category: string; atMs: number; color?: string }) =>
      addBookmarkFn({
        data: {
          session_id: sessionId, bookmark_ts: new Date(v.atMs).toISOString(),
          label: v.label, category: v.category as never, color: v.color ?? null,
        },
      }),
    onMutate: (v) =>
      patch((b) => ({
        ...b,
        bookmarks: [
          ...b.bookmarks,
          { id: tempId(), bookmark_ts: new Date(v.atMs).toISOString(), label: v.label, category: v.category, color: v.color ?? null },
        ],
      })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const removeBookmark = useMutation({
    mutationFn: (id: string) => delBookmarkFn({ data: { id } }),
    onMutate: (id) => patch((b) => ({ ...b, bookmarks: b.bookmarks.filter((x) => x.id !== id) })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const addCheck = useMutation({
    mutationFn: (label: string) => addCheckFn({ data: { session_id: sessionId, label } }),
    onMutate: (label) =>
      patch((b) => ({ ...b, checklist: [...b.checklist, { id: tempId(), label, checked: false, sort_order: b.checklist.length }] })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const toggleCheck = useMutation({
    mutationFn: (v: { id: string; checked: boolean }) => toggleCheckFn({ data: v }),
    onMutate: (v) =>
      patch((b) => ({ ...b, checklist: b.checklist.map((c) => (c.id === v.id ? { ...c, checked: v.checked } : c)) })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const removeCheck = useMutation({
    mutationFn: (id: string) => delCheckFn({ data: { id } }),
    onMutate: (id) => patch((b) => ({ ...b, checklist: b.checklist.filter((c) => c.id !== id) })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const addCheckpoint = useMutation({
    mutationFn: (v: { label: string; atMs: number }) =>
      addCheckpointFn({
        data: { session_id: sessionId, label: v.label, checkpoint_ts: new Date(v.atMs).toISOString(), kind: "custom" },
      }),
    onMutate: (v) =>
      patch((b) => ({
        ...b,
        checkpoints: [...b.checkpoints, { id: tempId(), label: v.label, checkpoint_ts: new Date(v.atMs).toISOString(), kind: "custom" }],
      })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  const removeCheckpoint = useMutation({
    mutationFn: (id: string) => delCheckpointFn({ data: { id } }),
    onMutate: (id) => patch((b) => ({ ...b, checkpoints: b.checkpoints.filter((c) => c.id !== id) })),
    onError: (_e, _v, prev) => rollback(prev as ReflectionBundle | undefined),
    onSettled: settle,
  });

  return {
    data: query.data ?? EMPTY_REFLECTION,
    isLoading: query.isLoading,
    refresh: settle,
    addNote, removeNote,
    addBookmark, removeBookmark,
    addCheck, toggleCheck, removeCheck,
    addCheckpoint, removeCheckpoint,
  };
}
