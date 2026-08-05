import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { SessionManagement } from "@/components/dashboard/v2/SessionManagement";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { FiltersBar } from "@/components/statistics/FiltersBar";

export const Route = createFileRoute("/_authenticated/dashboard/sessions")({
  head: () => ({
    meta: [
      { title: "Trading Sessions — TradersHIVE" },
      { name: "description", content: "Review your trading sessions performance across different times of the day." },
    ],
  }),
  component: DashboardSessionsPage,
});

function DashboardSessionsPage() {
  return (
    <AnalyticsProvider>
      <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
        <DashboardHeader />
        <FiltersBar />
        <SessionManagement />
      </div>
    </AnalyticsProvider>
  );
}
