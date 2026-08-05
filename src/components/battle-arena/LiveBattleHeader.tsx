import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Users, Timer, Activity, Trophy, ShieldCheck, Zap } from "lucide-react";
import { BattleStatusBadge } from "./BattleStatusBadge";
import { findBattleType, findMarket, findWinCondition } from "@/lib/battle-arena/constants";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Battle = { 
  id: string;
  name: string; 
  battle_type: string; 
  market: string; 
  win_condition: string; 
  status: string; 
  start_at: string; 
  end_at: string; 
  max_participants: number;
  min_participants: number;
  ranked: boolean;
  host_id: string;
  countdown_started_at?: string;
};
type Stats = { leader_user_id: string | null; leader_pnl: number; active_positions: number } | null;
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; elo?: number };

function useProgress(start: string, end: string, status: string, countdownStartedAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { 
    const t = setInterval(() => setNow(Date.now()), 1000); 
    return () => clearInterval(t); 
  }, []);

  if (status === 'countdown' && countdownStartedAt) {
    const s = new Date(countdownStartedAt).getTime();
    const e = s + 10000; // 10s countdown
    const remainingMs = Math.max(0, e - now);
    const pct = Math.min(100, Math.max(0, ((now - s) / 10000) * 100));
    return { pct, remainingMs, label: "Starting In" };
  }

  const s = new Date(start).getTime(); 
  const e = new Date(end).getTime();
  const pct = Math.min(100, Math.max(0, ((now - s) / Math.max(1, e - s)) * 100));
  const remainingMs = status === 'live' ? Math.max(0, e - now) : Math.max(0, s - now);
  const label = status === 'live' ? "Ends In" : "Starts In";
  
  return { pct, remainingMs, label };
}

function fmtRemaining(ms: number) {
  const total = Math.floor(ms / 1000);
  if (total > 3600 * 24) {
    const d = Math.floor(total / (3600 * 24));
    return `${d}d ${Math.floor((total % (3600 * 24)) / 3600)}h`;
  }
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function LiveBattleHeader({ 
  battle, 
  stats, 
  profiles, 
  participantCount 
}: { 
  battle: Battle; 
  stats: Stats; 
  profiles: Profile[]; 
  participantCount: number 
}) {
  const bt = findBattleType(battle.battle_type);
  const mk = findMarket(battle.market);
  const wc = findWinCondition(battle.win_condition);
  const { pct, remainingMs, label } = useProgress(battle.start_at, battle.end_at, battle.status, battle.countdown_started_at);
  
  const leader = stats?.leader_user_id ? profiles.find((p) => p.id === stats.leader_user_id) : null;
  const host = profiles.find(p => p.id === battle.host_id);
  const isLive = battle.status === "live";
  const isCountdown = battle.status === "countdown";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-6 shadow-2xl shadow-primary/5">
      {/* Dynamic Background Glow */}
      <div className={cn(
        "absolute -right-24 -top-24 h-64 w-64 rounded-full blur-[120px] transition-colors duration-1000",
        isLive ? "bg-success/20" : isCountdown ? "bg-primary/30" : "bg-primary/10"
      )} />
      
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <BattleStatusBadge status={battle.status as any} />
            {battle.ranked && (
              <Badge variant="outline" className="h-5 px-2 bg-primary/10 text-primary border-primary/20 font-black tracking-tighter animate-pulse">
                <Trophy className="mr-1 h-3 w-3" /> RANKED
              </Badge>
            )}
            <Badge variant="secondary" className="h-5 rounded-md font-bold px-2 text-[10px] uppercase tracking-wide bg-background/60">
              {bt.label}
            </Badge>
            <Badge variant="secondary" className="h-5 rounded-md font-bold px-2 text-[10px] uppercase tracking-wide bg-background/60">
              {mk.label}
            </Badge>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-black md:text-3xl tracking-tight flex items-center gap-3">
              {battle.name}
              {battle.status === 'live' && <Zap className="h-6 w-6 fill-success text-success animate-bounce" />}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <span>Hosted by</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background/40 border border-border/40">
                <Avatar className="h-5 w-5"><AvatarImage src={host?.avatar_url ?? undefined} /><AvatarFallback>{(host?.display_name ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                <span className="text-foreground font-bold text-xs">{host?.display_name ?? host?.username}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground font-bold tracking-tight uppercase">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background/40 border border-border/40">
              <Users className="h-4 w-4 text-primary" />
              <span>{participantCount} <span className="text-muted-foreground/60">/ {battle.max_participants} joined</span></span>
            </div>
            {isLive && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background/40 border border-border/40">
                <Activity className="h-4 w-4 text-success" />
                <span>{stats?.active_positions ?? 0} <span className="text-muted-foreground/60">Active Trades</span></span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background/40 border border-border/40">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>{wc.label}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-4 min-w-[200px]">
          <div className={cn(
            "flex flex-col items-end p-4 rounded-2xl border transition-all duration-500",
            isLive ? "bg-success/5 border-success/20" : isCountdown ? "bg-primary/5 border-primary/20 animate-pulse" : "bg-background/40 border-border/60"
          )}>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">{label}</div>
            <div className={cn(
              "flex items-center gap-2 font-black tabular-nums tracking-tighter",
              isLive ? "text-success text-3xl" : isCountdown ? "text-primary text-4xl" : "text-foreground text-2xl"
            )}>
              {isLive || isCountdown ? <Timer className={cn("h-6 w-6", isCountdown && "animate-spin")} /> : null}
              {fmtRemaining(remainingMs)}
            </div>
          </div>

          {leader && isLive && (
            <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-2 text-sm shadow-lg shadow-warning/5">
              <Crown className="h-5 w-5 text-warning fill-warning" />
              <div className="flex flex-col items-end">
                <div className="text-[9px] uppercase font-black tracking-widest text-warning/60">Current Leader</div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-foreground">{leader.display_name ?? leader.username}</span>
                  <Avatar className="h-6 w-6 border border-warning/40"><AvatarImage src={leader.avatar_url ?? undefined} /><AvatarFallback>L</AvatarFallback></Avatar>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {(isLive || isCountdown) && (
        <div className="mt-8 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-background/60 p-0.5 border border-border/20">
            <div className={cn(
              "h-full rounded-full transition-all duration-1000",
              isLive ? "bg-gradient-to-r from-primary via-success to-primary shadow-[0_0_12px_rgba(34,197,94,0.3)]" : "bg-primary shadow-[0_0_12px_rgba(79,70,229,0.3)]"
            )}
            style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
            <span>{isCountdown ? "Standby" : "Market Open"}</span>
            <span>{pct.toFixed(1)}% {isCountdown ? "Ready" : "Remaining"}</span>
            <span>{isCountdown ? "Go" : "Market Close"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
