import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Users, Timer, Activity } from "lucide-react";
import { BattleStatusBadge } from "./BattleStatusBadge";
import { findBattleType, findMarket, findWinCondition } from "@/lib/battle-arena/constants";
import { cn } from "@/lib/utils";

type Battle = { name: string; battle_type: string; market: string; win_condition: string; status: string; start_at: string; end_at: string; max_participants: number };
type Stats = { leader_user_id: string | null; leader_pnl: number; active_positions: number } | null;
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

function useProgress(start: string, end: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = new Date(start).getTime(); const e = new Date(end).getTime();
  const pct = Math.min(100, Math.max(0, ((now - s) / Math.max(1, e - s)) * 100));
  const remainingMs = Math.max(0, e - now);
  return { pct, remainingMs, now };
}

function fmtRemaining(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function LiveBattleHeader({ battle, stats, profiles, participantCount }: { battle: Battle; stats: Stats; profiles: Profile[]; participantCount: number }) {
  const bt = findBattleType(battle.battle_type);
  const mk = findMarket(battle.market);
  const wc = findWinCondition(battle.win_condition);
  const { pct, remainingMs } = useProgress(battle.start_at, battle.end_at);
  const leader = stats?.leader_user_id ? profiles.find((p) => p.id === stats.leader_user_id) : null;
  const isLive = battle.status === "live";

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-card/40 to-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BattleStatusBadge status={battle.status as any} />
            <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-medium">{bt.label}</span>
            <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-medium">{mk.label}</span>
            <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-medium">{wc.label}</span>
          </div>
          <h1 className="mt-2 truncate text-xl font-bold md:text-2xl">{battle.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{participantCount}/{battle.max_participants} players</span>
            <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{stats?.active_positions ?? 0} open positions</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {leader && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm">
              <Crown className="h-4 w-4 text-amber-500" />
              <Avatar className="h-6 w-6"><AvatarImage src={leader.avatar_url ?? undefined} /><AvatarFallback>{(leader.display_name ?? leader.username ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Leader</div>
                <div className="font-semibold">{leader.display_name ?? leader.username}</div>
              </div>
              <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-600">
                {Number(stats?.leader_pnl ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </span>
            </div>
          )}
          <div className={cn("flex items-center gap-1.5 rounded-lg bg-background/60 px-3 py-1 font-mono tabular-nums", isLive && "text-emerald-600")}>
            <Timer className="h-3.5 w-3.5" />
            <span className="text-sm font-bold">{fmtRemaining(remainingMs)}</span>
          </div>
        </div>
      </div>

      {isLive && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
            <div className="h-full rounded-full bg-gradient-to-r from-primary via-emerald-500 to-amber-500 transition-all"
                 style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Started</span><span>{pct.toFixed(1)}% elapsed</span><span>Ends</span>
          </div>
        </div>
      )}
    </div>
  );
}
