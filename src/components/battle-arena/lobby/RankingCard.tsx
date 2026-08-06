import { useRankingSession } from "@/lib/battle-arena/hooks/use-ranking-queries";
import { LEAGUE_META } from "@/lib/social/constants";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function RankingCard() {
  const { data: session } = useRankingSession();
  const [isExpanded, setIsExpanded] = useState(false);

  // Derive tier
  const elo = session.currentRanking;
  const tiers = Object.entries(LEAGUE_META);
  let currentTier = tiers[0][1];
  let nextTier = tiers[1][1];
  let progress = 0;

  // Simple tier logic for UI demo
  if (elo >= 3000) { currentTier = LEAGUE_META.legend; nextTier = LEAGUE_META.legend; progress = 100; }
  else if (elo >= 2500) { currentTier = LEAGUE_META.grandmaster; nextTier = LEAGUE_META.legend; progress = (elo - 2500) / 5; }
  else if (elo >= 2000) { currentTier = LEAGUE_META.master; nextTier = LEAGUE_META.grandmaster; progress = (elo - 2000) / 5; }
  else if (elo >= 1500) { currentTier = LEAGUE_META.diamond; nextTier = LEAGUE_META.master; progress = (elo - 1500) / 5; }
  else if (elo >= 1200) { currentTier = LEAGUE_META.platinum; nextTier = LEAGUE_META.diamond; progress = (elo - 1200) / 3; }
  else if (elo >= 1000) { currentTier = LEAGUE_META.gold; nextTier = LEAGUE_META.platinum; progress = (elo - 1000) / 2; }
  else if (elo >= 800) { currentTier = LEAGUE_META.silver; nextTier = LEAGUE_META.gold; progress = (elo - 800) / 2; }
  else { currentTier = LEAGUE_META.bronze; nextTier = LEAGUE_META.silver; progress = elo / 8; }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-lg ring-1 ring-white/10"
              style={{ background: `linear-gradient(135deg, ${currentTier.from}, ${currentTier.to})` }}
            >
              {currentTier.icon}
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Current Ranking</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter">{elo}</span>
                <span className={cn(
                  "flex items-center text-xs font-bold",
                  session.lastDelta >= 0 ? "text-success" : "text-danger"
                )}>
                  {session.lastDelta >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                  {Math.abs(session.lastDelta)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-md space-y-2">
            <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
              <span style={{ color: currentTier.color }}>{currentTier.label}</span>
              <span className="text-muted-foreground">{nextTier.label}</span>
            </div>
            <Progress value={progress} className="h-2 bg-muted/40" indicatorClassName="bg-primary" />
            <p className="text-[10px] font-medium text-muted-foreground text-right">
              {Math.max(0, 100 - Math.round(progress))}% to next tier
            </p>
          </div>
        </div>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border/40 bg-muted/20 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          Recent Sessions {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBox label="Net Change" value={session.sessionNet} format="currency" />
                <StatBox label="Peak" value={session.sessionPeak} />
                <StatBox label="Best Day" value={session.bestDay} format="currency" />
                <StatBox label="Worst Day" value={session.worstDay} format="currency" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatBox({ label, value, format }: { label: string; value: number; format?: string }) {
  const isNeg = value < 0;
  return (
    <div className="rounded-2xl border border-border/20 bg-background/40 p-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={cn(
        "text-sm font-black",
        format === "currency" && (isNeg ? "text-danger" : value > 0 ? "text-success" : "")
      )}>
        {format === "currency" ? (isNeg ? "-" : "+") + "$" + Math.abs(value).toLocaleString() : value}
      </div>
    </div>
  );
}
