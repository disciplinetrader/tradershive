import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ProfileHero } from "@/components/social/ProfileHero";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityTimeline } from "@/components/social/ActivityTimeline";
import { getProfileActivity, getPublicProfile } from "@/lib/social.functions";
import { Award, Flame, LineChart, Target, TrendingUp, Trophy } from "lucide-react";
import { routeBoundaries } from "@/lib/route-boundaries";

export const Route = createFileRoute("/_authenticated/profile/$username")({
  head: ({ params }) => ({ meta: [{ title: `@${params.username} — TradersHIVE Arena` }] }),
  component: PublicProfilePage,
  ...routeBoundaries({
    label: "Profile",
    boundary: "public_profile_route",
    backHref: "/leaderboard",
    backLabel: "Back to Leaderboard",
  }),
});

function PublicProfilePage() {
  const { username } = useParams({ from: "/_authenticated/profile/$username" });
  const getProfile = useServerFn(getPublicProfile);
  const getActivity = useServerFn(getProfileActivity);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => getProfile({ data: { username } }),
    retry: false,
  });

  const { data: activity } = useQuery({
    queryKey: ["profile-activity", data?.profile.id],
    queryFn: () => getActivity({ data: { userId: data!.profile.id, limit: 40 } }),
    enabled: !!data?.profile.id && !data?.privacy?.hide_activity,
  });

  if (isLoading) {
    return <Skeleton className="h-96 rounded-3xl" />;
  }

  if (error || !data) {
    return <EmptyState title="Trader not found" description={String((error as any)?.message ?? "This profile is unavailable or private.")} />;
  }

  return (
    <div className="space-y-6">
      <ProfileHero {...data} />

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          {data.stats ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Win rate" value={`${(data.stats.winRate * 100).toFixed(1)}%`} icon={Target} />
              <StatCard label="Profit factor" value={data.stats.profitFactor.toFixed(2)} icon={TrendingUp} />
              <StatCard label="Net R" value={`${data.stats.netR.toFixed(1)}R`} icon={LineChart} />
              <StatCard label="Total trades" value={data.stats.totalTrades} icon={LineChart} />
              <StatCard label="Discipline" value={`${(data.stats.discipline * 100).toFixed(0)}%`} icon={Trophy} />
              <StatCard label="Consistency" value={`${(data.stats.consistency * 100).toFixed(0)}%`} icon={TrendingUp} />
              <StatCard label="Achievements" value={data.stats.achievements} icon={Award} />
              <StatCard label="Streak" value={`${data.profile.streak}d`} icon={Flame} />
            </div>
          ) : (
            <EmptyState title="Stats hidden" description="This trader has kept their statistics private." />
          )}
        </TabsContent>

        <TabsContent value="statistics" className="mt-6">
          {data.stats ? (
            <GlassCard className="p-6">
              <h3 className="mb-4 text-sm font-semibold">Performance</h3>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <StatRow label="Trades" value={data.stats.totalTrades} />
                <StatRow label="Net Profit" value={`$${Math.round(data.stats.profit).toLocaleString()}`} />
                <StatRow label="Win rate" value={`${(data.stats.winRate * 100).toFixed(1)}%`} />
                <StatRow label="Avg RR" value={data.stats.avgRR.toFixed(2)} />
                <StatRow label="Profit factor" value={data.stats.profitFactor.toFixed(2)} />
                <StatRow label="Net R" value={`${data.stats.netR.toFixed(1)}R`} />
                <StatRow label="Consistency" value={`${(data.stats.consistency * 100).toFixed(0)}%`} />
                <StatRow label="Discipline" value={`${(data.stats.discipline * 100).toFixed(0)}%`} />
              </div>
            </GlassCard>
          ) : (
            <EmptyState title="Stats hidden" description="This trader has hidden their statistics." />
          )}
        </TabsContent>

        <TabsContent value="achievements" className="mt-6">
          <GlassCard className="p-6">
            {data.achievements.length === 0 ? (
              <EmptyState title="No achievements yet" description="They haven't unlocked any achievements." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.achievements.map((a: any) => (
                  <div key={a.id} className="rounded-2xl border border-border/60 bg-surface/40 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Award className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{a.achievements?.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{a.achievements?.category}</div>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{a.achievements?.description}</p>
                    {a.unlocked_at ? (
                      <div className="mt-2 text-[10px] text-muted-foreground">Unlocked {new Date(a.unlocked_at).toLocaleDateString()}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <GlassCard className="p-6">
            {data.privacy?.hide_activity ? (
              <EmptyState title="Activity hidden" description="This trader has hidden their activity." />
            ) : (
              <ActivityTimeline items={(activity ?? []) as any} />
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="journal" className="mt-6">
          <EmptyState title="Journal is private" description="Journal sharing is opt-in per entry." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold">{value}</div>
    </div>
  );
}
