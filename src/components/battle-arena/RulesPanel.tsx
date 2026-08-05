import { 
  Trophy, Target, TrendingDown, Percent, 
  DollarSign, Clock, Globe, Users, 
  Coins, Shield, Hash, LayoutGrid, 
  Lock, Unlock, Zap, ShieldAlert 
} from "lucide-react";
import { findBattleType, findMarket, findWinCondition, WIN_CONDITIONS } from "@/lib/battle-arena/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RulesPanel({ battle }: { battle: any }) {
  const market = findMarket(battle.market);
  const bt = findBattleType(battle.battle_type);
  const wc = findWinCondition(battle.win_condition);
  
  const sections = [
    {
      title: "Competition",
      items: [
        { icon: Users, label: "Format", val: bt.label },
        { icon: Globe, label: "Market", val: market.label },
        { icon: Trophy, label: "Win condition", val: wc.label },
        { icon: Zap, label: "Competitive", val: battle.ranked ? "Yes" : "No", highlight: battle.ranked },
      ]
    },
    {
      title: "Capital & Risk",
      items: [
        { icon: Coins, label: "Starting balance", val: `$${Number(battle.starting_balance).toLocaleString()}` },
        { icon: Percent, label: "Max risk / trade", val: `${battle.max_risk_pct}%` },
        { icon: TrendingDown, label: "Max daily loss", val: `${battle.max_daily_loss_pct}%` },
        { icon: Shield, label: "Max drawdown", val: `${battle.max_drawdown_pct}%` },
        ...(battle.profit_target_pct ? [{ icon: Target, label: "Profit target", val: `${battle.profit_target_pct}%`, highlight: true }] : []),
      ]
    },
    {
      title: "Restrictions",
      items: [
        { icon: LayoutGrid, label: "Max positions", val: `${battle.max_open_positions || 5}` },
        ...(battle.max_trades ? [{ icon: Hash, label: "Max trades", val: `${battle.max_trades}` }] : []),
        { icon: battle.allow_late_join ? Unlock : Lock, label: "Late Join", val: battle.allow_late_join ? "Allowed" : "Blocked" },
      ]
    }
  ];

  return (
    <aside className="space-y-6 rounded-3xl border border-border/60 bg-card/20 p-6 shadow-xl shadow-background/20">
      <div className="space-y-1">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Arena Conditions
        </h3>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Automated server-side enforcement</p>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <div className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.2em] pl-1">{section.title}</div>
            <div className="space-y-1">
              {section.items.map((it) => (
                <div key={it.label} className={cn(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition-colors",
                  it.highlight ? "bg-primary/5 border border-primary/20" : "bg-background/40 hover:bg-background/60"
                )}>
                  <span className="inline-flex items-center gap-2 text-muted-foreground font-bold">
                    <it.icon className={cn("h-3.5 w-3.5", it.highlight && "text-primary")} />
                    {it.label}
                  </span>
                  <span className={cn("font-black tracking-tight", it.highlight ? "text-primary" : "text-foreground")}>
                    {it.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        <div className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.2em] pl-1">Eligible Markets</div>
        <div className="flex flex-wrap gap-1.5">
          {(battle.allowed_symbols ?? []).map((s: string) => (
            <Badge key={s} variant="secondary" className="rounded-lg bg-background/80 border border-border/40 px-2.5 py-1 font-mono text-[10px] font-black transition-transform hover:scale-105">
              {s}
            </Badge>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-wider text-primary">Live Scoring Active</span>
        </div>
        <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
          Rule breaches result in immediate disqualification. Profit targets and drawdowns are calculated based on authoritative server price data.
        </p>
      </div>
    </aside>
  );
}
