import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { PostCard } from "@/components/community/PostCard";
import { getCommunityProfile } from "@/lib/community.functions";
import { FollowButton } from "@/components/social/FollowButton";
import { LeagueBadge } from "@/components/social/LeagueBadge";
import { CountryFlag } from "@/components/social/CountryFlag";
import { Award, MessageSquare, Star, ThumbsUp, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/community/profile/$username")({
  component: Page,
});

function Page() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const fn = useServerFn(getCommunityProfile);
  const q = useQuery({ queryKey: ["community", "profile", username], queryFn: () => fn({ data: { username } }) });

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!q.data?.profile) return <PageHeader title="Trader not found" />;

  const p = q.data.profile;
  const rep = q.data.reputation;
  const badges: { icon: any; label: string; on: boolean }[] = rep ? [
    { icon: Star, label: "Top Contributor", on: rep.is_top_contributor },
    { icon: ThumbsUp, label: "Mentor", on: rep.is_mentor },
    { icon: Award, label: "Educator", on: rep.is_educator },
    { icon: Award, label: "Battle Champion", on: rep.is_battle_champion },
  ] : [];

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar className="h-20 w-20 border border-border">
            <AvatarImage src={p.avatar_url ?? undefined} />
            <AvatarFallback>{p.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{p.display_name || p.username}</h1>
              <LeagueBadge league={p.league} />
              <CountryFlag country={p.country} />
            </div>
            <div className="text-sm text-muted-foreground">@{p.username} · Level {p.level ?? 0} · {p.xp ?? 0} XP</div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <Stat icon={Users} label="Followers" value={q.data.followers} />
              <Stat icon={Users} label="Following" value={q.data.following} />
              <Stat icon={MessageSquare} label="Posts" value={rep?.posts_count ?? 0} />
              <Stat icon={ThumbsUp} label="Likes received" value={rep?.likes_received ?? 0} />
              <Stat icon={Star} label="Reputation" value={rep?.reputation_score ?? 0} />
            </div>
            {badges.some((b) => b.on) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.filter((b) => b.on).map((b) => {
                  const I = b.icon;
                  return (
                    <span key={b.label} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      <I className="h-3 w-3" /> {b.label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="ml-auto"><FollowButton userId={p.id} isSelf={user?.id === p.id} /></div>
        </div>
      </GlassCard>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Recent posts</h2>
        {q.data.posts.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground">No posts yet.</GlassCard>
        ) : q.data.posts.map((post: any) => <PostCard key={post.id} post={post} />)}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span className="font-semibold text-foreground">{value.toLocaleString()}</span>
      <span>{label}</span>
    </div>
  );
}
