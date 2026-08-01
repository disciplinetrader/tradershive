/**
 * Phase 8D · review query layer.
 *
 * One cache entry per session review, one per history page, one for the
 * improvement feed. Everything is read-through: the server derives, the client
 * renders.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createReplayHomework, getReplayImprovement, getReplayReview, linkReplayOriginal,
  listReplayHistory, registerReplayScreenshot, saveReplayComparison, scoreReplaySessionCanonical,
} from "@/lib/replay-review.functions";

export const reviewKeys = {
  review: (id: string) => ["replay", "review", id] as const,
  history: (params: unknown) => ["replay", "history", params] as const,
  improvement: () => ["replay", "improvement"] as const,
};

export function useReplayReview(sessionId: string) {
  const load = useServerFn(getReplayReview);
  return useQuery({
    queryKey: reviewKeys.review(sessionId),
    queryFn: () => load({ data: { session_id: sessionId } }),
    enabled: !!sessionId,
  });
}

export interface HistoryParams {
  limit: number;
  offset: number;
  status: string | null;
  symbol: string | null;
  search: string | null;
}

export function useReplayHistory(params: HistoryParams) {
  const load = useServerFn(listReplayHistory);
  return useQuery({
    queryKey: reviewKeys.history(params),
    queryFn: () => load({ data: params }),
    placeholderData: (prev) => prev,
  });
}

export function useReplayImprovement(limit = 50) {
  const load = useServerFn(getReplayImprovement);
  return useQuery({ queryKey: reviewKeys.improvement(), queryFn: () => load({ data: { limit } }) });
}

export function useScoreSession(sessionId: string) {
  const qc = useQueryClient();
  const run = useServerFn(scoreReplaySessionCanonical);
  return useMutation({
    mutationFn: (complete?: boolean) => run({ data: { session_id: sessionId, complete: complete ?? true } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.review(sessionId) });
      void qc.invalidateQueries({ queryKey: reviewKeys.improvement() });
    },
  });
}

export function useSaveComparison(sessionId: string) {
  const qc = useQueryClient();
  const run = useServerFn(saveReplayComparison);
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => run({ data: { session_id: sessionId, ...input } as never }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.review(sessionId) });
      void qc.invalidateQueries({ queryKey: reviewKeys.improvement() });
    },
  });
}

export function useLinkOriginal(sessionId: string) {
  const qc = useQueryClient();
  const run = useServerFn(linkReplayOriginal);
  return useMutation({
    mutationFn: (originalEntryId: string | null) =>
      run({ data: { session_id: sessionId, original_entry_id: originalEntryId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: reviewKeys.review(sessionId) }),
  });
}

export function useCreateDrill(sessionId: string) {
  const qc = useQueryClient();
  const run = useServerFn(createReplayHomework);
  return useMutation({
    mutationFn: (input: { symbol: string; market: string; timeframe: string; reason?: string | null; focus?: string | null }) =>
      run({ data: { source_session_id: sessionId, ...input } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.review(sessionId) });
      void qc.invalidateQueries({ queryKey: reviewKeys.improvement() });
    },
  });
}

export function useRegisterScreenshot(sessionId: string) {
  const qc = useQueryClient();
  const run = useServerFn(registerReplayScreenshot);
  return useMutation({
    mutationFn: (input: {
      storage_path: string; captured_ts: string; caption?: string | null;
      cursor_ts?: string | null; dataset_checksum?: string | null; symbol?: string | null; timeframe?: string | null;
    }) => run({ data: { session_id: sessionId, ...input } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.review(sessionId) });
      void qc.invalidateQueries({ queryKey: ["replay", "reflection", sessionId] });
    },
  });
}
