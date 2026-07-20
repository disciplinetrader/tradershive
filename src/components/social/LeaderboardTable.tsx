import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Flame, Award as AwardIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { LeagueBadge } from "./LeagueBadge";
import { CountryFlag } from "./CountryFlag";
import { FollowButton } from "./FollowButton";
import { formatMetric, type CategoryDef } from "@/lib/social/constants";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export interface LeaderboardRow {
  rank: number;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    country: string | null;
    league: string | null;
    xp: number;
    streak: number;
    level: number;
  };
  stats: { winRate: number; netR: number; profitFactor: number; achievements: number; totalTrades: number };
  value: number;
}

export function LeaderboardTable({
  rows,
  isLoading,
  category,
  showValueColumn = true,
}: {
  rows: LeaderboardRow[];
  isLoading?: boolean;
  category: CategoryDef;
  showValueColumn?: boolean;
}) {
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title="No traders match" description="Try loosening your filters." />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60">
      <div className="max-h-[68vh] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
            <TableRow className="border-b border-border/70">
              <TableHead className="w-14">Rank</TableHead>
              <TableHead>Trader</TableHead>
              <TableHead className="hidden lg:table-cell">Country</TableHead>
              <TableHead className="hidden md:table-cell">League</TableHead>
              {showValueColumn ? (
                <TableHead className="text-right">{category.shortLabel}</TableHead>
              ) : null}
              <TableHead className="hidden text-right md:table-cell">XP</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Win %</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Net R</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Streak</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Achv.</TableHead>
              <TableHead className="w-[120px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isMe = user?.id === r.profile.id;
              const displayName = r.profile.display_name || r.profile.username;
              return (
                <motion.tr
                  key={r.profile.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "group border-b border-border/40 transition hover:bg-surface/60",
                    isMe && "bg-primary/5",
                  )}
                >
                  <TableCell className="font-mono text-sm">
                    {r.rank <= 3 ? (
                      <span className={cn(
                        "font-black",
                        r.rank === 1 && "text-warning",
                        r.rank === 2 && "text-muted-foreground",
                        r.rank === 3 && "text-danger",
                      )}>#{r.rank}</span>
                    ) : (
                      <span className="text-muted-foreground">#{r.rank}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/profile/$username"
                      params={{ username: r.profile.username }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage src={r.profile.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">{r.profile.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold group-hover:text-primary">
                          {displayName} {isMe && <span className="ml-1 text-[10px] text-primary">(you)</span>}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          @{r.profile.username} · Lvl {r.profile.level}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <CountryFlag country={r.profile.country} showName />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <LeagueBadge league={r.profile.league} size="xs" />
                  </TableCell>
                  {showValueColumn ? (
                    <TableCell className="text-right font-mono text-sm font-semibold text-primary">
                      {formatMetric(r.value, category.format)}
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                    {r.profile.xp.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs lg:table-cell">
                    {(r.stats.winRate * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className={cn(
                    "hidden text-right font-mono text-xs lg:table-cell",
                    r.stats.netR > 0 ? "text-success" : r.stats.netR < 0 ? "text-danger" : "",
                  )}>
                    {r.stats.netR.toFixed(1)}R
                  </TableCell>
                  <TableCell className="hidden text-right xl:table-cell">
                    <span className="inline-flex items-center gap-1 font-mono text-xs">
                      <Flame className="h-3 w-3 text-warning" />
                      {r.profile.streak}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right xl:table-cell">
                    <span className="inline-flex items-center gap-1 font-mono text-xs">
                      <AwardIcon className="h-3 w-3 text-primary" />
                      {r.stats.achievements}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <FollowButton userId={r.profile.id} isSelf={isMe} />
                  </TableCell>
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
