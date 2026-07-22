import { createFileRoute } from "@tanstack/react-router";
import { RiskPanel, AccountComparison } from "@/components/statistics/RiskPanel";
import { DrawdownCard } from "@/components/statistics/Charts";
import { RiskConsistencyCard } from "@/components/statistics/RiskConsistencyCard";

export const Route = createFileRoute("/_authenticated/analytics/risk")({
  component: () => (
    <div className="space-y-4">
      <RiskPanel />
      <RiskConsistencyCard />
      <AccountComparison />
      <DrawdownCard />
    </div>
  ),
});
