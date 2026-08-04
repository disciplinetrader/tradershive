import { createFileRoute } from "@tanstack/react-router";
import { KpiGrid } from "@/components/statistics/KpiGrid";
import { EquityCurveCard } from "@/components/statistics/Charts";
import { StrengthsWeaknessesCard } from "@/components/analytics/StrengthsWeaknessesCard";
import { InsightsPanel } from "@/components/statistics/InsightsPanel";
import { CompareCard } from "@/components/statistics/CompareCard";
import { GoalsPanel } from "@/components/statistics/GoalsPanel";
import { ExecutiveSummary } from "@/components/statistics/ExecutiveSummary";
import { BehaviouralPanel } from "@/components/statistics/BehaviouralPanel";

export const Route = createFileRoute("/_authenticated/analytics/")({
  component: AnalyticsOverview,
});

function AnalyticsOverview() {
  const { filtered } = useStatistics();
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const up = kpis.expectancy >= 0;

  return (
    <div className="space-y-4">
      <ExecutiveSummary />
      
      <GlassCard className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Total Realized P/L</p>
            <h2 className={cn(
              "text-3xl font-bold mt-1 tabular-nums",
              up ? "text-success" : "text-danger"
            )}>
              {fmtCurrency(kpis.expectancy * kpis.totalTrades)}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Total R/R</p>
            <p className="text-xl font-bold mt-1 text-primary">
              {fmtNumber(kpis.avgRR * kpis.totalTrades)}R
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
    </div>
  );
}

import { useStatistics } from "@/components/statistics/context";
import { useMemo } from "react";
import { computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber } from "@/lib/statistics/format";
import { cn } from "@/lib/utils";

