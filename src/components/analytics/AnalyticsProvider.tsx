import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBacktests, listBacktestTrades } from "@/lib/analytics.functions";
import { StatisticsProvider } from "@/components/statistics/context";
import { mapReplayTradesToAnalytics } from "@/lib/statistics/backtest-source";
import type { AnalyticsTrade } from "@/lib/statistics/types";
import { useSessionContext } from "@/hooks/use-session-context";

type SourceKind = "live" | "backtest";

interface AnalyticsCtx {
  source: SourceKind;
  backtestId: string | null;
  setBacktest: (id: string | null) => void;
  backtests: Array<{ id: string; title: string | null; symbol: string; timeframe: string; status: string; updated_at: string }>;
  loadingBacktests: boolean;
  loadingBacktestTrades: boolean;
  activeBacktestLabel: string | null;
  search: string;
  setSearch: (q: string) => void;
}

const Ctx = createContext<AnalyticsCtx | null>(null);

export function useAnalytics(): AnalyticsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAnalytics must be inside <AnalyticsProvider>");
  return v;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const listFn = useServerFn(listBacktests);
  const tradesFn = useServerFn(listBacktestTrades);
  const { context } = useSessionContext();

  const [backtestId, setBacktestId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Auto-sync backtestId with context if context is replay
  useMemo(() => {
    if (context.type === "replay" && context.id && context.id !== backtestId) {
      setBacktestId(context.id);
    } else if (context.type !== "replay" && backtestId !== null) {
      setBacktestId(null);
    }
  }, [context.type, context.id]);

  const backtestsQuery = useQuery({
    queryKey: ["analytics", "backtests"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  const backtestTradesQuery = useQuery({
    queryKey: ["analytics", "backtest-trades", backtestId],
    queryFn: () => tradesFn({ data: { session_id: backtestId! } }),
    enabled: !!backtestId,
    staleTime: 60_000,
  });

  const overrideTrades: AnalyticsTrade[] | null = useMemo(() => {
    if (!backtestId || !backtestTradesQuery.data) return null;
    const { session, trades } = backtestTradesQuery.data as any;
    return mapReplayTradesToAnalytics(trades ?? [], session ?? undefined);
  }, [backtestId, backtestTradesQuery.data]);

  const setBacktest = useCallback((id: string | null) => setBacktestId(id), []);

  const activeBacktestLabel = useMemo(() => {
    if (!backtestId) return null;
    const b = (backtestsQuery.data ?? []).find((x: any) => x.id === backtestId);
    return b ? `${b.title || b.symbol} · ${b.symbol} · ${b.timeframe}` : "Selected backtest";
  }, [backtestId, backtestsQuery.data]);

  const value: AnalyticsCtx = {
    source: backtestId ? "backtest" : "live",
    backtestId,
    setBacktest,
    backtests: (backtestsQuery.data ?? []) as any,
    loadingBacktests: backtestsQuery.isPending,
    loadingBacktestTrades: backtestTradesQuery.isPending && !!backtestId,
    activeBacktestLabel,
    search,
    setSearch,
  };

  return (
    <Ctx.Provider value={value}>
      <StatisticsProvider overrideTrades={overrideTrades} disableFetch={!!backtestId}>
        {children}
      </StatisticsProvider>
    </Ctx.Provider>
  );
}
