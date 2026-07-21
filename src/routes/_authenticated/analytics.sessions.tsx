import { createFileRoute } from "@tanstack/react-router";
import { SessionCards } from "@/components/statistics/SessionCards";
import { TimeOfDayCard } from "@/components/statistics/Charts";

export const Route = createFileRoute("/_authenticated/analytics/sessions")({
  component: () => (
    <div className="space-y-4">
      <SessionCards />
      <TimeOfDayCard />
    </div>
  ),
});
