import { createFileRoute } from "@tanstack/react-router";
import { RiskPanel, AccountComparison } from "@/components/statistics/RiskPanel";
import { DrawdownCard, RMultipleCard } from "@/components/statistics/Charts";
import { GoalsPanel } from "@/components/statistics/GoalsPanel";

export const Route = createFileRoute("/_authenticated/statistics/risk")({
  component: () => (
    <div className="space-y-4">
      <RiskPanel />
      <div className="grid gap-4 xl:grid-cols-2">
        <DrawdownCard />
        <RMultipleCard />
      </div>
      <AccountComparison />
      <GoalsPanel />
    </div>
  ),
});
