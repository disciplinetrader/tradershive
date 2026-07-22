import { createFileRoute } from "@tanstack/react-router";
import { BehaviouralPanel } from "@/components/statistics/BehaviouralPanel";
import { RiskConsistencyCard } from "@/components/statistics/RiskConsistencyCard";

export const Route = createFileRoute("/_authenticated/analytics/behaviour")({
  head: () => ({
    meta: [
      { title: "Behavioural Analytics — TradersHIVE Arena" },
      { name: "description", content: "Detect impulsive patterns, cutting winners, holding losers, revenge trading and risk-cap breaches — the foundation of the AI Trading Coach." },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <BehaviouralPanel />
      <RiskConsistencyCard />
    </div>
  ),
});
