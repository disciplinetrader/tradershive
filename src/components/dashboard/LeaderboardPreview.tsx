import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MOCK_LEADERBOARD } from "@/lib/dashboard-mock";
import { cn } from "@/lib/utils";

const RANK_COLORS: Record<number, string> = {
  1: "text-amber-400",
  2: "text-slate-300",
  3: "text-orange-400",
};

export function LeaderboardPreview() {
  return (
    <div>
      <ul className="space-y-1.5">
        {MOCK_LEADERBOARD.map((r) => (
          <li key={r.rank} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface/60">
            <div className={cn("w-5 text-center text-xs font-bold tabular-nums", RANK_COLORS[r.rank] ?? "text-muted-foreground")}>
              {r.rank <= 3 ? <Trophy className="mx-auto h-3.5 w-3.5" /> : `#${r.rank}`}
            </div>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-[10px]">{r.username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.username}</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.league} · {r.winRate}% win
              </div>
            </div>
            <Badge variant="outline" className="font-mono tabular-nums">{r.xp.toLocaleString()} XP</Badge>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-right">
        <Button asChild size="sm" variant="outline">
          <Link to="/leaderboard">Full leaderboard</Link>
        </Button>
      </div>
    </div>
  );
}
