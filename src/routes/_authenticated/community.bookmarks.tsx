import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { PostCard } from "@/components/community/PostCard";
import { EmptyState } from "@/components/ui/empty-state";
import { Bookmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { listBookmarks } from "@/lib/community.functions";

export const Route = createFileRoute("/_authenticated/community/bookmarks")({
  component: Page,
});

function Page() {
  const fn = useServerFn(listBookmarks);
  const q = useQuery({ queryKey: ["community", "bookmarks"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <PageHeader title="Bookmarks" description="Posts, strategies and journals you saved." />
      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : !q.data?.posts.length ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Tap the bookmark on any post, idea or strategy to save it here for later."
          action={{ label: "Browse Community", href: "/community" }}
        />
      ) : (
        <div className="space-y-3">{q.data.posts.map((p: any) => <PostCard key={p.id} post={p} />)}</div>
      )}
    </div>
  );
}
