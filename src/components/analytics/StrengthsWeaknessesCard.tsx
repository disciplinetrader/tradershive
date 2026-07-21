import { useMemo } from "react";
import { Award, TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStatistics } from "@/components/statistics/context";
import { computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";

/**
 * Strengths & weaknesses derived purely from the currently loaded dataset.
 * Uses simple thresholds to keep the recommendations deterministic.
 */
export function StrengthsWeaknessesCard() {
  const { filtered } = useStatistics();
  const k = useMemo(() => computeKpis(filtered), [filtered]);

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (k.winRate >= 55) strengths.push(`Win rate ${fmtPercent(k.winRate)} is above average`);
  else if (k.winRate < 40 && k.totalTrades > 10) weaknesses.push(`Win rate ${fmtPercent(k.winRate)} is below sustainable range`);

  if (k.profitFactor >= 1.5) strengths.push(`Profit factor ${fmtNumber(k.profitFactor)} — winners outsize losers`);
  else if (k.profitFactor < 1 && k.totalTrades > 10) weaknesses.push(`Profit factor ${fmtNumber(k.profitFactor)} — losers outsize winners`);

  if (k.avgRR >= 1.5) strengths.push(`Average RR ${fmtNumber(k.avgRR)}R shows healthy asymmetry`);
  else if (k.avgRR < 0.8 && k.totalTrades > 10) weaknesses.push(`Average RR ${fmtNumber(k.avgRR)}R — cutting winners too early`);

  if (k.longestLossStreak >= 5) weaknesses.push(`Longest losing streak ${k.longestLossStreak} — review risk sizing`);
  if (k.longestWinStreak >= 5) strengths.push(`Longest winning streak ${k.longestWinStreak} — momentum trading works for you`);
  if (k.expectancy > 0) strengths.push(`Positive expectancy: ${fmtCurrency(k.expectancy)} per trade`);
  else if (k.expectancy < 0 && k.totalTrades > 10) weaknesses.push(`Negative expectancy: ${fmtCurrency(k.expectancy)} per trade`);

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Award className="h-3.5 w-3.5" /> Strengths & weaknesses
      </div>
      {strengths.length === 0 && weaknesses.length === 0 ? (
        <div className="grid h-24 place-items-center text-xs text-muted-foreground">
          Not enough trades yet to derive strengths.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <TrendingUp className="h-3.5 w-3.5" /> What is working
            </div>
            {strengths.length === 0 ? (
              <div className="text-xs text-muted-foreground">No clear strengths detected yet.</div>
            ) : (
              strengths.map((s, i) => (
                <div key={i} className="rounded-lg border border-success/20 bg-success/5 p-2 text-xs">{s}</div>
              ))
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <TrendingDown className="h-3.5 w-3.5" /> What needs work
            </div>
            {weaknesses.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nothing critical flagged — keep executing your plan.</div>
            ) : (
              weaknesses.map((s, i) => (
                <div key={i} className="rounded-lg border border-danger/20 bg-danger/5 p-2 text-xs">{s}</div>
              ))
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
