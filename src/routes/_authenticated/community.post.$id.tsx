import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PostCard } from "@/components/community/PostCard";
import { CommentThread } from "@/components/community/CommentThread";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deletePost, getPost } from "@/lib/community.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { routeBoundaries } from "@/lib/route-boundaries";

export const Route = createFileRoute("/_authenticated/community/post/$id")({
  component: Page,
  ...routeBoundaries({
    label: "Post",
    boundary: "community_post_route",
    backHref: "/community",
    backLabel: "Back to Community",
  }),
});

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getPost);
  const del = useServerFn(deletePost);
  const q = useQuery({ queryKey: ["community", "post", id], queryFn: () => fn({ data: { id } }) });

  useEffect(() => {
    const ch = supabase
      .channel(`community-post-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments", filter: `post_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["community", "comments", id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "community_posts", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["community", "post", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const post = q.data?.post;
  const isAuthor = post && user?.id === post.author_id;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/community" })}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to feed
          </Button>
          {isAuthor ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={async () => {
              if (!confirm("Delete this post?")) return;
              await del({ data: { id } });
              toast.success("Post deleted");
              navigate({ to: "/community" });
            }}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
        {q.isLoading ? <Skeleton className="h-64 rounded-2xl" /> :
          !post ? <PageHeader title="Post not found" description="It may have been removed." /> :
          <>
            <PostCard post={post} />
            <GlassCard className="p-5">
              <div className="mb-4 text-sm font-semibold">Comments · {post.comment_count ?? 0}</div>
              <CommentThread postId={id} />
            </GlassCard>
          </>
        }
      </div>
      <aside><CommunitySidebar /></aside>
    </div>
  );
}

// Silence unused import warning for Link if not used
void Link;
