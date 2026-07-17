import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { BarChart3, TrendingUp, Trophy, Percent } from "lucide-react";
import type { StrategyStats } from "@/lib/strategy/types";
import { cn } from "@/lib/utils";

export function StatsCard({ stats }: { stats: StrategyStats | null }) {
  const items = useMemo(() => {
    const s = stats;
    return [
      { label: "Trades", value: s?.trades ?? 0, icon: BarChart3 },
      { label: "Win rate", value: s ? `${Math.round(s.win_rate * 100)}%` : "—", icon: Percent },
      { label: "Avg RR", value: s ? s.avg_rr.toFixed(2) : "—", icon: TrendingUp },
      { label: "Net PnL", value: s ? s.net_pnl.toFixed(2) : "—", icon: Trophy, pnl: s?.net_pnl ?? 0 },
    ];
  }, [stats]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <GlassCard key={it.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
                <div className={cn("text-lg font-bold tabular-nums",
                  it.pnl != null ? (it.pnl >= 0 ? "text-emerald-400" : "text-rose-400") : "")}>{it.value as any}</div>
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
