import { motion } from "framer-motion";
import { Flame, Target, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { XPBar } from "@/components/ui/xp-bar";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { xpForLevel } from "@/lib/constants";

const MESSAGES = [
  "Discipline compounds. Execute the plan.",
  "Small edges, repeated forever.",
  "The market rewards patience — twice.",
  "Journal every trade. Every. Single. One.",
  "You don't need to be right, you need to be consistent.",
];

export function WelcomeCard() {
  const { profile } = useAuth();
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const needed = xpForLevel(level);
  const league = (profile?.league ?? "bronze").toString();
  const rank = profile?.rank ?? null;
  const streak = profile?.streak ?? 0;

  // Daily goal: journal 3 trades — simple deterministic demo based on streak
  const goalDone = Math.min(3, streak % 4);
  const goalPct = Math.round((goalDone / 3) * 100);

  const msg = MESSAGES[new Date().getDate() % MESSAGES.length];

  return (
    <GlassCard className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary capitalize">
            <Trophy className="mr-1 h-3 w-3" /> {league}
          </Badge>
          <Badge variant="outline">Lvl {level}</Badge>
          {rank ? <Badge variant="secondary">Rank #{rank}</Badge> : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
            <Flame className="h-3 w-3" /> {streak}d streak
          </span>
        </div>
        <p className="mt-3 text-sm italic text-muted-foreground">"{msg}"</p>

        <div className="mt-5">
          <XPBar level={level} xp={xp} needed={needed} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-5 rounded-2xl border border-border/40 bg-surface/60 p-4"
        >
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Target className="h-4 w-4 text-primary" /> Daily goal
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {goalDone} / 3
            </span>
          </div>
          <Progress value={goalPct} className="mt-2 h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Journal 3 trades to protect your streak.
          </p>
        </motion.div>
      </div>
    </GlassCard>
  );
}
