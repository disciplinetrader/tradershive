import { AlertTriangle, Sparkles, Trophy } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import type { ChallengeProgress, PropChallengeRow, PropChallengeDayRow } from "@/lib/prop-challenges/evaluator";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";

/**
 * Results & post-mortem card shown once a challenge reaches a terminal
 * status. Numbers are computed from the persisted daily snapshots so the
 * verdict stays stable even if the linked paper account keeps trading.
 */
export function ResultsPanel({ challenge, days, progress }: {
  challenge: PropChallengeRow;
  days: PropChallengeDayRow[];
  progress: ChallengeProgress;
}) {
  if (challenge.status === "active") return null;

  const wins = days.reduce((n, d) => n + (d.realized_pnl > 0 ? 1 : 0), 0);
  const losses = days.reduce((n, d) => n + (d.realized_pnl < 0 ? 1 : 0), 0);
  const bestDay = days.reduce((m, d) => Math.max(m, d.realized_pnl), 0);
  const worstDay = days.reduce((m, d) => Math.min(m, d.realized_pnl), 0);
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const totalTrades = days.reduce((n, d) => n + d.trades_count, 0);
  const avgTradesPerDay = days.length > 0 ? totalTrades / days.length : 0;

  const passed = challenge.status === "passed";

  return (
    <GlassCard className={`p-4 ${passed ? "border-emerald-500/40" : "border-rose-500/40"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {passed ? <Trophy className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-rose-400" />}
          <div>
            <div className="text-sm font-semibold">
              {passed ? "Challenge passed" : challenge.status === "failed" ? "Challenge failed" : "Challenge abandoned"}
            </div>
            <div className="text-xs text-muted-foreground">
              {challenge.breach_reason ?? (passed ? "All rules respected — profit target reached." : "Session closed without a verdict.")}
            </div>
          </div>
        </div>
        <Badge variant={passed ? "secondary" : "destructive"} className={passed ? "bg-emerald-500/15 text-emerald-400" : ""}>
          {progress.profit.pct >= 0 ? "+" : ""}{progress.profit.pct.toFixed(2)}%
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <Kpi label="Final equity" value={formatCurrency(Number(challenge.current_equity), challenge.currency)} />
        <Kpi label="Total P/L" value={`${progress.profit.amount >= 0 ? "+" : ""}${formatCurrency(progress.profit.amount, challenge.currency)}`}
          tone={progress.profit.amount >= 0 ? "pos" : "neg"} />
        <Kpi label="Max drawdown" value={`${((Number(challenge.peak_equity) - Number(challenge.lowest_equity)) / Number(challenge.starting_equity) * 100).toFixed(2)}%`} />
        <Kpi label="Trading days" value={`${challenge.trading_days_used}`} />
        <Kpi label="Total trades" value={`${totalTrades}`} />
        <Kpi label="Avg trades / day" value={avgTradesPerDay.toFixed(1)} />
        <Kpi label="Win days" value={`${wins} / ${wins + losses}`} sub={`${winRate.toFixed(0)}% win rate`} />
        <Kpi label="Best / Worst day"
          value={`${bestDay >= 0 ? "+" : ""}${formatCurrency(bestDay, challenge.currency)}`}
          sub={`${worstDay >= 0 ? "+" : ""}${formatCurrency(worstDay, challenge.currency)}`} />
      </div>

      <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <Sparkles className="h-4 w-4" /> AI Review — coming soon
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          A personalised review of this attempt (rule adherence, risk decisions, psychology and a next-attempt plan)
          will appear here once the AI coach is enabled for prop challenges.
        </p>
      </div>
    </GlassCard>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const cls = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-foreground";
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mono-nums text-sm font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
