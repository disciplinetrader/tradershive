import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyRankingSummary } from "@/lib/social.functions";
import { useAuth } from "@/hooks/use-auth";
import { xpForLevel } from "@/lib/constants";
import { AnimatedRankBadge, LeagueBadge } from "./LeagueBadge";
import { RankTrend } from "./RankTrend";
import { Trophy, Zap, TrendingUp, Calendar } from "lucide-react";

export function LeaderboardHero() {
  const { profile } = useAuth();
  const fn = useServerFn(getMyRankingSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["my-ranking-summary"],
    queryFn: () => fn({}),
    staleTime: 60_000,
  });

  const league = profile?.league ?? "bronze";
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const needed = xpForLevel(level);

  return (
    <GlassCard className="relative overflow-hidden p-6 md:p-8">
      <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-50" />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center"
      >
        <div className="flex items-center justify-center">
          <AnimatedRankBadge rank={data?.currentRank ?? 0} league={league} />
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <LeagueBadge league={league} size="md" />
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Season 1 · Live</div>
          </div>
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Hey, {profile?.display_name || profile?.username}</h2>
            <p className="text-sm text-muted-foreground">You're ranked #{isLoading ? "…" : data?.currentRank ?? "—"} on the global leaderboard.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat icon={Zap} label="Level" value={String(level)} sub={`${xp}/${needed} XP`} />
            <MiniStat icon={Trophy} label="Global Rank" value={isLoading ? "…" : `#${data?.currentRank ?? "—"}`} />
            <MiniStat icon={TrendingUp} label="Week trend" value={<RankTrend delta={data?.weeklyDelta ?? null} />} isNode />
            <MiniStat icon={Calendar} label="Month trend" value={<RankTrend delta={data?.monthlyDelta ?? null} />} isNode />
          </div>
        </div>
      </motion.div>
    </GlassCard>
  );
}

function MiniStat({
  icon: Icon, label, value, sub, isNode,
}: {
  icon: any; label: string; value: React.ReactNode; sub?: string; isNode?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 font-mono text-lg font-bold">
        {isNode ? value : value}
      </div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
