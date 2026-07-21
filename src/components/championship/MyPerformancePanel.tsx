import { Link } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, BarChart3, BookOpen, Zap, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Rank = {
  rank?: number | null;
  previous_rank?: number | null;
  pnl?: number;
  net_profit?: number;
  r_multiple?: number;
  win_rate?: number;
  profit_factor?: number;
  avg_rr?: number;
  max_drawdown?: number;
  consistency_score?: number;
  total_trades?: number;
  current_streak?: number;
  last_trade_at?: string | null;
  score?: number;
};

type Champ = {
  starting_balance: number;
  max_drawdown_pct: number;
  max_daily_loss_pct: number;
  min_trades: number;
  status: string;
};

/**
 * "My Performance" panel used inside the tournament detail page.
 * Reads pre-computed championship_rankings row for the current user + the tournament rules.
 */
export function MyPerformancePanel({
  champ,
  rank,
  totalParticipants,
}: {
  champ: Champ;
  rank: Rank | null | undefined;
  totalParticipants?: number;
}) {
  if (!rank) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-background/30 p-8 text-center text-sm text-muted-foreground">
        You have no tournament activity yet. Place your first trade to appear on the leaderboard.
        <div className="mt-3 flex justify-center gap-2">
          <Link to="/trading">
            <Button size="sm">
              <Zap className="mr-1.5 h-3.5 w-3.5" /> Start trading
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const pnl = Number(rank.pnl ?? 0);
  const pnlPct = champ.starting_balance ? (pnl / champ.starting_balance) * 100 : 0;
  const ddUsed = Number(rank.max_drawdown ?? 0);
  const ddCap = (champ.max_drawdown_pct / 100) * champ.starting_balance;
  const ddRemaining = Math.max(0, ddCap - ddUsed);
  const target = (champ.prizeTarget as unknown as number) ?? 0;
  const totalTrades = rank.total_trades ?? 0;
  const minTrades = champ.min_trades ?? 0;
  const tradesProgress = minTrades > 0 ? Math.min(100, (totalTrades / minTrades) * 100) : 100;
  const trend =
    rank.previous_rank != null && rank.rank != null ? rank.previous_rank - rank.rank : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Rank" value={rank.rank != null ? `#${rank.rank}` : "—"} suffix={totalParticipants ? `/${totalParticipants}` : undefined} trend={trend} />
        <Kpi
          label="PnL"
          value={`${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          tone={pnl >= 0 ? "success" : "danger"}
          suffix={`(${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`}
        />
        <Kpi label="Win rate" value={`${Number(rank.win_rate ?? 0).toFixed(0)}%`} />
        <Kpi label="Avg RR" value={`${Number(rank.avg_rr ?? rank.r_multiple ?? 0).toFixed(2)}R`} />
        <Kpi label="Trades" value={String(totalTrades)} />
        <Kpi label="Streak" value={`${rank.current_streak ?? 0}`} tone={(rank.current_streak ?? 0) >= 0 ? "success" : "danger"} />
        <Kpi label="Profit factor" value={`${Number(rank.profit_factor ?? 0).toFixed(2)}`} />
        <Kpi label="Consistency" value={`${Number(rank.consistency_score ?? 0).toFixed(0)}`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Drawdown remaining</span>
            <span className="font-mono">${ddRemaining.toFixed(0)} / ${ddCap.toFixed(0)}</span>
          </div>
          <Progress className="mt-2 h-2" value={ddCap ? (ddUsed / ddCap) * 100 : 0} />
          <div className="mt-1 text-[10px] text-muted-foreground">
            Max drawdown limit: {champ.max_drawdown_pct}% of starting balance
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Minimum trades</span>
            <span className="font-mono">{totalTrades} / {minTrades || "—"}</span>
          </div>
          <Progress className="mt-2 h-2" value={tradesProgress} />
          <div className="mt-1 text-[10px] text-muted-foreground">
            {minTrades > 0
              ? tradesProgress >= 100
                ? "Eligible for final ranking"
                : "Reach the minimum trade count to qualify"
              : "No minimum trade requirement"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/trading">
          <Button size="sm">
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Trading workspace
          </Button>
        </Link>
        <Link to="/statistics">
          <Button size="sm" variant="outline">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Analytics
          </Button>
        </Link>
        <Link to="/journal">
          <Button size="sm" variant="outline">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Journal
          </Button>
        </Link>
        <Link to="/replay">
          <Button size="sm" variant="outline">
            <Film className="mr-1.5 h-3.5 w-3.5" /> Replay
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  tone,
  trend,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "success" | "danger";
  trend?: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 flex items-baseline gap-1.5 text-lg font-bold tabular-nums", tone === "success" && "text-success", tone === "danger" && "text-danger")}>
        {value}
        {suffix ? <span className="text-[10px] font-normal text-muted-foreground">{suffix}</span> : null}
        {trend != null && trend !== 0 ? (
          trend > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-danger" />
          )
        ) : null}
      </div>
    </div>
  );
}
