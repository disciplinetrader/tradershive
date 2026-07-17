import { createFileRoute } from "@tanstack/react-router";
import { ReportsView } from "@/components/statistics/ReportsView";
import { CompareCard } from "@/components/statistics/CompareCard";
import { InsightsPanel } from "@/components/statistics/InsightsPanel";

export const Route = createFileRoute("/_authenticated/statistics/reports")({
  component: () => (
    <div className="space-y-4">
      <CompareCard />
      <ReportsView />
      <InsightsPanel />
    </div>
  ),
});
