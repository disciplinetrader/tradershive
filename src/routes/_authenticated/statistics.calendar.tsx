import { createFileRoute } from "@tanstack/react-router";
import { CalendarHeatmap } from "@/components/statistics/CalendarHeatmap";
import { TimeOfDayCard } from "@/components/statistics/Charts";

export const Route = createFileRoute("/_authenticated/statistics/calendar")({
  component: () => (
    <div className="space-y-4">
      <CalendarHeatmap />
      <TimeOfDayCard />
    </div>
  ),
});
