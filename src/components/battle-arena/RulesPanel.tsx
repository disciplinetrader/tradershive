import { Trophy, Target, TrendingDown, Percent, DollarSign, Clock, Globe, Users, Coins, Shield, Hash } from "lucide-react";
import { findBattleType, findMarket, findWinCondition, WIN_CONDITIONS } from "@/lib/battle-arena/constants";

export function RulesPanel({ battle }: { battle: any }) {
  const market = findMarket(battle.market);
  const bt = findBattleType(battle.battle_type);
  const wc = findWinCondition(battle.win_condition);
  const rows: [React.ComponentType<{ className?: string }>, string, string][] = [
    [Users, "Format", bt.label],
    [Globe, "Market", market.label],
    [Trophy, "Win condition", wc.label],
    [Coins, "Starting balance", `$${Number(battle.starting_balance).toLocaleString()}`],
    [Percent, "Max risk / trade", `${battle.max_risk_pct}%`],
    [TrendingDown, "Max daily loss", `${battle.max_daily_loss_pct}%`],
    [Shield, "Max drawdown", `${battle.max_drawdown_pct}%`],
    ...(battle.max_trades ? [[Hash, "Max trades", `${battle.max_trades}`] as [any, string, string]] : []),
    [Clock, "Starts", new Date(battle.start_at).toLocaleString()],
    [Clock, "Ends", new Date(battle.end_at).toLocaleString()],
    ...(battle.target_value && (battle.win_condition === "first_to_target") ? [[Target, "Target profit", `$${battle.target_value}`] as [any, string, string]] : []),
  ];
  return (
    <aside className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-4">
      <div>
        <h3 className="font-semibold">Rules</h3>
        <p className="text-xs text-muted-foreground">All trades placed with the battle account must respect these rules.</p>
      </div>
      <div className="space-y-1.5">
        {rows.map(([Icon, label, val]) => (
          <div key={label} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm even:bg-background/30">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
            <span className="text-right font-medium">{val}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Allowed symbols</div>
        <div className="flex flex-wrap gap-1">
          {(battle.allowed_symbols ?? []).map((s: string) => (
            <span key={s} className="rounded-md bg-background/60 px-2 py-0.5 text-[11px] font-mono">{s}</span>
          ))}
        </div>
      </div>
      {WIN_CONDITIONS.find((w) => w.value === battle.win_condition && (w.value === "first_to_5r" || w.value === "consistency")) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-[11px] text-muted-foreground">
          <DollarSign className="mr-1 inline h-3 w-3 text-primary" />
          Live-scored while the battle runs. First to hit the win condition or highest score at end time wins.
        </div>
      )}
    </aside>
  );
}
