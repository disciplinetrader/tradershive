import { TrendingUp, Trophy, Target, Percent, ShieldAlert, Activity, Crown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Stats = {
  leader_user_id: string | null;
  leader_pnl: number;
  highest_pnl: number;
  highest_r: number;
  best_win_rate: number;
  lowest_drawdown: number;
  most_trades: number;
  best_avg_rr: number;
  active_positions: number;
  trades_closed: number;
  trades_open: number;
  avg_pnl: number;
  avg_rr: number;
  avg_win_rate: number;
  avg_drawdown: number;
} | null;

type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

function money(n: number) {
  return Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function LiveScoreboard({ stats, profiles }: { stats: Stats; profiles: Profile[] }) {
  const leader = stats?.leader_user_id ? profiles.find((p) => p.id === stats.leader_user_id) : null;
  const tiles = [
    { icon: TrendingUp, label: "Highest Profit", value: money(stats?.highest_pnl ?? 0), tone: "text-emerald-600" },
    { icon: Target,     label: "Highest R",      value: `${Number(stats?.highest_r ?? 0).toFixed(2)}R`, tone: "text-blue-600" },
    { icon: Percent,    label: "Best Win Rate",  value: `${Number(stats?.best_win_rate ?? 0).toFixed(1)}%`, tone: "text-indigo-600" },
    { icon: ShieldAlert,label: "Lowest DD",      value: `$${Number(stats?.lowest_drawdown ?? 0).toFixed(0)}`, tone: "text-rose-600" },
    { icon: Activity,   label: "Most Trades",    value: String(stats?.most_trades ?? 0), tone: "text-amber-600" },
    { icon: Trophy,     label: "Best Avg RR",    value: `${Number(stats?.best_avg_rr ?? 0).toFixed(2)}`, tone: "text-purple-600" },
  ];
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live scoreboard</h3>
        {leader && (
          <div className="flex items-center gap-2 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <Avatar className="h-5 w-5"><AvatarImage src={leader.avatar_url ?? undefined} /><AvatarFallback>{(leader.display_name ?? leader.username ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
            <span className="font-medium">{leader.display_name ?? leader.username ?? "Leader"}</span>
            <span className="text-emerald-600 tabular-nums">{money(stats?.leader_pnl ?? 0)}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border/50 bg-background/50 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${t.tone}`}>{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
