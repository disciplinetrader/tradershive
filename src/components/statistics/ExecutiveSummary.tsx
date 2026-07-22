import { useMemo } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  DollarSign, Percent, Sigma, Target, TrendingDown, TrendingUp, Trophy, Wallet,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStatistics } from "./context";
import { computeExecutiveMetrics } from "@/lib/statistics/advanced";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";

/**
 * Executive summary — top-of-Overview snapshot required by Phase 7.
 * Consumes existing dataset via `useStatistics`, so it inherits every filter.
 */
export function ExecutiveSummary() {
  const { filtered, accounts, filters } = useStatistics();

  const startingBalance = useMemo(() => {
    if (filters.accounts.length) {
      return accounts
        .filter((a) => filters.accounts.includes(a.id))
        .reduce((sum, a) => sum + Number(a.starting_balance || 0), 0);
    }
    return accounts.reduce((sum, a) => sum + Number(a.starting_balance || 0), 0);
  }, [accounts, filters.accounts]);

  const m = useMemo(() => computeExecutiveMetrics(filtered, startingBalance), [filtered, startingBalance]);

  const tiles = [
    { label: "Current Equity",   icon: Wallet,        value: fmtCurrency(m.currentEquity), tone: m.currentEquity >= startingBalance ? "up" : "down", sub: `Start ${fmtCurrency(startingBalance)}` },
    { label: "Account Growth",   icon: TrendingUp,    value: fmtPercent(m.accountGrowthPct), tone: m.accountGrowthPct >= 0 ? "up" : "down", sub: fmtCurrency(m.netProfit) },
    { label: "Total Trades",     icon: BarChart3,     value: fmtNumber(m.totalTrades, 0), tone: "info" as const },
    { label: "Win Rate",         icon: Percent,       value: fmtPercent(m.winRate), tone: m.winRate >= 50 ? "up" : "down" },
    { label: "Profit Factor",    icon: Sigma,         value: m.profitFactor >= 999 ? "∞" : fmtNumber(m.profitFactor), tone: m.profitFactor >= 1 ? "up" : "down" },
    { label: "Expectancy",       icon: Target,        value: fmtCurrency(m.expectancy), tone: m.expectancy >= 0 ? "up" : "down", sub: "per trade" },
    { label: "Average RR",       icon: Target,        value: `${fmtNumber(m.avgRR)}R`, tone: m.avgRR >= 1 ? "up" : "down" },
    { label: "Net P/L",          icon: DollarSign,    value: fmtCurrency(m.netProfit), tone: m.netProfit >= 0 ? "up" : "down" },
    { label: "Avg Monthly Return", icon: Activity,    value: fmtPercent(m.avgMonthlyReturnPct), tone: m.avgMonthlyReturnPct >= 0 ? "up" : "down" },
    { label: "Current Drawdown", icon: TrendingDown,  value: fmtCurrency(m.currentDrawdown), tone: m.currentDrawdown > 0 ? "down" : "info" as const },
    { label: "Max Drawdown",     icon: TrendingDown,  value: fmtCurrency(m.maxDrawdown), tone: "down" as const, sub: `${fmtPercent(m.maxDrawdownPct)} of peak` },
    { label: "Recovery Factor",  icon: Trophy,        value: m.recoveryFactor >= 999 ? "∞" : fmtNumber(m.recoveryFactor), tone: m.recoveryFactor >= 1 ? "up" : "down", sub: "Net / MaxDD" },
    { label: "Payoff Ratio",     icon: BarChart3,     value: m.payoffRatio >= 999 ? "∞" : fmtNumber(m.payoffRatio), tone: m.payoffRatio >= 1 ? "up" : "down", sub: "AvgWin / AvgLoss" },
    { label: "Best Trading Day", icon: ArrowUpRight,  value: m.bestDay ? fmtCurrency(m.bestDay.pnl) : "—", tone: "up" as const, sub: m.bestDay?.date },
    { label: "Worst Trading Day",icon: ArrowDownRight,value: m.worstDay ? fmtCurrency(m.worstDay.pnl) : "—", tone: "down" as const, sub: m.worstDay?.date },
    { label: "Best Month",       icon: CalendarDays,  value: m.bestMonth ? fmtCurrency(m.bestMonth.pnl) : "—", tone: "up" as const, sub: m.bestMonth?.month },
  ];

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Executive summary</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Trading engine · Journal · Replay — reflects active filters.</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border/40 bg-background/40 p-3 min-h-[92px]">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <t.icon className="h-3 w-3" />
              <span className="truncate">{t.label}</span>
            </div>
            <div className={`mt-1 text-lg font-bold tabular-nums truncate ${t.tone === "up" ? "text-success" : t.tone === "down" ? "text-danger" : ""}`}>
              {t.value}
            </div>
            {t.sub ? <div className="text-[10px] text-muted-foreground truncate">{t.sub}</div> : null}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
