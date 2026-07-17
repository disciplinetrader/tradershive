import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, Flame } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — TradersHIVE Arena" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, level, xp, streak, league")
        .order("xp", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Leaderboard"
        description="Top traders by XP. Climb your league by completing challenges."
      />

      <GlassCard className="overflow-hidden p-0">
        {isLoading ? (
          <div className="p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="mb-3 h-12 animate-pulse rounded-xl bg-surface-2/70" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No traders ranked yet"
              description="Be the first to earn XP and take the top spot."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.map((row, i) => {
              const name = row.display_name || row.username;
              const initials = name.slice(0, 2).toUpperCase();
              const rank = i + 1;
              return (
                <li key={row.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-8 text-center font-mono text-sm text-muted-foreground">
                    {rank <= 3 ? (
                      <Crown
                        className={`mx-auto h-4 w-4 ${
                          rank === 1 ? "text-warning" : rank === 2 ? "text-muted-foreground" : "text-primary"
                        }`}
                      />
                    ) : (
                      rank
                    )}
                  </div>
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage src={row.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Lvl {row.level} · {row.league.toString().toUpperCase()}
                    </p>
                  </div>
                  <div className="hidden items-center gap-1 text-xs text-warning sm:flex">
                    <Flame className="h-3.5 w-3.5" />
                    {row.streak}d
                  </div>
                  <div className="w-24 text-right font-mono text-sm font-semibold">
                    {row.xp.toLocaleString()} XP
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
