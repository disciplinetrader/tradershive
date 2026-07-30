import { Link } from "@tanstack/react-router";
import { Trophy, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XPBar } from "@/components/ui/xp-bar";
import { useAuth } from "@/hooks/use-auth";
import { xpForLevel } from "@/lib/constants";

export function XPWidget() {
  const { profile } = useAuth();
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const needed = xpForLevel(level);
  const league = (profile?.league ?? "bronze").toString();
  const rank = profile?.rank ?? null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Level</div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">{level}</span>
            <span className="text-sm text-muted-foreground">/ {level + 1}</span>
          </div>
        </div>
        <div className="text-right">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary capitalize">
            <Trophy className="mr-1 h-3 w-3" /> {league}
          </Badge>
          <div className="mt-1 text-xs text-muted-foreground">
            Rank {rank ? `#${rank}` : "—"}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <XPBar level={level} xp={xp} needed={needed} />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" /> {needed - xp} XP to next level
        </span>
        <Button asChild size="sm" variant="ghost">
          <Link to="/leaderboard">Leaderboard</Link>
        </Button>
      </div>
    </div>
  );
}
