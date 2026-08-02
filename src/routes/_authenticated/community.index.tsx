import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Megaphone, Video, Trophy, Lightbulb, Users, Flame, Clock, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PostComposer } from "@/components/community/PostComposer";
import { FeedList } from "@/components/community/FeedList";
import { getCommunityHome } from "@/lib/community-home.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/community/")({
  head: () => ({
    meta: [
      { title: "Community Feed — TradersHIVE Arena" },
      { name: "description", content: "The live TradersHIVE feed: trade ideas, charts, lessons, live sessions and challenges from the community." },
      { property: "og:title", content: "Community Feed — TradersHIVE Arena" },
      { property: "og:description", content: "Follow traders, share setups and join live sessions in the TradersHIVE community." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const TABS = [
  { value: "latest", label: "For you", icon: Flame },
  { value: "following", label: "Following", icon: Users },
  { value: "trending", label: "Trending", icon: Clock },
] as const;

function HomePage() {
  const fn = useServerFn(getCommunityHome);
  const q = useQuery({ queryKey: ["community", "home"], queryFn: () => fn(), staleTime: 60_000 });
  const d = q.data as any;
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("latest");

  return (
    <div className="space-y-4">
      <PulseRail data={d} loading={q.isLoading} />

      <PostComposer compact />

      {d?.pinned?.length ? (
        <div className="space-y-2">
          {d.pinned.map((p: any) => (
            <Link
              key={p.id}
              to="/community/post/$id"
              params={{ id: p.id }}
              className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 transition hover:bg-primary/10"
            >
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{p.title ?? "Announcement"}</div>
                {p.excerpt ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.excerpt}</div> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {/* Feed tabs — the familiar For you / Following switch */}
      <div className="sticky top-0 z-20 -mx-1 bg-background/80 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <FeedList tab={tab} />
    </div>
  );
}

/** Story-style horizontal rail: live sessions, challenges, hot ideas and top traders. */
function PulseRail({ data, loading }: { data: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-[150px] shrink-0 rounded-2xl" />)}
      </div>
    );
  }

  const sessions = data?.upcomingSessions ?? [];
  const challenges = data?.activeChallenges ?? [];
  const ideas = data?.popularIdeas ?? [];
  const contributors = data?.topContributors ?? [];

  if (!sessions.length && !challenges.length && !ideas.length && !contributors.length) return null;

  return (
    <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
      {sessions.slice(0, 3).map((s: any) => (
        <PulseCard
          key={`s-${s.id}`}
          to="/community/live"
          icon={Video}
          tone={s.status === "live" ? "live" : "default"}
          eyebrow={s.status === "live" ? "Live now" : "Session"}
          title={s.title}
          meta={`${new Date(s.start_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${s.attendee_count ?? 0} going`}
        />
      ))}
      {challenges.slice(0, 2).map((c: any) => (
        <PulseCard
          key={`c-${c.id}`}
          to="/community/challenges"
          icon={Trophy}
          eyebrow="Challenge"
          title={c.title}
          meta={`${c.participant_count ?? 0} joined · ends ${formatDistanceToNow(new Date(c.end_at), { addSuffix: true })}`}
        />
      ))}
      {ideas.slice(0, 3).map((i: any) => (
        <PulseCard
          key={`i-${i.id}`}
          to="/community/ideas"
          icon={Lightbulb}
          eyebrow={`${i.symbol} ${i.direction === "long" ? "LONG" : "SHORT"}`}
          title={i.timeframe ? `${i.timeframe} setup` : "Trade idea"}
          meta={`by ${i.author?.display_name ?? i.author?.username ?? "trader"}`}
        />
      ))}
      {contributors.slice(0, 4).map((c: any) => (
        <Link
          key={`u-${c.user_id}`}
          to="/community/profile/$username"
          params={{ username: c.profile?.username ?? "" }}
          className="flex w-[150px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/40 p-3 text-center transition hover:border-primary/40"
        >
          <Avatar className="h-11 w-11 ring-2 ring-primary/25">
            <AvatarImage src={c.profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">{(c.profile?.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{c.profile?.display_name ?? c.profile?.username ?? "Trader"}</div>
            <div className="text-[10px] text-muted-foreground">{c.reputation_score} rep</div>
          </div>
        </Link>
      ))}
      <Link
        to="/community/explore"
        className="flex w-[150px] shrink-0 snap-start flex-col justify-center gap-1 rounded-2xl border border-dashed border-border/60 p-3 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
      >
        <ArrowRight className="h-4 w-4" />
        Explore everything
      </Link>
    </div>
  );
}

function PulseCard({
  to, icon: Icon, eyebrow, title, meta, tone = "default",
}: { to: string; icon: any; eyebrow: string; title: string; meta: string; tone?: "default" | "live" }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex w-[190px] shrink-0 snap-start flex-col gap-1 rounded-2xl border p-3 transition hover:border-primary/40",
        tone === "live" ? "border-danger/40 bg-danger/5" : "border-border/50 bg-card/40",
      )}
    >
      <div className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", tone === "live" ? "text-danger" : "text-muted-foreground")}>
        <Icon className="h-3 w-3" /> {eyebrow}
      </div>
      <div className="line-clamp-2 text-xs font-semibold leading-snug">{title}</div>
      <div className="mt-auto line-clamp-1 text-[10px] text-muted-foreground">{meta}</div>
    </Link>
  );
}
