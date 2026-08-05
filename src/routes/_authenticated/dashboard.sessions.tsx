import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { SessionCards } from "@/components/statistics/SessionCards";
import { TimeOfDayCard } from "@/components/statistics/Charts";
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
  const [accountId, setAccountId] = useState<string | null>(null);

  return (
    <AnalyticsProvider>
      <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
        <DashboardHeader accountId={accountId} onAccountChange={setAccountId} />
        <FiltersBar />
        <div className="space-y-4">
          <SessionCards />
          <TimeOfDayCard />
        </div>
      </div>
    </AnalyticsProvider>
  );
}
