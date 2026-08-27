import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsDataset } from "@/lib/statistics.functions";
import type { AnalyticsTrade, StatisticsFilters } from "@/lib/statistics/types";
import { EMPTY_FILTERS } from "@/lib/statistics/types";
import { filterTrades, statsFiltersFromSearch, statsFiltersToSearch } from "@/lib/statistics/filters";
import { useSessionContext } from "@/hooks/use-session-context";

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

interface Props {
  children: ReactNode;
  /** Optional override — replaces the fetched dataset (used by Analytics Center backtest selector). */
  overrideTrades?: AnalyticsTrade[] | null;
  /** Skip the network fetch entirely when `overrideTrades` is supplied. */
  disableFetch?: boolean;
}

export function StatisticsProvider({ children, overrideTrades, disableFetch }: Props) {
  const fetchData = useServerFn(getAnalyticsDataset);
  const { context } = useSessionContext();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * THE URL IS THE SOURCE OF TRUTH for filters — there is no local copy.
   *
   * Two reasons, and the second is the one that matters. A filtered view
   * survives a reload and can be sent to someone, which is the whole point of
   * the exercise. And deriving state from the URL removes the state-to-URL
   * synchronisation entirely rather than managing it: with a `useState` beside
   * the search params there are two values that can disagree, and the bug that
   * produces is a control showing one thing while the data reflects another.
   *
   * This mirrors `analytics/portfolio/provider.tsx`, which already works this
   * way. `FiltersBar` mounts under four separate providers (analytics, and
   * three dashboard routes), so each gets its own shareable URL — filters do
   * not cross between those scopes, which is the behaviour that already
   * existed, now made durable.
   */
  const search = location.search as Record<string, unknown>;
  const filters = useMemo(() => statsFiltersFromSearch(search), [search]);

  const writeFilters = useCallback(
    (next: StatisticsFilters) => {
      void navigate({
        to: location.pathname,
        search: statsFiltersToSearch(next),
        replace: true,
      });
    },
    [navigate, location.pathname],
  );

  const query = useQuery({
    queryKey: ["statistics", "dataset", context.type, context.id],
    queryFn: () => fetchData({ data: { contextType: context.type, contextId: context.id } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: !disableFetch,
  });

  const raw = (overrideTrades ?? (query.data?.trades ?? [])) as AnalyticsTrade[];
  const accounts = (query.data?.accounts ?? []) as unknown as Ctx["accounts"];

  // The predicate lives in `lib/statistics/filters.ts` so it can be tested
  // without a provider. A filter that renders but does not narrow the dataset
  // looks identical to a working one from here.
  const filtered = useMemo(() => filterTrades(raw, filters), [raw, filters]);

  const value: Ctx = {
    raw, filtered, accounts, filters,
    setFilters: (u) => writeFilters(typeof u === "function" ? (u as (p: StatisticsFilters) => StatisticsFilters)(filters) : u),
    resetFilters: () => writeFilters(EMPTY_FILTERS),
    loading: disableFetch ? false : query.isPending,
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
