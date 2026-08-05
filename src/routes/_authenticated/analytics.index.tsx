import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/layout/glass-card";
import { KpiGrid } from "@/components/statistics/KpiGrid";
import { EquityCurveCard } from "@/components/statistics/EquityCurveCard";
import { StrengthsWeaknessesCard } from "@/components/statistics/StrengthsWeaknessesCard";
import { BehaviouralPanel } from "@/components/statistics/BehaviouralPanel";
import { CompareCard } from "@/components/statistics/CompareCard";
import { GoalsPanel } from "@/components/statistics/GoalsPanel";
import { InsightsPanel } from "@/components/statistics/InsightsPanel";
import { ExecutiveSummary } from "@/components/statistics/ExecutiveSummary";
import { useStatistics } from "@/lib/statistics/queries";
import { computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber } from "@/lib/statistics/format";
import { useMemo } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics/")({
  component: AnalyticsOverview,
});

function AnalyticsOverview() {
  const { filtered, loading } = useStatistics();
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const totalPnl = kpis.netProfit;
  const up = totalPnl >= 0;

  return (
    <div className="space-y-4">
      {loading && filtered.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-3xl h-24 bg-muted animate-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LineChartIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">No trades yet</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Log your first trade in the Journal or open a Replay session to see performance analytics.
            </p>
          </div>
        </GlassCard>
      ) : (
        <>
          <ExecutiveSummary />
          
          <GlassCard className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Total Realized P/L</p>
                <h2 className={cn(
                  "text-3xl font-bold mt-1 tabular-nums",
                  up ? "text-success" : "text-danger"
                )}>
                  {fmtCurrency(totalPnl)}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Total R/R</p>
                <p className="text-xl font-bold mt-1 text-primary">
                  {fmtNumber(kpis.netR)}R
                </p>
              </div>
            </div>
          </GlassCard>

          <KpiGrid />
          <EquityCurveCard />
          <StrengthsWeaknessesCard />
          <BehaviouralPanel />
          <div className="grid gap-4 xl:grid-cols-2">
            <CompareCard />
            <GoalsPanel />
          </div>
          <InsightsPanel />
        </>
      )}
    </div>
  );
}
