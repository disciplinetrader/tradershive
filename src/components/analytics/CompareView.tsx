import { useMemo, useState } from "react";
import { GitCompareArrows, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStatistics } from "@/components/statistics/context";
import { useAnalytics } from "./AnalyticsProvider";
import { listBacktestTrades } from "@/lib/analytics.functions";
import { mapReplayTradesToAnalytics } from "@/lib/statistics/backtest-source";
import { computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";
import { cn } from "@/lib/utils";
import type { AnalyticsTrade } from "@/lib/statistics/types";

/**
 * Side-by-side KPI comparison between the current dataset (live or backtest)
 * and a secondary saved backtest.
 */
export function CompareView() {
  const { filtered } = useStatistics();
  const { backtests, source, activeBacktestLabel } = useAnalytics();
  const tradesFn = useServerFn(listBacktestTrades);
  const [compareId, setCompareId] = useState<string | null>(null);

  const compareQ = useQuery({
    queryKey: ["analytics", "compare", compareId],
    queryFn: () => tradesFn({ data: { session_id: compareId! } }),
    enabled: !!compareId,
    staleTime: 60_000,
  });

  const compareTrades: AnalyticsTrade[] = useMemo(() => {
    if (!compareId || !compareQ.data) return [];
    const { session, trades } = compareQ.data as any;
    return mapReplayTradesToAnalytics(trades ?? [], session ?? undefined);
  }, [compareId, compareQ.data]);

  const a = useMemo(() => computeKpis(filtered), [filtered]);
  const b = useMemo(() => computeKpis(compareTrades), [compareTrades]);

  const leftLabel = source === "backtest" ? activeBacktestLabel ?? "Backtest A" : "Live trades";
  const rightLabel = compareId
    ? backtests.find((x) => x.id === compareId)?.title ?? "Backtest B"
    : "Pick something to compare";

  const rows: Array<{ label: string; a: string; b: string; delta: number; fmt: (n: number) => string }> = [
    { label: "Net profit", a: fmtCurrency(a.netProfit), b: fmtCurrency(b.netProfit), delta: a.netProfit - b.netProfit, fmt: fmtCurrency },
    { label: "Win rate", a: fmtPercent(a.winRate), b: fmtPercent(b.winRate), delta: a.winRate - b.winRate, fmt: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` },
    { label: "Profit factor", a: fmtNumber(a.profitFactor), b: fmtNumber(b.profitFactor), delta: a.profitFactor - b.profitFactor, fmt: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}` },
    { label: "Expectancy", a: fmtCurrency(a.expectancy), b: fmtCurrency(b.expectancy), delta: a.expectancy - b.expectancy, fmt: fmtCurrency },
    { label: "Avg RR", a: `${fmtNumber(a.avgRR)}R`, b: `${fmtNumber(b.avgRR)}R`, delta: a.avgRR - b.avgRR, fmt: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}R` },
    { label: "Max DD", a: fmtCurrency(a.maxDrawdown), b: fmtCurrency(b.maxDrawdown), delta: b.maxDrawdown - a.maxDrawdown, fmt: fmtCurrency },
    { label: "Trades", a: String(a.totalTrades), b: String(b.totalTrades), delta: a.totalTrades - b.totalTrades, fmt: (n) => `${n >= 0 ? "+" : ""}${n}` },
  ];

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <GitCompareArrows className="h-3.5 w-3.5" /> Compare mode
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                {compareId ? "Change" : "Select comparison"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-1.5">
              {backtests.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">Save at least one backtest first.</div>
              ) : (
                backtests.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => setCompareId(bt.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted",
                      compareId === bt.id && "bg-primary/10",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{bt.title || bt.symbol}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {bt.symbol} · {bt.timeframe} · {bt.status}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </PopoverContent>
          </Popover>
          {compareId ? (
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setCompareId(null)}>
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_120px_120px_100px] gap-2 border-b border-border/40 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div>Metric</div>
        <div className="text-right">{leftLabel}</div>
        <div className="text-right">{rightLabel}</div>
        <div className="text-right">Δ</div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_120px_120px_100px] items-center gap-2 rounded-lg px-1 py-1.5 text-xs hover:bg-muted/40">
            <div className="font-medium">{r.label}</div>
            <div className="text-right tabular-nums">{r.a}</div>
            <div className="text-right tabular-nums text-muted-foreground">{compareId ? r.b : "—"}</div>
            <div
              className={cn(
                "text-right text-[11px] tabular-nums",
                !compareId ? "text-muted-foreground" : r.delta > 0 ? "text-success" : r.delta < 0 ? "text-danger" : "text-muted-foreground",
              )}
            >
              {compareId ? r.fmt(r.delta) : "—"}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
