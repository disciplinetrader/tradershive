import { motion } from "framer-motion";
import { CheckCircle2, Clock, Coins, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { CATEGORY_LABEL, DIFFICULTY_STYLES } from "@/lib/gamification/constants";
import { timeRemaining } from "@/lib/gamification/period";
import { cn } from "@/lib/utils";

export type ChallengeItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  scope: string;
  metric: string;
  target: number;
  xp_reward: number;
  coin_reward: number;
  icon: string | null;
  estimated_minutes: number | null;
  expires_at: string | null;
  user: { id: string | null; progress: number; status: string; claimed_at: string | null };
};

export function ChallengeCard({
  challenge,
  onClaim,
  claiming,
  compact,
}: {
  challenge: ChallengeItem;
  onClaim?: (uc_id: string) => void;
  claiming?: boolean;
  compact?: boolean;
}) {
  const pct = Math.min(100, Math.round((challenge.user.progress / Math.max(1, challenge.target)) * 100));
  const status = challenge.user.status;
  const isClaimed = status === "claimed";
  const isCompleted = status === "completed";
  const diff = DIFFICULTY_STYLES[challenge.difficulty] ?? DIFFICULTY_STYLES.easy;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <GlassCard className={cn("hover-lift relative flex h-full flex-col p-5 overflow-hidden", isClaimed && "opacity-70")}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-fuchsia-500/5" />
        <div className="relative flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-background/60 text-2xl">
            {challenge.icon ?? "🎯"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline" className={cn("border", diff.className)}>{diff.label}</Badge>
              <Badge variant="outline" className="border-border/60 capitalize">{challenge.scope}</Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {CATEGORY_LABEL[challenge.category] ?? challenge.category}
              </Badge>
            </div>
            <h3 className="mt-2 truncate text-base font-semibold">{challenge.title}</h3>
            {!compact && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{challenge.description}</p>
            )}
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2 text-[11px]">
          <Stat icon={<Zap className="h-3 w-3 text-primary" />} label="XP" value={`+${challenge.xp_reward}`} />
          <Stat icon={<Coins className="h-3 w-3 text-warning" />} label="Coins" value={`+${challenge.coin_reward}`} />
          <Stat icon={<Clock className="h-3 w-3" />} label="Ends" value={timeRemaining(challenge.expires_at ? new Date(challenge.expires_at) : null)} />
        </div>

        <div className="relative mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Progress</span>
            <span className="tabular-nums">{challenge.user.progress} / {challenge.target}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        <div className="relative mt-4 flex items-center justify-between">
          {isClaimed ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Claimed
            </span>
          ) : isCompleted ? (
            <Button
              size="sm"
              className="gradient-primary w-full text-primary-foreground"
              disabled={!challenge.user.id || claiming}
              onClick={() => challenge.user.id && onClaim?.(challenge.user.id)}
            >
              {claiming ? "Claiming..." : "Claim rewards"}
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {pct >= 100 ? "Ready to claim" : "In progress — auto-tracked"}
            </span>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-lg px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}
