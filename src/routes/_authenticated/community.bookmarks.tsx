import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { PostCard } from "@/components/community/PostCard";
import { EmptyState } from "@/components/ui/empty-state";
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
        <EmptyState title="No bookmarks yet" description="Save posts you want to revisit — they'll show up here." />
      ) : (
        <div className="space-y-3">{q.data.posts.map((p: any) => <PostCard key={p.id} post={p} />)}</div>
      )}
    </div>
  );
}
