import { Link } from "@tanstack/react-router";
import { Users, Trophy, Coins, Lock } from "lucide-react";
import { BattleStatusBadge } from "./BattleStatusBadge";
import { CountdownTimer } from "./CountdownTimer";
import { findBattleType, findMarket, findWinCondition, type BattleStatus } from "@/lib/battle-arena/constants";

type BattleRow = {
  id: string; name: string; description: string | null; status: BattleStatus; visibility: string;
  battle_type: string; market: string; win_condition: string; start_at: string; end_at: string;
  max_participants: number; starting_balance: number; featured: boolean;
};

export function BattleCard({ battle }: { battle: BattleRow }) {
  const market = findMarket(battle.market);
  const wc = findWinCondition(battle.win_condition);
  const bt = findBattleType(battle.battle_type);

  return (
    <Link
      to="/battle-arena/$battleId"
      params={{ battleId: battle.id }}
      className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 transition hover:border-primary/40 hover:bg-card/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {battle.visibility === "private" && <Lock className="h-3 w-3 text-muted-foreground" />}
            {battle.featured && <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Featured</span>}
            <BattleStatusBadge status={battle.status} />
          </div>
          <h3 className="mt-1 truncate font-semibold group-hover:text-primary">{battle.name}</h3>
        </div>
      </div>
      {battle.description && <p className="line-clamp-2 text-xs text-muted-foreground">{battle.description}</p>}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Meta icon={Users} label={bt.label} />
        <Meta icon={Trophy} label={wc.label} />
        <Meta icon={Coins} label={`$${Number(battle.starting_balance).toLocaleString()}`} />
        <Meta icon={Users} label={market.label} />
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        {battle.status === "upcoming" && <CountdownTimer to={battle.start_at} label="Starts" />}
        {battle.status === "live" && <CountdownTimer to={battle.end_at} label="Ends" />}
        {battle.status === "completed" && <span>Ended {new Date(battle.end_at).toLocaleDateString()}</span>}
        {(battle.status === "draft" || battle.status === "cancelled") && <span>&nbsp;</span>}
        <span>Max {battle.max_participants}</span>
      </div>
    </Link>
  );
}

function Meta({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/40 px-2 py-1 text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span className="truncate">{label}</span>
    </span>
  );
}
