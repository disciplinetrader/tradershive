import { createFileRoute } from "@tanstack/react-router";
import { CalendarHeatmap } from "@/components/statistics/CalendarHeatmap";
import { TimeOfDayCard, DailyPerformanceCard, MonthlyPerformanceCard } from "@/components/statistics/Charts";

export const Route = createFileRoute("/_authenticated/analytics/calendar")({
  component: () => (
    <div className="space-y-4">
      <CalendarHeatmap />
      <div className="grid gap-4 xl:grid-cols-2">
        <DailyPerformanceCard />
        <MonthlyPerformanceCard />
      </div>
      <TimeOfDayCard />
    </div>
  ),
});
