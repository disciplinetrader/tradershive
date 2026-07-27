import { ArrowDown, ArrowUp, CalendarDays, ShieldAlert, Target } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import type { ChallengeProgress } from "@/lib/prop-challenges/evaluator";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";

/**
 * The four "meter" cards that make the state of the challenge obvious at a
 * glance: profit target, daily-loss cushion, overall drawdown cushion and
 * trading days used vs required.
 */
export function RuleProgressCards({ progress, currency = "USD" }: { progress: ChallengeProgress; currency?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <RuleCard
        icon={<Target className="h-4 w-4" />}
        title="Profit target"
        pctLabel={`${progress.profit.pct.toFixed(2)}% / ${progress.profit.targetPct.toFixed(1)}%`}
        pct={Math.max(0, Math.min(100, (progress.profit.pct / progress.profit.targetPct) * 100))}
        subtitle={`${progress.profit.amount >= 0 ? "+" : ""}${formatCurrency(progress.profit.amount, currency)} of ${formatCurrency(progress.profit.targetAmount, currency)}`}
        tone={progress.profit.hit ? "pos" : progress.profit.pct >= 0 ? "info" : "warn"}
      />
      <RuleCard
        icon={<ArrowDown className="h-4 w-4" />}
        title="Daily loss buffer"
        pctLabel={`${progress.dailyLoss.remainingPct.toFixed(0)}% left`}
        pct={progress.dailyLoss.remainingPct}
        subtitle={`${formatCurrency(progress.dailyLoss.remainingAmount, currency)} before breach`}
        tone={progress.dailyLoss.safe ? "pos" : progress.dailyLoss.remainingPct > 20 ? "warn" : "neg"}
      />
      <RuleCard
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Overall drawdown"
        pctLabel={`${progress.drawdown.remainingPct.toFixed(0)}% left`}
        pct={progress.drawdown.remainingPct}
        subtitle={`${formatCurrency(progress.drawdown.remainingAmount, currency)} before breach`}
        tone={progress.drawdown.safe ? "pos" : progress.drawdown.remainingPct > 20 ? "warn" : "neg"}
      />
      <RuleCard
        icon={<CalendarDays className="h-4 w-4" />}
        title="Trading days"
        pctLabel={`${progress.tradingDays.used} / ${progress.tradingDays.required}`}
        pct={Math.min(100, (progress.tradingDays.used / Math.max(1, progress.tradingDays.required)) * 100)}
        subtitle={`${progress.duration.daysRemaining} days remaining of ${progress.duration.totalDays}`}
        tone={progress.tradingDays.met ? "pos" : "info"}
      />
    </div>
  );
}

function RuleCard({
  icon, title, pct, pctLabel, subtitle, tone,
}: {
  icon: React.ReactNode;
  title: string;
  pct: number;
  pctLabel: string;
  subtitle: string;
  tone: "pos" | "neg" | "warn" | "info";
}) {
  const toneCls =
    tone === "pos" ? "text-emerald-400" :
    tone === "neg" ? "text-rose-400" :
    tone === "warn" ? "text-amber-400" : "text-primary";
  const barCls =
    tone === "pos" ? "bg-emerald-500" :
    tone === "neg" ? "bg-rose-500" :
    tone === "warn" ? "bg-amber-500" : "bg-primary";
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 text-xs font-medium ${toneCls}`}>
          {icon}
          {title}
        </div>
        <div className={`mono-nums text-xs font-semibold ${toneCls}`}>{pctLabel}</div>
      </div>
      <Progress value={pct} className="mt-3 h-1.5" indicatorClassName={barCls} />
      <div className="mt-2 text-xs text-muted-foreground">{subtitle}</div>
      {/* Arrow to prevent unused-import when tree-shaking */}
      <span className="hidden"><ArrowUp /></span>
    </GlassCard>
  );
}
