import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { JournalSubNav } from "@/components/journal/JournalSubNav";
import { ManualEntryDialog } from "@/components/journal/ManualEntryDialog";
import { routeBoundaries } from "@/lib/route-boundaries";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — TradersHIVE Arena" },
      {
        name: "description",
        content: "Turn every trade into a story, an insight and an improvement with the TradersHIVE journal.",
      },
      { property: "og:title", content: "Trade Journal — TradersHIVE Arena" },
      {
        property: "og:description",
        content: "Turn every trade into a story, an insight and an improvement with the TradersHIVE journal.",
      },
    ],
  }),
  component: JournalLayout,
  ...routeBoundaries({
    label: "Journal",
    boundary: "journal_route",
    backHref: "/dashboard",
    backLabel: "Back to Dashboard",
  }),
});

function JournalLayout() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Journal"
        description="Trade → Story → Insight → Improvement."
        actions={<ManualEntryDialog />}
      />
      <JournalSubNav />
      <Outlet />
    </div>
  );
}
