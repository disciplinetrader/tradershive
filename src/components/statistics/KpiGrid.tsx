import { useMemo } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown, Clock,
  DollarSign, Flame, Hash, LineChart as LineChartIcon, Percent, Shield, Sigma, Target,
  TrendingDown, TrendingUp, Trophy,
} from "lucide-react";
import { useStatistics } from "./context";
import { computeKpis } from "@/lib/statistics/calculations";
import { computeExecutiveMetrics } from "@/lib/statistics/advanced";
import { computeRiskRatios } from "@/lib/statistics/ratios";
import { KpiTile } from "./KpiTile";
import { fmtDuration } from "@/lib/statistics/format";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { usePersistentDisclosure } from "@/hooks/use-persistent-disclosure";

const PRIMARY_COUNT = 6;

export function KpiGrid() {
  const { filtered, accounts, filters, loading } = useStatistics();
  const startingBalance = useMemo(() => {
    if (filters.accounts.length === 1) {
      const a = accounts.find((x) => x.id === filters.accounts[0]);
      return a ? Number(a.starting_balance) : 0;
    }
    return 0;
  }, [accounts, filters.accounts]);
  const k = useMemo(() => computeKpis(filtered), [filtered]);
  const exec = useMemo(() => computeExecutiveMetrics(filtered, startingBalance), [filtered, startingBalance]);
  const ratios = useMemo(() => computeRiskRatios(filtered), [filtered]);
  const [showAll, , toggleAll] = usePersistentDisclosure("analytics-kpi-all", false);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {Array.from({ length: PRIMARY_COUNT }).map((_, i) => (
          <GlassCard key={i} className="p-4 space-y-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-2.5 w-12" />
          </GlassCard>
        ))}
      </div>
    );
  }

  const items: React.ComponentProps<typeof KpiTile>[] = [
    // Primary — the answers a trader wants first.
    { label: "Net Profit", value: k.netProfit, icon: DollarSign, tone: k.netProfit >= 0 ? "up" : "down", prefix: "$", decimals: 2 },
    { label: "Win Rate", value: k.winRate, icon: Percent, tone: k.winRate >= 50 ? "up" : "down", decimals: 1, suffix: "%" },
    { label: "Profit Factor", value: k.profitFactor >= 999 ? "∞" : k.profitFactor, icon: BarChart3, tone: k.profitFactor >= 1 ? "up" : "down", decimals: 2 },
    { label: "Expectancy", value: k.expectancy, icon: TrendingUp, tone: k.expectancy >= 0 ? "up" : "down", prefix: "$", decimals: 2 },
    { label: "Average RR", value: k.avgRR, icon: Target, tone: k.avgRR >= 1 ? "up" : "down", decimals: 2, suffix: "R" },
    { label: "Total Trades", value: k.totalTrades, icon: Hash, tone: "info" },
    // Advanced
    { label: "Net R", value: k.netR, icon: Sigma, tone: k.netR >= 0 ? "up" : "down", decimals: 2, suffix: "R" },
    { label: "Winners", value: k.wins, icon: ArrowUpRight, tone: "up" },
    { label: "Losers", value: k.losses, icon: ArrowDownRight, tone: "down" },
    { label: "Avg Hold", value: fmtDuration(k.avgHoldSeconds), icon: Clock, tone: "info" },
    { label: "Largest Win", value: k.largestWinner, icon: Trophy, tone: "up", prefix: "$", decimals: 2 },
    { label: "Largest Loss", value: k.largestLoser, icon: TrendingDown, tone: "down", prefix: "$", decimals: 2 },
    { label: "Current Streak", value: k.currentStreak.count === 0 ? "—" : `${k.currentStreak.count} ${k.currentStreak.kind === "win" ? "W" : "L"}`, icon: Flame, tone: k.currentStreak.kind === "loss" ? "down" : "up" },
    { label: "Max Drawdown", value: k.maxDrawdown, icon: TrendingDown, tone: "down", prefix: "$", decimals: 2, hint: `${k.maxDrawdownPct.toFixed(1)}% of peak` },
    { label: "Recovery Factor", value: exec.recoveryFactor >= 999 ? "∞" : exec.recoveryFactor, icon: Shield, tone: exec.recoveryFactor >= 1 ? "up" : "down", decimals: 2, hint: "Net Profit ÷ Max DD" },
    { label: "Sharpe (ann.)", value: ratios.sharpe, icon: LineChartIcon, tone: ratios.sharpe >= 1 ? "up" : ratios.sharpe >= 0 ? "info" : "down", decimals: 2, hint: `${ratios.tradingDays} trading days` },
    { label: "Longest Win Streak", value: k.longestWinStreak, icon: ArrowUpRight, tone: "up" },
    { label: "Longest Loss Streak", value: k.longestLossStreak, icon: ArrowDownRight, tone: "down" },
    { label: "Avg Daily Profit", value: k.avgDailyProfit, icon: Activity, tone: k.avgDailyProfit >= 0 ? "up" : "down", prefix: "$", decimals: 2 },
  ];

  const visible = showAll ? items : items.slice(0, PRIMARY_COUNT);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {visible.map((it, i) => <KpiTile key={it.label} {...it} delay={i * 0.02} />)}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleAll}
          aria-expanded={showAll}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
        >
          {showAll ? "Show fewer KPIs" : `Show all KPIs (+${items.length - PRIMARY_COUNT})`}
          <ChevronDown className={`h-3 w-3 transition-transform ${showAll ? "rotate-180" : ""}`} />
        </button>
      </div>
    </div>
  );
}
