import { createFileRoute } from "@tanstack/react-router";
import { RiskPanel } from "@/components/statistics/RiskPanel";
import { DrawdownCard } from "@/components/statistics/Charts";

export const Route = createFileRoute("/_authenticated/analytics/risk")({
  component: () => (
    <div className="space-y-4">
      <RiskPanel />
      <DrawdownCard />
    </div>
  ),
});
