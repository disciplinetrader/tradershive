import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSessionContext } from "@/hooks/use-session-context";

import { getAnalyticsDataset } from "@/lib/statistics.functions";
import type { AnalyticsTrade } from "@/lib/statistics/types";
import {
  accountSnapshotOf, dedupeRecords, detectTimezone, fromAnalyticsTrade, fromClosedTrade,
  journalVersionOf, runAnalyticsCached, tradeVersionOf,
  type AnalyticsDataset, type AnalyticsFilters, type AnalyticsResult, type Resolution,
} from "@/lib/analytics";
import { filtersToSearch } from "@/lib/analytics/filters";
import { analyticsSourceKey, fetchCanonicalSources } from "@/lib/analytics/source";
import { selectFilterOptions, type FilterOptions } from "@/lib/analytics/selectors";

interface Ctx {
  dataset: AnalyticsDataset;
  result: AnalyticsResult;
  options: FilterOptions;
  filters: AnalyticsFilters;
  setFilters: (updater: AnalyticsFilters | ((prev: AnalyticsFilters) => AnalyticsFilters)) => void;
  resetFilters: () => void;
  resolution: Resolution;
  setResolution: (r: Resolution) => void;
  minSample: number;
  loading: boolean;
  error: unknown;
  refresh: () => void;
}

const AnalyticsCtx = createContext<Ctx | null>(null);

export interface ProviderProps {
  children: ReactNode;
  filters: AnalyticsFilters;
  resolution: Resolution;
  minSample?: number;
}

export function AnalyticsWorkspaceProvider({
  children, filters, resolution, minSample = 10,
}: ProviderProps) {
  const navigate = useNavigate();
  const fetchLegacy = useServerFn(getAnalyticsDataset);
  const { context } = useSessionContext();

  const legacy = useQuery({
    queryKey: ["analytics", "legacy-dataset", context.type, context.id],
    queryFn: () => fetchLegacy({ data: { contextType: context.type, contextId: context.id } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const canonical = useQuery({
    queryKey: analyticsSourceKey,
    queryFn: fetchCanonicalSources,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const timezone = useMemo(() => detectTimezone(), []);

  const dataset = useMemo<AnalyticsDataset>(() => {
    const journalEntries = canonical.data?.journalEntries ?? [];
    const journalByTradeId = new Map(journalEntries.filter((j) => j.trade_id).map((j) => [j.trade_id as string, j]));
    const journalById = new Map(journalEntries.map((j) => [j.id, j]));

    const toolRecords = (canonical.data?.closedTrades ?? []).map((t) =>
      fromClosedTrade(t, {
        journal: (t.journalEntryId ? journalById.get(t.journalEntryId) : null) ?? journalByTradeId.get(t.id) ?? null,
      }),
    );

    const legacyRecords = ((legacy.data?.trades ?? []) as AnalyticsTrade[]).map(fromAnalyticsTrade);
    const records = dedupeRecords([...toolRecords, ...legacyRecords]);

    const accounts = ((legacy.data?.accounts ?? []) as Parameters<typeof accountSnapshotOf>[0][]).map((a) =>
      accountSnapshotOf(a),
    );

    return {
      records,
      accounts,
      timezone,
      tradeVersion: tradeVersionOf(records),
      journalVersion: journalVersionOf(journalEntries),
    };
  }, [canonical.data, legacy.data, timezone]);

  const result = useMemo(
    () => runAnalyticsCached(dataset, filters, { resolution, minSample }),
    [dataset, filters, resolution, minSample],
  );

  const options = useMemo(() => selectFilterOptions(dataset), [dataset]);

  // Filters live in the URL: one shared state, and it survives a refresh.
  const setFilters = useCallback<Ctx["setFilters"]>(
    (updater) => {
      const next = typeof updater === "function" ? updater(filters) : updater;
      void navigate({
        to: "/analytics/portfolio",
        search: { ...filtersToSearch(next), res: resolution },
        replace: true,
      });
    },
    [filters, navigate, resolution],
  );

  const setResolution = useCallback(
    (r: Resolution) => {
      void navigate({
        to: "/analytics/portfolio",
        search: { ...filtersToSearch(filters), res: r },
        replace: true,
      });
    },
    [filters, navigate],
  );

  const value: Ctx = {
    dataset,
    result,
    options,
    filters,
    setFilters,
    resetFilters: () => void navigate({ to: "/analytics/portfolio", search: { res: resolution }, replace: true }),
    resolution,
    setResolution,
    minSample,
    loading: legacy.isPending || canonical.isPending,
    error: legacy.error ?? canonical.error,
    refresh: () => {
      void legacy.refetch();
      void canonical.refetch();
    },
  };

  return <AnalyticsCtx.Provider value={value}>{children}</AnalyticsCtx.Provider>;
}

export function useAnalyticsWorkspace(): Ctx {
  const ctx = useContext(AnalyticsCtx);
  if (!ctx) throw new Error("useAnalyticsWorkspace must be used inside <AnalyticsWorkspaceProvider>");
  return ctx;
}
