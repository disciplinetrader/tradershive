/**
 * Journal source filter — "which journal am I looking at?".
 *
 * Entries created from the Trading Workspace / Replay execution engine carry a
 * `trade_id` (they are projections of a real executed trade). Manually logged
 * entries have none. Every Journal section reads the same selection so Trades,
 * Calendar, Analytics, Psychology and AI Coach can never disagree.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEntries, journalKeys, type JournalEntry } from "@/lib/journal/api";

export type JournalSource = "all" | "workspace" | "manual";

export const JOURNAL_SOURCE_OPTIONS: { value: JournalSource; label: string }[] = [
  { value: "all", label: "All journals" },
  { value: "workspace", label: "Trading Workspace journal" },
  { value: "manual", label: "Manual journal" },
];

const STORAGE_KEY = "journal.source.filter.v1";

const Ctx = createContext<{ source: JournalSource; setSource: (s: JournalSource) => void }>({
  source: "all",
  setSource: () => {},
});

export function JournalSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<JournalSource>("all");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as JournalSource | null;
      if (stored === "all" || stored === "workspace" || stored === "manual") setSource(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo(
    () => ({
      source,
      setSource: (s: JournalSource) => {
        setSource(s);
        try {
          window.localStorage.setItem(STORAGE_KEY, s);
        } catch {
          /* storage unavailable */
        }
      },
    }),
    [source],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJournalSource() {
  return useContext(Ctx);
}

/**
 * "Did the user write this, or did the system generate it?"
 *
 * Reads the recorded `source` rather than inferring from `!trade_id`. The
 * inference was wrong in a way that could not be seen: `trade_id` is null for
 * manual, imported AND replay entries, so it identified "not an executed
 * trade" only by accident, and an entry that LOST its `trade_id` would have
 * quietly started presenting as something the user typed.
 *
 * `trade_id` remains the fallback for rows written before the column existed;
 * the migration backfills those, so it should only ever apply mid-deploy.
 */
export function isManualEntry(e: JournalEntry): boolean {
  const source = (e as JournalEntry & { source?: string }).source;
  if (source) return source !== "trade";
  return !e.trade_id;
}

export function filterBySource(entries: JournalEntry[], source: JournalSource): JournalEntry[] {
  if (source === "all") return entries;
  return entries.filter((e) => (source === "manual" ? isManualEntry(e) : !isManualEntry(e)));
}

/**
 * Drop-in replacement for the raw entries query used across Journal pages —
 * same query cache, but the returned list already respects the active source.
 */
export function useJournalEntries() {
  const { source } = useJournalSource();
  const query = useQuery({ queryKey: journalKeys.list(), queryFn: fetchEntries, staleTime: 30_000 });
  const data = useMemo(() => filterBySource(query.data ?? [], source), [query.data, source]);
  return { ...query, data } as typeof query & { data: JournalEntry[] };
}
