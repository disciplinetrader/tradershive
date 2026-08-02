import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { FeedList } from "@/components/community/FeedList";

export const Route = createFileRoute("/_authenticated/community/following")({
  head: () => ({
    meta: [
      { title: "Following — TradersHIVE Community" },
      { name: "description", content: "Posts, setups and lessons from the traders you follow on TradersHIVE." },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <PageHeader title="Following" description="Posts from traders you follow." />
      <FeedList tab="following" />
    </div>
  ),
});
