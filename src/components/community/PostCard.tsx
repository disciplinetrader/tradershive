import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, Flag, Heart, Lightbulb, MessageSquare, MoreHorizontal, Pin, Share2, Sparkles, Star, Target, TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleBookmark, toggleReaction, reportContent } from "@/lib/community.functions";
import { POST_TYPES } from "@/lib/community/constants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SharedContentCard } from "@/components/sharing/SharedContentCard";

const POST_TYPE_META = Object.fromEntries(POST_TYPES.map((p) => [p.value, p]));

export function PostCard({ post }: { post: any }) {
  const qc = useQueryClient();
  const react = useServerFn(toggleReaction);
  const bookmark = useServerFn(toggleBookmark);
  const report = useServerFn(reportContent);

  const author = post.author ?? {};
  const authorName = author.display_name || author.username || "Trader";
  const category = post.category;
  const typeMeta = POST_TYPE_META[post.post_type as string];

  const reactionsSet = new Set(post.viewer_reactions ?? []);
  const liked = reactionsSet.has("like");
  const helpful = reactionsSet.has("helpful");
  const insightful = reactionsSet.has("insightful");

  const mut = useMutation({
    mutationFn: async ({ kind }: { kind: string }) => react({ data: { post_id: post.id, kind } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community", "feed"] }),
  });
  const bmut = useMutation({
    mutationFn: async () => bookmark({ data: { post_id: post.id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["community"] });
      toast.success(r.active ? "Bookmarked" : "Removed bookmark");
    },
  });

  return (
    <GlassCard className="p-5">
      <div className="flex items-start gap-3">
        <Link to="/community/profile/$username" params={{ username: author.username ?? "" }}>
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={author.avatar_url ?? undefined} />
            <AvatarFallback>{(author.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to="/community/profile/$username" params={{ username: author.username ?? "" }} className="truncate text-sm font-semibold hover:text-primary">
              {authorName}
            </Link>
            <span className="text-xs text-muted-foreground">@{author.username}</span>
            {author.league ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{author.league}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.published_at ?? post.created_at), { addSuffix: true })}</span>
            {post.is_pinned ? <Pin className="h-3 w-3 text-primary" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {typeMeta ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {typeMeta.label}
              </span>
            ) : null}
            {category ? (
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ color: category.color, background: `${category.color}12` }}>
                {category.name}
              </span>
            ) : null}
            {post.symbol ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                ${post.symbol}
              </span>
            ) : null}
            {post.direction ? (
              <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", post.direction === "long" ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                {post.direction === "long" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {post.direction}
              </span>
            ) : null}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Post options"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                report({ data: { post_id: post.id, reason: "inappropriate" } }).then(() => toast.success("Reported. Thanks — a moderator will review."))
              }
            >
              <Flag className="mr-2 h-4 w-4" /> Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link to="/community/post/$id" params={{ id: post.id }} className="mt-3 block">
        {post.title ? <h3 className="text-base font-semibold leading-snug tracking-tight">{post.title}</h3> : null}
        {post.body_html ? (
          <div
            className="prose prose-sm mt-1.5 max-w-none text-sm text-foreground/90 [&_a]:no-underline"
            dangerouslySetInnerHTML={{ __html: post.body_html }}
          />
        ) : post.excerpt ? (
          <p className="mt-1.5 text-sm text-foreground/90">{post.excerpt}</p>
        ) : null}
      </Link>

      {Array.isArray(post.shared_content) && post.shared_content.length > 0 ? (
        <SharedContentCard share={post.shared_content[0]} />
      ) : null}

      {Array.isArray(post.hashtags) && post.hashtags.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {post.hashtags.slice(0, 6).map((t: string) => (
            <span key={t} className="text-xs text-primary">#{t}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <ReactionButton
          active={liked}
          onClick={() => mut.mutate({ kind: "like" })}
          icon={<Heart className={cn("h-4 w-4", liked && "fill-current text-danger")} />}
          count={post.like_count}
          label="Like"
        />
        <ReactionButton
          active={helpful}
          onClick={() => mut.mutate({ kind: "helpful" })}
          icon={<Lightbulb className={cn("h-4 w-4", helpful && "fill-current text-warning")} />}
          count={post.helpful_count}
          label="Helpful"
        />
        <ReactionButton
          active={insightful}
          onClick={() => mut.mutate({ kind: "insightful" })}
          icon={<Target className={cn("h-4 w-4", insightful && "text-primary")} />}
          count={0}
          label="Insightful"
        />
        <Link
          to="/community/post/$id"
          params={{ id: post.id }}
          className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
        >
          <MessageSquare className="h-4 w-4" />
          <span>{post.comment_count ?? 0}</span>
        </Link>
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/community/post/${post.id}`).catch(() => {});
            toast.success("Link copied");
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
        <button
          onClick={() => bmut.mutate()}
          className={cn("ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted", post.viewer_bookmarked && "text-primary")}
        >
          {post.viewer_bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          <span>{post.bookmark_count ?? 0}</span>
        </button>
      </div>

      {post.is_featured ? (
        <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
          <Sparkles className="h-3 w-3" /> Featured
        </div>
      ) : null}
    </GlassCard>
  );
}

function ReactionButton({
  active, onClick, icon, count, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; count: number; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-muted", active && "text-primary")}
      aria-label={label}
    >
      {icon}
      <span className="tabular-nums">{count ?? 0}</span>
    </button>
  );
}

export { Star };
