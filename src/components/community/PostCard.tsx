import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, Flag, Heart, Lightbulb, MessageSquare, MoreHorizontal, Pin, Share2, Sparkles, Star, Target, TrendingDown, TrendingUp } from "lucide-react";
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
      toast.success(r.active ? "Saved" : "Removed from saved");
    },
  });

  return (
    <article className="group rounded-2xl border border-border/50 bg-card/40 p-4 transition-colors hover:border-border sm:p-5">
      <header className="flex items-start gap-3">
        <Link to="/community/profile/$username" params={{ username: author.username ?? "" }} className="shrink-0">
          <Avatar className="h-10 w-10 ring-1 ring-border/70">
            <AvatarImage src={author.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">{(author.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              to="/community/profile/$username"
              params={{ username: author.username ?? "" }}
              className="truncate text-sm font-semibold hover:underline"
            >
              {authorName}
            </Link>
            {author.league ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                {author.league}
              </span>
            ) : null}
            <span className="truncate text-xs text-muted-foreground">@{author.username}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.published_at ?? post.created_at), { addSuffix: true })}
            </span>
            {post.is_pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" /> : null}
            {post.is_featured ? <Sparkles className="h-3 w-3 shrink-0 text-warning" /> : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {post.symbol ? (
              <span className="rounded-full bg-primary/10 px-2 py-px font-mono text-[10px] font-semibold text-primary">
                ${post.symbol}
              </span>
            ) : null}
            {post.direction ? (
              <span className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-px text-[10px] font-semibold uppercase",
                post.direction === "long" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
              )}>
                {post.direction === "long" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {post.direction}
              </span>
            ) : null}
            {typeMeta && typeMeta.value !== "text" ? (
              <span className="rounded-full border border-border/60 px-2 py-px text-[10px] font-medium text-muted-foreground">
                {typeMeta.label}
              </span>
            ) : null}
            {category ? (
              <span
                className="rounded-full px-2 py-px text-[10px] font-medium"
                style={{ color: category.color, background: `${category.color}14` }}
              >
                {category.name}
              </span>
            ) : null}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Post options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
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
      </header>

      <Link to="/community/post/$id" params={{ id: post.id }} className="mt-3 block">
        {post.title ? <h3 className="text-[15px] font-semibold leading-snug tracking-tight">{post.title}</h3> : null}
        {post.body_html ? (
          <div
            className="prose prose-sm mt-1.5 line-clamp-6 max-w-none text-sm leading-relaxed text-foreground/85 [&_a]:no-underline"
            dangerouslySetInnerHTML={{ __html: post.body_html }}
          />
        ) : post.excerpt ? (
          <p className="mt-1.5 line-clamp-6 text-sm leading-relaxed text-foreground/85">{post.excerpt}</p>
        ) : null}
      </Link>

      {Array.isArray(post.shared_content) && post.shared_content.length > 0 ? (
        <SharedContentCard share={post.shared_content[0]} />
      ) : null}

      {Array.isArray(post.hashtags) && post.hashtags.length ? (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
          {post.hashtags.slice(0, 6).map((t: string) => (
            <span key={t} className="text-xs font-medium text-primary">#{t}</span>
          ))}
        </div>
      ) : null}

      <footer className="mt-3.5 flex items-center gap-0.5 border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
        <ReactionButton
          active={liked}
          activeClass="text-danger"
          onClick={() => mut.mutate({ kind: "like" })}
          icon={<Heart className={cn("h-[15px] w-[15px]", liked && "fill-current")} />}
          count={post.like_count}
          label="Like"
        />
        <ReactionButton
          active={helpful}
          activeClass="text-warning"
          onClick={() => mut.mutate({ kind: "helpful" })}
          icon={<Lightbulb className={cn("h-[15px] w-[15px]", helpful && "fill-current")} />}
          count={post.helpful_count}
          label="Helpful"
        />
        <ReactionButton
          active={insightful}
          activeClass="text-primary"
          onClick={() => mut.mutate({ kind: "insightful" })}
          icon={<Target className="h-[15px] w-[15px]" />}
          count={0}
          label="Insightful"
        />
        <Link
          to="/community/post/$id"
          params={{ id: post.id }}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-muted/70 hover:text-foreground"
          aria-label="Comments"
        >
          <MessageSquare className="h-[15px] w-[15px]" />
          <span className="tabular-nums">{post.comment_count ?? 0}</span>
        </Link>
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/community/post/${post.id}`).catch(() => {});
            toast.success("Link copied");
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-muted/70 hover:text-foreground"
          aria-label="Share post"
        >
          <Share2 className="h-[15px] w-[15px]" />
        </button>
        <button
          onClick={() => bmut.mutate()}
          aria-label="Save post"
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-muted/70 hover:text-foreground",
            post.viewer_bookmarked && "text-primary",
          )}
        >
          {post.viewer_bookmarked ? <BookmarkCheck className="h-[15px] w-[15px]" /> : <Bookmark className="h-[15px] w-[15px]" />}
          <span className="tabular-nums">{post.bookmark_count ?? 0}</span>
        </button>
      </footer>
    </article>
  );
}

function ReactionButton({
  active, onClick, icon, count, label, activeClass,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; count: number; label: string; activeClass: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-muted/70 hover:text-foreground",
        active && activeClass,
      )}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
      <span className="tabular-nums">{count ?? 0}</span>
    </button>
  );
}

export { Star };
