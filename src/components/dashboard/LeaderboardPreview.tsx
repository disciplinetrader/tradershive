import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeaderboard } from "@/lib/social.functions";
import { cn } from "@/lib/utils";

const RANK_COLORS: Record<number, string> = {
  1: "text-warning",
  2: "text-muted-foreground",
  3: "text-danger",
};

export function LeaderboardPreview() {
  const fetchLb = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard_preview"],
    queryFn: () => fetchLb({ data: { category: "xp", scope: "global", filters: {}, limit: 5 } as any }),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-52 w-full rounded-2xl" />;
  const rows = (data as any)?.rows ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={Trophy} title="Leaderboard empty" description="No ranked traders yet." />;
  }
  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map((r: any) => (
          <li key={r.profile.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface/60">
            <div className={cn("w-5 text-center text-xs font-bold tabular-nums", RANK_COLORS[r.rank] ?? "text-muted-foreground")}>
              {r.rank <= 3 ? <Trophy className="mx-auto h-3.5 w-3.5" /> : `#${r.rank}`}
            </div>
            <Avatar className="h-8 w-8">
              {r.profile.avatar_url ? <AvatarImage src={r.profile.avatar_url} alt={r.profile.username} /> : null}
              <AvatarFallback className="text-[10px]">{(r.profile.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.profile.display_name ?? r.profile.username}</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.profile.league ?? "unranked"} · Lvl {r.profile.level ?? 1}
              </div>
            </div>
            <Badge variant="outline" className="font-mono tabular-nums">{Number(r.value ?? 0).toLocaleString()} XP</Badge>
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
