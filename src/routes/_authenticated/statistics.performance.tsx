import { createFileRoute } from "@tanstack/react-router";
import { DailyPerformanceCard, DrawdownCard, EquityCurveCard, MonthlyPerformanceCard, RMultipleCard, TimeOfDayCard, WinRateBreakdownCard, ProfitFactorCard, ExpectancyCard } from "@/components/statistics/Charts";

export const Route = createFileRoute("/_authenticated/statistics/performance")({
  component: () => (
    <div className="space-y-4">
      <EquityCurveCard />
      <DrawdownCard />
      <div className="grid gap-4 xl:grid-cols-2">
        <MonthlyPerformanceCard />
        <DailyPerformanceCard />
      </div>
      <TimeOfDayCard />
      <div className="grid gap-4 xl:grid-cols-2">
        <WinRateBreakdownCard />
        <RMultipleCard />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ProfitFactorCard />
        <ExpectancyCard />
      </div>
    </div>
  ),
});
