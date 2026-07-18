import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { FeedList } from "@/components/community/FeedList";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";

export const Route = createFileRoute("/_authenticated/community/explore")({
  component: () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <PageHeader title="Explore" description="Discover the latest ideas across every category." />
        <FeedList tab="latest" />
      </div>
      <aside><CommunitySidebar /></aside>
    </div>
  ),
});
