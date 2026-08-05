import { Swords, Trophy, Target, Award, Zap, Star } from "lucide-react";
import { getRankFromElo } from "@/lib/battle-arena/constants";

type Stats = { 
  total: number; 
  wins: number; 
  losses: number; 
  winRate: number; 
  avgFinish: number; 
  totalPnl: number; 
  xp: number; 
  coins: number;
  elo: number;
  streak: number;
  bestStreak: number;
  peakElo: number;
};

export function MyBattleStats({ data }: { data?: Stats }) {
  const s = data ?? { 
    total: 0, wins: 0, losses: 0, winRate: 0, avgFinish: 0, 
    totalPnl: 0, xp: 0, coins: 0, elo: 1000, streak: 0, 
    bestStreak: 0, peakElo: 1000 
  };
  
  const rank = getRankFromElo(s.elo);
  
  const items = [
    { icon: Star, label: "Current ELO", value: s.elo, sub: rank.label, color: rank.color },
    { icon: Zap, label: "Streak", value: s.streak, sub: `Best: ${s.bestStreak}` },
    { icon: Swords, label: "Battles", value: s.total },
    { icon: Trophy, label: "Wins", value: s.wins },
    { icon: Target, label: "Win rate", value: `${s.winRate}%` },
    { icon: Award, label: "Avg finish", value: s.avgFinish || "—" },
  ];
  
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-4 transition-all hover:border-primary/50 hover:bg-card/60">
          {it.color && (
            <div 
              className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full blur-[1px]" 
              style={{ backgroundColor: it.color, boxShadow: `0 0 8px ${it.color}` }}
            />
          )}
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary/70">
            <it.icon className="h-3.5 w-3.5" /> {it.label}
          </div>
          <div className="mt-1.5 flex flex-col">
            <div className="text-2xl font-black tabular-nums tracking-tight">{it.value}</div>
            {it.sub && (
              <div className="text-[10px] font-medium text-muted-foreground/80 mt-0.5" style={it.color ? { color: it.color } : {}}>
                {it.sub}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
