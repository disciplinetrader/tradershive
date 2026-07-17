import { createFileRoute } from "@tanstack/react-router";
import { KpiGrid } from "@/components/statistics/KpiGrid";
import { EquityCurveCard, MonthlyPerformanceCard, DailyPerformanceCard, WinRateBreakdownCard, ProfitFactorCard, ExpectancyCard, DrawdownCard, RMultipleCard } from "@/components/statistics/Charts";
import { SessionCards } from "@/components/statistics/SessionCards";
import { InsightsPanel } from "@/components/statistics/InsightsPanel";
import { GoalsPanel } from "@/components/statistics/GoalsPanel";
import { CompareCard } from "@/components/statistics/CompareCard";

export const Route = createFileRoute("/_authenticated/statistics/")({
  component: StatsOverview,
});

function StatsOverview() {
  return (
    <div className="space-y-4">
      <KpiGrid />
      <EquityCurveCard />
      <div className="grid gap-4 xl:grid-cols-2">
        <MonthlyPerformanceCard />
        <DailyPerformanceCard />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <WinRateBreakdownCard />
        <ProfitFactorCard />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ExpectancyCard />
        <DrawdownCard />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RMultipleCard />
        <CompareCard />
      </div>
      <SessionCards />
      <InsightsPanel />
      <GoalsPanel />
    </div>
  );
}
