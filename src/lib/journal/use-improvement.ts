/**
 * JOURNAL X — PHASE 5 · shared roll-up hook.
 *
 * One query pair (journal entries + replay comparisons) feeds every
 * Improvement Intelligence surface. The heavy aggregation is memoized on the
 * two result arrays, so the Overview, Analytics roll-up and the drill engine
 * all read identical numbers without recomputing per component.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { listMyAttempts, attemptKeys } from "@/lib/journal/replay-attempts";
import { listJournalHomework, homeworkKeys } from "@/lib/journal/homework";
import { buildRollup, type Rollup } from "@/lib/journal/improvement";

export function useImprovement(options?: { withHomework?: boolean }) {
  const entriesQ = useQuery({ queryKey: journalKeys.list(), queryFn: fetchEntries, staleTime: 30_000 });
  const attemptsQ = useQuery({ queryKey: attemptKeys.mine(), queryFn: () => listMyAttempts(), staleTime: 30_000 });
  const homeworkQ = useQuery({
    queryKey: homeworkKeys.list(),
    queryFn: () => listJournalHomework(),
    staleTime: 30_000,
    enabled: options?.withHomework !== false,
  });

  const entries = entriesQ.data ?? [];
  const attempts = attemptsQ.data ?? [];
  const homework = homeworkQ.data ?? [];

  const rollup: Rollup = useMemo(
    () => buildRollup({ attempts, entries, homework }),
    [attempts, entries, homework],
  );

  return {
    rollup,
    entries,
    attempts,
    homework,
    isLoading: entriesQ.isLoading || attemptsQ.isLoading,
    isError: entriesQ.isError || attemptsQ.isError,
    error: (entriesQ.error ?? attemptsQ.error) as Error | null,
  };
}
