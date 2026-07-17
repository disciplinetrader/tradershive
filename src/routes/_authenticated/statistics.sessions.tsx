import { createFileRoute } from "@tanstack/react-router";
import { SessionCards } from "@/components/statistics/SessionCards";
import { SessionAnalysisTable } from "@/components/statistics/GroupTables";
import { TimeOfDayCard } from "@/components/statistics/Charts";

export const Route = createFileRoute("/_authenticated/statistics/sessions")({
  component: () => (
    <div className="space-y-4">
      <SessionCards />
      <SessionAnalysisTable />
      <TimeOfDayCard />
    </div>
  ),
});
