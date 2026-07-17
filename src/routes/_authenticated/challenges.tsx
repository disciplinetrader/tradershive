import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Coins, Flame, Sparkles, Trophy, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { XPBar } from "@/components/ui/xp-bar";
import { ChallengeCard, type ChallengeItem } from "@/components/gamification/ChallengeCard";
import { ProgressRing } from "@/components/gamification/ProgressRing";
import { DailyLoginPanel } from "@/components/gamification/DailyLoginPanel";
import { RewardsProvider, useRewards } from "@/components/gamification/RewardsProvider";
import { claimChallengeReward, listChallenges, getGamificationOverview } from "@/lib/gamification.functions";
import { xpForLevel } from "@/lib/constants";
import { CATEGORY_LABEL } from "@/lib/gamification/constants";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/challenges")({
  head: () => ({ meta: [{ title: "Challenges — TradersHIVE Arena" }] }),
  component: () => (
    <RewardsProvider>
      <ChallengesPage />
    </RewardsProvider>
  ),
});

function ChallengesPage() {
  const listFn = useServerFn(listChallenges);
  const overviewFn = useServerFn(getGamificationOverview);
  const claimFn = useServerFn(claimChallengeReward);
  const qc = useQueryClient();
  const { push } = useRewards();
  const [tab, setTab] = useState<string>("daily");

  const { data: overview } = useQuery({
    queryKey: ["gami", "overview"],
    queryFn: () => overviewFn({}),
  });
  const { data: challenges, isLoading } = useQuery({
    queryKey: ["gami", "challenges"],
    queryFn: () => listFn({ data: {} }) as unknown as Promise<ChallengeItem[]>,
    refetchOnWindowFocus: true,
  });

  const claim = useMutation({
    mutationFn: (uc_id: string) => claimFn({ data: { user_challenge_id: uc_id } }),
    onSuccess: (res: any) => {
      push({
        title: `Challenge complete!`,
        subtitle: res.challenge?.title,
        icon: res.challenge?.icon ?? "🏆",
        xp: res.xp_earned, coins: res.coins_earned,
        leveledUp: res.leveledUp, level: res.level, league: res.league,
      });
      qc.invalidateQueries({ queryKey: ["gami"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not claim"),
  });

  const grouped = useMemo(() => {
    const g: Record<string, ChallengeItem[]> = { daily: [], weekly: [], monthly: [], special: [], event: [] };
    (challenges ?? []).forEach((c) => (g[c.scope] ??= []).push(c));
    return g;
  }, [challenges]);

  const today = grouped.daily?.[0] ?? null;
  const level = overview?.profile.level ?? 1;
  const xp = overview?.profile.xp ?? 0;
  const needed = xpForLevel(level);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Challenges"
        description="Complete objectives to earn XP, coins, badges and league promotions."
      />

      {/* Hero */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <GlassCard className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-70" />
          <div className="relative grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <ProgressRing size={120} stroke={10} value={today ? Math.round((today.user.progress / Math.max(1, today.target)) * 100) : 0}>
              <div className="text-center">
                <div className="text-xl">{today?.icon ?? "🎯"}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Today</div>
              </div>
            </ProgressRing>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <Sparkles className="mr-1 inline h-3 w-3" /> Today's Challenge
                </span>
                {today && (
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] capitalize">
                    {CATEGORY_LABEL[today.category] ?? today.category}
                  </span>
                )}
              </div>
              <h2 className="mt-2 truncate text-xl font-bold">{today?.title ?? "No challenge today"}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{today?.description ?? "Check back soon."}</p>
              {today && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <MiniStat icon={<Zap className="h-3.5 w-3.5 text-primary" />} value={`+${today.xp_reward} XP`} />
                  <MiniStat icon={<Coins className="h-3.5 w-3.5 text-warning" />} value={`+${today.coin_reward}`} />
                  <MiniStat icon={<Flame className="h-3.5 w-3.5 text-orange-400" />} value={`${overview?.stats?.login_streak ?? 0}d streak`} />
                </div>
              )}
              {today?.user.status === "completed" && today.user.id && (
                <Button
                  onClick={() => today.user.id && claim.mutate(today.user.id)}
                  disabled={claim.isPending}
                  className="mt-4 gradient-primary text-primary-foreground shadow-elegant"
                >
                  Claim rewards
                </Button>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Level</div>
              <div className="text-3xl font-bold tabular-nums">{level}</div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs capitalize text-primary">
                <Trophy className="h-3 w-3" /> {overview?.profile.league ?? "bronze"}
              </span>
              <div className="mt-1 flex items-center justify-end gap-1 text-xs text-warning">
                <Coins className="h-3 w-3" /> {overview?.profile.coins ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <XPBar level={level} xp={xp} needed={needed} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Link to="/achievements" className="glass rounded-lg px-3 py-2 hover:bg-surface/60">
              <div className="text-muted-foreground">Achievements</div>
              <div className="font-semibold">{overview?.achievements_count ?? 0} unlocked</div>
            </Link>
            <Link to="/challenges/rewards" className="glass rounded-lg px-3 py-2 hover:bg-surface/60">
              <div className="text-muted-foreground">Rewards</div>
              <div className="font-semibold">History →</div>
            </Link>
          </div>
        </GlassCard>
      </div>

      {/* Daily login */}
      <DailyLoginPanel />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="glass">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="special">Special</TabsTrigger>
        </TabsList>
        {(["daily", "weekly", "monthly", "special"] as const).map((s) => (
          <TabsContent key={s} value={s} className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
              </div>
            ) : (grouped[s]?.length ?? 0) === 0 ? (
              <GlassCard className="p-8 text-center text-sm text-muted-foreground">
                No {s} challenges live right now. Check back soon!
              </GlassCard>
            ) : (
              <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {grouped[s].map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    claiming={claim.isPending}
                    onClaim={(id) => claim.mutate(id)}
                  />
                ))}
              </motion.div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex justify-between gap-3 pt-2 text-xs text-muted-foreground">
        <Link to="/challenges/history" className="hover:text-foreground">View history →</Link>
        <Link to="/challenges/rewards" className="hover:text-foreground">Reward ledger →</Link>
      </div>
    </div>
  );
}

function MiniStat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="glass rounded-lg px-2 py-1.5">
      <div className="flex items-center gap-1 text-xs font-semibold tabular-nums">
        {icon} {value}
      </div>
    </div>
  );
}
