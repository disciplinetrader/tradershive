import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFeed } from "@/lib/community.functions";
import { PostCard } from "@/components/community/PostCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";

export function FeedList({
  tab, categorySlug, hashtag, symbol, authorId,
}: {
  tab: string; categorySlug?: string | null; hashtag?: string | null; symbol?: string | null; authorId?: string | null;
}) {
  const fn = useServerFn(listFeed);
  const qc = useQueryClient();
  const key = ["community", "feed", tab, categorySlug ?? null, hashtag ?? null, symbol ?? null, authorId ?? null];

  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fn({ data: { tab: tab as any, categorySlug: categorySlug ?? null, hashtag: hashtag ?? null, symbol: symbol ?? null, authorId: authorId ?? null, cursor: pageParam, limit: 20 } }),
    getNextPageParam: (last) => last.nextCursor,
    refetchOnWindowFocus: false,
  });

  // Realtime: refetch on any new post
  useEffect(() => {
    const ch = supabase
      .channel(`community-feed-${tab}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => {
        qc.invalidateQueries({ queryKey: ["community", "feed"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tab, qc]);

  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    );
  }
  if (!posts.length) {
    return <EmptyState title="Nothing here yet" description="Be the first to post — share a trade, chart, or lesson." />;
  }
  return (
    <div className="space-y-3">
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
      {query.hasNextPage ? (
        <div className="flex justify-center py-3">
          <Button size="sm" variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
