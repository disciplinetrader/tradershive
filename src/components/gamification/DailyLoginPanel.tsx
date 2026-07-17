import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Flame, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { claimDailyLogin, getDailyClaimStatus } from "@/lib/gamification.functions";
import { dailyRewardFor } from "@/lib/gamification/constants";
import { cn } from "@/lib/utils";
import { useRewards } from "./RewardsProvider";

export function DailyLoginPanel() {
  const getStatus = useServerFn(getDailyClaimStatus);
  const claim = useServerFn(claimDailyLogin);
  const qc = useQueryClient();
  const { push } = useRewards();

  const { data, isLoading } = useQuery({
    queryKey: ["gami", "daily-status"],
    queryFn: () => getStatus({}),
  });

  const mutation = useMutation({
    mutationFn: () => claim({}),
    onSuccess: (res: any) => {
      if (!res.alreadyClaimed) {
        push({
          title: `Day ${res.dayIndex} Claimed!`,
          subtitle: `Login streak: ${res.streak}`,
          icon: "🎁",
          xp: res.xp_earned,
          coins: res.coins_earned,
          leveledUp: res.leveledUp,
          level: res.level,
          league: res.league,
        });
      }
      qc.invalidateQueries({ queryKey: ["gami"] });
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;

  const streak = data?.streak ?? 0;
  const claimedToday = !!data?.claimedToday;
  const nextIdx = ((streak - (claimedToday ? 0 : 1)) % 7) + 1;

  return (
    <GlassCard className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning/10 via-transparent to-primary/10" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Daily Login</div>
            <div className="mt-0.5 text-lg font-semibold">Log in every day</div>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
            <Flame className="h-3.5 w-3.5" /> {streak}d streak
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => {
            const dayIdx = i + 1;
            const done = dayIdx <= streak && (dayIdx < streak || claimedToday);
            const isNext = !claimedToday && dayIdx === nextIdx;
            const reward = dailyRewardFor(dayIdx);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  "relative rounded-xl border p-2 text-center",
                  done ? "border-emerald-500/40 bg-emerald-500/10" :
                  isNext ? "border-primary/50 bg-primary/10 shadow-elegant" :
                  "border-border/40 bg-surface/30",
                  reward.bonus && "ring-1 ring-warning/40"
                )}
              >
                <div className="text-[10px] font-semibold">Day {dayIdx}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">+{reward.xp} XP</div>
                <div className="text-[10px] text-warning">+{reward.coins} 🪙</div>
              </motion.div>
            );
          })}
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={claimedToday || mutation.isPending}
          className="mt-4 w-full gradient-primary text-primary-foreground"
        >
          <Gift className="mr-1 h-4 w-4" />
          {claimedToday ? "Claimed for today" : mutation.isPending ? "Claiming..." : "Claim today's reward"}
        </Button>
      </div>
    </GlassCard>
  );
}
