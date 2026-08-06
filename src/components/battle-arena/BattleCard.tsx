import { Link } from "@tanstack/react-router";
import { Users, Trophy, Coins, Lock, Star, Target, Timer } from "lucide-react";
import { BattleStatusBadge } from "./BattleStatusBadge";
import { CountdownTimer } from "./CountdownTimer";
import { findBattleType, findMarket, findWinCondition, type BattleStatus, getRankFromElo } from "@/lib/battle-arena/constants";
import { cn } from "@/lib/utils";

type BattleRow = {
  id: string; 
  name: string; 
  description: string | null; 
  status: any; 
  visibility: string;
  battle_type: string; 
  market: string; 
  win_condition: string; 
  start_at: string; 
  end_at: string;
  max_participants: number; 
  starting_balance: number; 
  featured: boolean;
  ranked?: boolean | null;
  profit_target_pct?: number | null;
  duration_minutes?: number | null;
};

export function BattleCard({ battle }: { battle: BattleRow }) {
  const market = findMarket(battle.market);
  const wc = findWinCondition(battle.win_condition);
  const bt = findBattleType(battle.battle_type);

  return (
    <Link
      to="/battle-arena/$battleId"  
      params={{ battleId: battle.id }}
      className={cn(
        "card-interactive group relative flex flex-col gap-4 rounded-3xl border border-border/40 bg-card/20 p-5 hover:border-primary/40 hover:bg-card/40 transition-all duration-300",
        battle.featured && "border-warning/30 bg-warning/5"
      )}
    >
      {battle.ranked && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20">
          <Star className="h-3 w-3 fill-current" />
          Competitive
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BattleStatusBadge status={battle.status} />
            {battle.visibility === "private" && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-background/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground border border-border/40">
                <Lock className="h-2.5 w-2.5" />
                Private
              </span>
            )}
            {battle.featured && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-warning/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-warning border border-warning/30">
                Featured
              </span>
            )}
          </div>
          <h3 className="mt-2.5 line-clamp-1 font-black text-lg group-hover:text-primary transition-colors leading-none tracking-tight">
            {battle.name}
          </h3>
          {battle.description && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground font-medium italic opacity-70 group-hover:opacity-100 transition-opacity">
              {battle.description}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Meta 
          icon={bt.value === 'profit_target' ? Target : bt.value === 'time_trial' ? Timer : Users} 
          label={bt.label} 
          sub={bt.value === 'profit_target' ? `${battle.profit_target_pct}% Target` : undefined}
        />
        <Meta icon={Trophy} label={wc.label} />
        <Meta icon={Coins} label={`$${Number(battle.starting_balance).toLocaleString()}`} sub="Starting" />
        <Meta icon={Users} label={market.label} sub={market.value.toUpperCase()} />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-4">
        <div className="flex items-center gap-2">
           <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-bold">
                   {i}
                </div>
              ))}
           </div>
           <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
             {battle.max_participants} Limit
           </span>
        </div>

        <div className="flex items-center text-[11px] font-black text-foreground/80">
          {battle.status === "upcoming" && <CountdownTimer to={battle.start_at} label="Starts" />}
          {battle.status === "live" && <CountdownTimer to={battle.end_at} label="Ends" />}
          {battle.status === "completed" && <span className="opacity-50">Ended {new Date(battle.end_at).toLocaleDateString()}</span>}
        </div>
      </div>
    </Link>
  );
}

function Meta({ 
  icon: Icon, 
  label, 
  sub 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-background/40 p-2.5 transition-colors group-hover:bg-background/60">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-black uppercase tracking-tight text-foreground leading-none">
          {label}
        </div>
        {sub && (
          <div className="truncate text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
