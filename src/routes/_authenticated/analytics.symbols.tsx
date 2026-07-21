import { createFileRoute } from "@tanstack/react-router";
import { GroupTables } from "@/components/statistics/GroupTables";

export const Route = createFileRoute("/_authenticated/analytics/symbols")({
  component: () => (
    <div className="space-y-4">
      <GroupTables />
    </div>
  ),
});
