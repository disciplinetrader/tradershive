import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { FeedList } from "@/components/community/FeedList";

export const Route = createFileRoute("/_authenticated/community/trending")({
  head: () => ({
    meta: [
      { title: "Trending — TradersHIVE Community" },
      { name: "description", content: "The most reacted-to trade ideas and discussions in the TradersHIVE community right now." },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <PageHeader title="Trending" description="What the community is talking about right now." />
      <FeedList tab="trending" />
    </div>
  ),
});
