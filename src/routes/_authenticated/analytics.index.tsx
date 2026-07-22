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
  component: () => (
    <div className="space-y-4">
      <ExecutiveSummary />
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
  ),
});
