import { createFileRoute } from "@tanstack/react-router";
import { PairAnalysisTable } from "@/components/statistics/GroupTables";

export const Route = createFileRoute("/_authenticated/analytics/symbols")({
  component: () => (
    <div className="space-y-4">
      <PairAnalysisTable />
    </div>
  ),
});
