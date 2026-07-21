import { createFileRoute } from "@tanstack/react-router";
import { KpiGrid } from "@/components/statistics/KpiGrid";
import { EquityCurveCard } from "@/components/statistics/Charts";
import { StrengthsWeaknessesCard } from "@/components/analytics/StrengthsWeaknessesCard";
import { InsightsPanel } from "@/components/statistics/InsightsPanel";
import { CompareCard } from "@/components/statistics/CompareCard";
import { GoalsPanel } from "@/components/statistics/GoalsPanel";

export const Route = createFileRoute("/_authenticated/analytics/")({
  component: () => (
    <div className="space-y-4">
      <KpiGrid />
      <EquityCurveCard />
      <StrengthsWeaknessesCard />
      <div className="grid gap-4 xl:grid-cols-2">
        <CompareCard />
        <GoalsPanel />
      </div>
      <InsightsPanel />
    </div>
  ),
});
