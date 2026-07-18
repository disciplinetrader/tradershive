import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { FeedList } from "@/components/community/FeedList";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";

export const Route = createFileRoute("/_authenticated/community/following")({
  component: () => (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <PageHeader title="Following" description="Posts from traders you follow." />
        <FeedList tab="following" />
      </div>
      <aside><CommunitySidebar /></aside>
    </div>
  ),
});
