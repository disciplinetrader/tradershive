import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "@/components/analytics/CompareView";
import { CompareCard } from "@/components/statistics/CompareCard";

export const Route = createFileRoute("/_authenticated/analytics/compare")({
  component: () => (
    <div className="space-y-4">
      <CompareView />
      <CompareCard />
    </div>
  ),
});
