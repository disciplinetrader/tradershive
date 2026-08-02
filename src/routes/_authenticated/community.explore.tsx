import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { FeedList } from "@/components/community/FeedList";

export const Route = createFileRoute("/_authenticated/community/explore")({
  head: () => ({
    meta: [
      { title: "Explore — TradersHIVE Community" },
      { name: "description", content: "Discover the newest trade ideas, charts and lessons from across every TradersHIVE category." },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <PageHeader title="Explore" description="Discover the latest ideas across every category." />
      <FeedList tab="latest" />
    </div>
  ),
});
