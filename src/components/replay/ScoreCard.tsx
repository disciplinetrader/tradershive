import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useReplay } from "./context";

export function ScoreCard() {
  const { score, finish, session } = useReplay();
  const s = score;
  if (!s) {
    return (
      <GlassCard className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Replay Review</div>
        <p className="text-xs text-muted-foreground">
          When you're done, generate a review to score discipline, risk, execution, patience, and consistency.
        </p>
        <Button className="w-full" onClick={finish} disabled={!session}>
          <Sparkles className="mr-2 h-4 w-4" /> Finish & Score Replay
        </Button>
      </GlassCard>
    );
  }
  const bars: [string, number][] = [
    ["Discipline", s.discipline],
    ["Risk", s.risk],
    ["Execution", s.execution],
    ["Patience", s.patience],
    ["Consistency", s.consistency],
    ["Journal", s.journal_completion],
  ];
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Replay Score</div>
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16 }}
          className="text-3xl font-bold text-primary tabular-nums"
        >
          {s.score}<span className="text-sm text-muted-foreground">/100</span>
        </motion.div>
      </div>
      <div className="space-y-1.5">
        {bars.map(([label, v]) => (
          <div key={label}>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{label}</span><span className="tabular-nums">{v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${v}%` }}
                transition={{ duration: 0.6 }}
                className="h-full bg-primary"
              />
            </div>
          </div>
        ))}
      </div>
      {Array.isArray(s.breakdown?.notes) && s.breakdown.notes.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
          {s.breakdown.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
        </ul>
      ) : null}
    </GlassCard>
  );
}
