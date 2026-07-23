import { useMemo } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock,
  DollarSign, Flame, Percent, Sigma, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { useStatistics } from "./context";
import { computeKpis } from "@/lib/statistics/calculations";
import { KpiTile } from "./KpiTile";
import { fmtDuration } from "@/lib/statistics/format";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";

export function KpiGrid() {
  const { filtered, loading } = useStatistics();
  const k = useMemo(() => computeKpis(filtered), [filtered]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
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
    { label: "Net Profit", value: k.netProfit, icon: DollarSign, tone: k.netProfit >= 0 ? "up" : "down", prefix: "$", decimals: 2 },
    { label: "Net R", value: k.netR, icon: Sigma, tone: k.netR >= 0 ? "up" : "down", decimals: 2, suffix: "R" },
    { label: "Win Rate", value: k.winRate, icon: Percent, tone: k.winRate >= 50 ? "up" : "down", decimals: 1, suffix: "%" },
    { label: "Profit Factor", value: k.profitFactor >= 999 ? "∞" : k.profitFactor, icon: BarChart3, tone: k.profitFactor >= 1 ? "up" : "down", decimals: 2 },
    { label: "Average RR", value: k.avgRR, icon: Target, tone: k.avgRR >= 1 ? "up" : "down", decimals: 2, suffix: "R" },
    { label: "Expectancy", value: k.expectancy, icon: TrendingUp, tone: k.expectancy >= 0 ? "up" : "down", prefix: "$", decimals: 2 },
    { label: "Avg Hold", value: fmtDuration(k.avgHoldSeconds), icon: Clock, tone: "info" },
    { label: "Max Drawdown", value: k.maxDrawdown, icon: TrendingDown, tone: "down", prefix: "$", decimals: 2, hint: `${k.maxDrawdownPct.toFixed(1)}% of peak` },
    { label: "Current Streak", value: k.currentStreak.count === 0 ? "—" : `${k.currentStreak.count} ${k.currentStreak.kind === "win" ? "W" : "L"}`, icon: Flame, tone: k.currentStreak.kind === "loss" ? "down" : "up" },
    { label: "Longest Win Streak", value: k.longestWinStreak, icon: ArrowUpRight, tone: "up" },
    { label: "Longest Loss Streak", value: k.longestLossStreak, icon: ArrowDownRight, tone: "down" },
    { label: "Avg Daily Profit", value: k.avgDailyProfit, icon: Activity, tone: k.avgDailyProfit >= 0 ? "up" : "down", prefix: "$", decimals: 2 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
      {items.map((it, i) => <KpiTile key={it.label} {...it} delay={i * 0.02} />)}
    </div>
  );
}
