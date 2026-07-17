import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Coins, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { TODAYS_CHALLENGE } from "@/lib/dashboard-mock";

export function TodaysChallenge() {
  const c = TODAYS_CHALLENGE;
  return (
    <GlassCard className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-info/10" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="mr-1 h-3 w-3" /> Daily Challenge
              </Badge>
              <Badge variant="outline">{c.difficulty}</Badge>
            </div>
            <h3 className="mt-2 truncate text-lg font-semibold">{c.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
          </div>
          {c.completed ? (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 14 }}
              className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary"
              aria-label="Challenge completed"
            >
              <CheckCircle2 className="h-6 w-6" />
            </motion.div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <div className="glass rounded-xl px-3 py-2">
            <div className="text-muted-foreground">Reward</div>
            <div className="mt-1 flex items-center gap-1 font-semibold">
              <Zap className="h-3.5 w-3.5 text-primary" /> +{c.rewardXp} XP
            </div>
          </div>
          <div className="glass rounded-xl px-3 py-2">
            <div className="text-muted-foreground">Coins</div>
            <div className="mt-1 flex items-center gap-1 font-semibold">
              <Coins className="h-3.5 w-3.5 text-warning" /> +{c.rewardCoins}
            </div>
          </div>
          <div className="glass rounded-xl px-3 py-2">
            <div className="text-muted-foreground">Est. time</div>
            <div className="mt-1 flex items-center gap-1 font-semibold">
              <Clock className="h-3.5 w-3.5" /> {c.estimatedMinutes}m
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono tabular-nums">{c.progress}%</span>
          </div>
          <Progress value={c.progress} className="h-2" />
        </div>

        <div className="mt-4 flex justify-end">
          <Button asChild className="gradient-primary text-primary-foreground shadow-elegant">
            <Link to="/challenges">{c.completed ? "View challenge" : "Start challenge"}</Link>
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
