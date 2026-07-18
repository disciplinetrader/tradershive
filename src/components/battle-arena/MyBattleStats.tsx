import { Swords, Trophy, Coins, Sparkles, Target, Award } from "lucide-react";

type Stats = { total: number; wins: number; losses: number; winRate: number; avgFinish: number; totalPnl: number; xp: number; coins: number };

export function MyBattleStats({ data }: { data?: Stats }) {
  const s = data ?? { total: 0, wins: 0, losses: 0, winRate: 0, avgFinish: 0, totalPnl: 0, xp: 0, coins: 0 };
  const items = [
    { icon: Swords, label: "Battles", value: s.total },
    { icon: Trophy, label: "Wins", value: s.wins },
    { icon: Target, label: "Win rate", value: `${s.winRate}%` },
    { icon: Award, label: "Avg finish", value: s.avgFinish || "—" },
    { icon: Sparkles, label: "XP earned", value: s.xp },
    { icon: Coins, label: "Coins earned", value: s.coins },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl border border-border/60 bg-card/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <it.icon className="h-3 w-3" /> {it.label}
          </div>
          <div className="mt-1 text-lg font-bold tabular-nums">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
