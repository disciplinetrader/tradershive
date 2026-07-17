import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_authenticated/statistics")({
  head: () => ({ meta: [{ title: "Statistics — TradersHIVE Arena" }] }),
  component: StatsPage,
});

function StatsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistics"
        description="Deep analytics on your edge, drawdown, expectancy, and consistency."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Expectancy" value="—" hint="Per trade" />
        <StatCard label="Profit factor" value="—" hint="Gross win / gross loss" />
        <StatCard label="Max drawdown" value="—" hint="Peak-to-trough" />
        <StatCard label="Avg R" value="—" hint="Reward:risk" />
      </div>
      <GlassCard className="p-8">
        <EmptyState
          icon={BarChart3}
          title="No data to analyze yet"
          description="Once you start journaling trades, powerful analytics will appear here."
        />
      </GlassCard>
    </div>
  );
}
