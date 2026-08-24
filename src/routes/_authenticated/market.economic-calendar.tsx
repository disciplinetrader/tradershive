import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { EconomicCalendarList } from "@/components/market/EconomicCalendarList";

export const Route = createFileRoute("/_authenticated/market/economic-calendar")({
  head: () => ({
    meta: [
      { title: "Economic Calendar — TradersHIVE" },
      {
        name: "description",
        content:
          "Scheduled and released macro events in your local timezone, with forecast and actual values where the provider publishes them.",
      },
    ],
  }),
  component: EconomicCalendarPage,
});

function EconomicCalendarPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Economic Calendar"
        description="Upcoming and recent macro releases. Times shown in your local timezone."
      />
      <EconomicCalendarList />
    </div>
  );
}
