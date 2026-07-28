import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  Megaphone, MessageSquare, Lightbulb, Trophy, Video, Award, Hash, TrendingUp, Users,
  ArrowRight, Flame,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PostComposer } from "@/components/community/PostComposer";
import { getCommunityHome } from "@/lib/community-home.functions";

export const Route = createFileRoute("/_authenticated/community/")({
  head: () => ({
    meta: [
      { title: "Community Home — TradersHIVE Arena" },
      { name: "description", content: "Recent discussions, popular trade ideas, top contributors, active challenges and live sessions." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const fn = useServerFn(getCommunityHome);
  const q = useQuery({ queryKey: ["community", "home"], queryFn: () => fn(), staleTime: 60_000 });
  const d = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Community Home"
        description="Ideas, mentors, groups and live sessions — everything happening in the arena right now."
      />

      <PostComposer compact />

      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {d?.pinned?.length ? (
              <GlassCard className="p-4">
                <SectionTitle icon={Megaphone} label="Pinned announcements" />
                <div className="mt-3 space-y-2">
                  {d.pinned.map((p: any) => (
                    <Link key={p.id} to="/community/post/$id" params={{ id: p.id }}
                      className="block rounded-xl border border-primary/20 bg-primary/5 p-3 hover:bg-primary/10">
                      <div className="text-sm font-semibold">{p.title ?? "Announcement"}</div>
                      {p.excerpt ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.excerpt}</div> : null}
                    </Link>
                  ))}
                </div>
              </GlassCard>
            ) : null}

            <GlassCard className="p-4">
              <SectionHeader icon={MessageSquare} label="Recent discussions" to="/community/explore" />
              {d?.recentPosts?.length ? (
                <ul className="mt-3 divide-y divide-border/40">
                  {d.recentPosts.map((p: any) => (
                    <li key={p.id} className="py-2.5">
                      <Link to="/community/post/$id" params={{ id: p.id }} className="flex items-start gap-3 hover:bg-muted/40 rounded-lg -mx-2 px-2 py-1">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={p.author?.avatar_url ?? undefined} />
                          <AvatarFallback>{(p.author?.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate font-medium text-foreground">{p.author?.display_name ?? p.author?.username ?? "Trader"}</span>
                            <span>·</span>
                            <span>{p.published_at ? formatDistanceToNow(new Date(p.published_at), { addSuffix: true }) : ""}</span>
                            {p.symbol ? <Badge variant="secondary" className="ml-auto text-[10px]">${p.symbol}</Badge> : null}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-sm font-medium">{p.title ?? p.excerpt ?? "(untitled)"}</div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{p.like_count ?? 0} likes</span>
                            <span>{p.comment_count ?? 0} comments</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={MessageSquare} title="Start the conversation" description="No posts yet — share a chart, an idea or a lesson learned." action={{ label: "Create Post", href: "/community" }} />}
            </GlassCard>

            <GlassCard className="p-4">
              <SectionHeader icon={Lightbulb} label="Popular trade ideas" to="/community/ideas" />
              {d?.popularIdeas?.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {d.popularIdeas.map((i: any) => (
                    <Link key={i.id} to="/community/ideas" className="rounded-xl border border-border/50 p-3 hover:border-primary/40">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{i.symbol} <span className={i.direction === "long" ? "text-success" : "text-danger"}>{i.direction.toUpperCase()}</span></div>
                        {i.rr ? <Badge variant="outline" className="text-[10px]">R:R {Number(i.rr).toFixed(2)}</Badge> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {i.timeframe ?? "—"} · by {i.author?.display_name ?? i.author?.username ?? "trader"}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="No ideas yet" description="Share your first trade idea." />}
            </GlassCard>

            <GlassCard className="p-4">
              <SectionHeader icon={Video} label="Upcoming live sessions" to="/community/live" />
              {d?.upcomingSessions?.length ? (
                <div className="mt-3 space-y-2">
                  {d.upcomingSessions.map((s: any) => (
                    <Link key={s.id} to="/community/live" className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3 hover:border-primary/40">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{s.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(s.start_at).toLocaleString()} · {s.session_type} · {s.attendee_count ?? 0} going
                        </div>
                      </div>
                      <Badge variant={s.status === "live" ? "default" : "outline"}>{s.status}</Badge>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="Nothing scheduled" description="Host a session for the community." />}
            </GlassCard>

            <GlassCard className="p-4">
              <SectionHeader icon={Trophy} label="Active challenges" to="/community/challenges" />
              {d?.activeChallenges?.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {d.activeChallenges.map((c: any) => (
                    <Link key={c.id} to="/community/challenges" className="rounded-xl border border-border/50 p-3 hover:border-primary/40">
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground capitalize">
                        {c.kind.replace(/_/g, " ")} · {c.participant_count ?? 0} joined · ends {formatDistanceToNow(new Date(c.end_at), { addSuffix: true })}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="No active challenges" description="New events launch weekly." />}
            </GlassCard>
          </div>

          <aside className="space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Flame className="h-3.5 w-3.5" /> Community stats
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Posts today" value={d?.stats?.postsToday ?? 0} />
                <Stat label="Open ideas" value={d?.stats?.openIdeas ?? 0} />
                <Stat label="Groups" value={d?.stats?.studyGroups ?? 0} />
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <SectionTitle icon={Users} label="Top contributors" />
              <ul className="mt-3 space-y-2">
                {(d?.topContributors ?? []).map((c: any) => (
                  <li key={c.user_id}>
                    <Link to="/community/profile/$username" params={{ username: c.profile?.username ?? "" }}
                      className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={c.profile?.avatar_url ?? undefined} />
                        <AvatarFallback>{(c.profile?.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{c.profile?.display_name ?? c.profile?.username ?? "Trader"}</div>
                        <div className="text-[10px] text-muted-foreground">{c.reputation_score} rep · {c.likes_received ?? 0} likes</div>
                      </div>
                    </Link>
                  </li>
                ))}
                {!d?.topContributors?.length ? <div className="text-xs text-muted-foreground">No contributors yet.</div> : null}
              </ul>
            </GlassCard>

            <GlassCard className="p-4">
              <SectionTitle icon={Award} label="Recent achievements" />
              <ul className="mt-3 space-y-2">
                {(d?.recentAchievements ?? []).map((a: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={a.profile?.avatar_url ?? undefined} />
                      <AvatarFallback>{(a.profile?.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="font-medium">{a.profile?.display_name ?? a.profile?.username ?? "Trader"}</span>
                      <span className="text-muted-foreground"> unlocked </span>
                      <span className="font-medium">{a.achievement?.name ?? "an achievement"}</span>
                    </div>
                  </li>
                ))}
                {!d?.recentAchievements?.length ? <div className="text-xs text-muted-foreground">No unlocks yet.</div> : null}
              </ul>
            </GlassCard>

            <GlassCard className="p-4">
              <SectionTitle icon={Hash} label="Trending topics" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(d?.tags ?? []).map((t: any) => (
                  <Link key={t.slug} to="/community" search={{ hashtag: t.slug } as any}
                    className="rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary">
                    #{t.name} <span className="opacity-60">{t.post_count}</span>
                  </Link>
                ))}
                {!d?.tags?.length ? <div className="text-xs text-muted-foreground">Nothing trending.</div> : null}
              </div>
            </GlassCard>
          </aside>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: any) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
  );
}
function SectionHeader({ icon: Icon, label, to }: any) {
  return (
    <div className="flex items-center justify-between">
      <SectionTitle icon={Icon} label={label} />
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        See all <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/40 p-2">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
