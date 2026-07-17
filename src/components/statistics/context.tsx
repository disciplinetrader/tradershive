import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsDataset } from "@/lib/statistics.functions";
import type { AnalyticsTrade, StatisticsFilters } from "@/lib/statistics/types";
import { EMPTY_FILTERS } from "@/lib/statistics/types";
import { resolveDateRange } from "@/lib/statistics/date-range";

interface Ctx {
  raw: AnalyticsTrade[];
  filtered: AnalyticsTrade[];
  accounts: { id: string; name: string; currency: string; starting_balance: number; balance: number; equity: number; is_archived: boolean }[];
  filters: StatisticsFilters;
  setFilters: (updater: StatisticsFilters | ((prev: StatisticsFilters) => StatisticsFilters)) => void;
  resetFilters: () => void;
  loading: boolean;
  error: unknown;
  refresh: () => void;
}

const StatsContext = createContext<Ctx | null>(null);

export function StatisticsProvider({ children }: { children: ReactNode }) {
  const fetchData = useServerFn(getAnalyticsDataset);
  const [filters, setFilters] = useState<StatisticsFilters>(EMPTY_FILTERS);

  const query = useQuery({
    queryKey: ["statistics", "dataset"],
    queryFn: () => fetchData(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const raw = (query.data?.trades ?? []) as AnalyticsTrade[];
  const accounts = (query.data?.accounts ?? []) as Ctx["accounts"];

  const filtered = useMemo(() => {
    const range = resolveDateRange(filters.preset, filters.from, filters.to);
    return raw.filter((t) => {
      const anchor = t.closed_at ? new Date(t.closed_at) : new Date(t.opened_at);
      if (range.from && anchor < range.from) return false;
      if (range.to && anchor > range.to) return false;
      if (filters.markets.length && !filters.markets.includes(t.market)) return false;
      if (filters.symbols.length && !filters.symbols.includes(t.symbol)) return false;
      if (filters.accounts.length && (!t.account_id || !filters.accounts.includes(t.account_id))) return false;
      if (filters.directions.length && !filters.directions.includes(t.direction)) return false;
      if (filters.setups.length && (!t.setup || !filters.setups.includes(t.setup))) return false;
      if (filters.strategies.length && (!t.strategy || !filters.strategies.includes(t.strategy))) return false;
      if (filters.sessions.length && (!t.session || !filters.sessions.includes(t.session))) return false;
      if (filters.emotions.length && !filters.emotions.some((e) => t.emotions?.includes(e))) return false;
      return true;
    });
  }, [raw, filters]);

  const value: Ctx = {
    raw, filtered, accounts, filters,
    setFilters: (u) => setFilters((prev) => (typeof u === "function" ? (u as any)(prev) : u)),
    resetFilters: () => setFilters(EMPTY_FILTERS),
    loading: query.isPending,
    error: query.error,
    refresh: () => query.refetch(),
  };

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useStatistics(): Ctx {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error("useStatistics must be inside <StatisticsProvider>");
  return ctx;
}
