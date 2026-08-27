import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { FiltersBar } from "@/components/statistics/FiltersBar";
import { ExecutiveSummary } from "@/components/statistics/ExecutiveSummary";
import { BehaviouralPanel } from "@/components/statistics/BehaviouralPanel";
import { KpiGrid } from "@/components/statistics/KpiGrid";
import { InsightsPanel } from "@/components/statistics/InsightsPanel";
import { useStatistics } from "@/components/statistics/context";
import { computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber } from "@/lib/statistics/format";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";
import { ExportMenu } from "@/components/statistics/ExportMenu";

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
  /**
   * Passthrough so the statistics filter params survive navigation.
   *
   * `StatisticsProvider` keeps filters in the URL — that is what makes a
   * filtered view reloadable and shareable — and an unvalidated route would
   * drop them. Nothing is typed here on purpose: the grammar is owned by
   * `lib/statistics/filters.ts`, and duplicating it in four routes is four
   * places to disagree.
   */
  validateSearch: (search: Record<string, unknown>) => search,
  head: () => ({
    meta: [
      { title: "Performance Analytics — TradersHIVE" },
      { name: "description", content: "Deep dive into your performance metrics and behavioural patterns." },
    ],
  }),
  component: DashboardAnalyticsPage,
});

function DashboardAnalyticsPage() {
  return (
    <AnalyticsProvider>
      <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
        <DashboardHeader />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1"><FiltersBar /></div>
          <div className="shrink-0"><ExportMenu /></div>
        </div>
        <AnalyticsContent />
      </div>
    </AnalyticsProvider>
  );
}

function AnalyticsContent() {
  const { filtered, loading } = useStatistics();
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const totalPnl = kpis.netProfit;
  const up = totalPnl >= 0;

  if (loading && filtered.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-3xl h-24 bg-muted animate-shimmer" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <GlassCard className="p-8 text-center space-y-3">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold">No trades yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Log your first trade in the Journal or open a Replay session to see performance analytics.
          </p>
        </div>
      </GlassCard>
    );
  }

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
      <BehaviouralPanel />
      <InsightsPanel />
    </div>
  );
}
