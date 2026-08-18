/**
 * Phase 2 · item 3 — how much room is left, while there is still room.
 *
 * The breach moment tells a trader the challenge is over. This tells them it
 * is coming, which is the half that changes behaviour. Both read from the same
 * single evaluation instance — a second `useChallengeMonitor` would carry its
 * own peak and its own one-shot, so this takes the evaluation as a prop.
 *
 * Amounts, not percentages. "You have $1,400 left today" is a number a trader
 * can size the next position against; "72% of your daily limit used" is not.
 */

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import type { ReplayChallengeEvaluation } from "@/lib/replay/prop-challenge";

function Meter({
  label, remaining, usedPct, testId,
}: { label: string; remaining: number; usedPct: number; testId: string }) {
  // Three bands, and the thresholds are the evaluator's own `safe` cut (60%)
  // plus a tighter one where a single average trade could end it.
  const tone = usedPct >= 85 ? "danger" : usedPct >= 60 ? "warn" : "ok";
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span
          data-testid={testId}
          className={cn(
            "font-mono text-xs tabular-nums",
            tone === "danger" && "text-destructive",
            tone === "warn" && "text-amber-500",
          )}
        >
          {formatCurrency(remaining)}
        </span>
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500",
          )}
          style={{ width: `${Math.max(0, Math.min(100, 100 - usedPct))}%` }}
        />
      </div>
    </div>
  );
}

export function ChallengeEnvelopeBar({
  evaluation,
  className,
}: {
  evaluation: ReplayChallengeEvaluation | null;
  className?: string;
}) {
  if (!evaluation) return null;
  const p = evaluation.progress;

  return (
    <div
      data-testid="challenge-envelope"
      className={cn(
        "flex items-center gap-5 border-b border-border/60 bg-card/40 px-4 py-2",
        className,
      )}
    >
      <Meter
        label="Daily left"
        testId="challenge-daily-left"
        remaining={p.dailyLoss.remainingAmount}
        usedPct={p.dailyLoss.usedPct}
      />
      <Meter
        label="Drawdown left"
        testId="challenge-dd-left"
        remaining={p.drawdown.remainingAmount}
        usedPct={p.drawdown.usedPct}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Target
        </span>
        <span className="font-mono text-xs tabular-nums" data-testid="challenge-target">
          {formatCurrency(p.profit.amount)} / {formatCurrency(p.profit.targetAmount)}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Days
        </span>
        <span className="font-mono text-xs tabular-nums" data-testid="challenge-days">
          {p.tradingDays.used} / {p.tradingDays.required}
        </span>
      </div>
    </div>
  );
}
