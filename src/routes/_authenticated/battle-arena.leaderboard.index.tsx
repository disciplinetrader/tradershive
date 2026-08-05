import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { getLeaderboard } from "@/lib/social.functions";
import { Podium, type PodiumRow } from "@/components/social/Podium";
import { LeaderboardTable, type LeaderboardRow } from "@/components/social/LeaderboardTable";
import { LeaderboardFilters, INITIAL_FILTERS, type LeaderboardFiltersState } from "@/components/social/LeaderboardFilters";
import { GlassCard } from "@/components/ui/glass-card";
import { getCategory } from "@/lib/social/constants";

export const Route = createFileRoute("/_authenticated/leaderboard/")({
  component: LeaderboardIndex,
});

function LeaderboardIndex() {
  return <LeaderboardScope scope="global" title="Global Leaderboard" description="The top traders on TradersHIVE this season." />;
}

export function LeaderboardScope({
  scope,
  title,
  description,
  scopeValue,
  hideCountry,
  hideLeague,
}: {
  scope: "global" | "friends" | "country" | "league";
  title: string;
  description: string;
  scopeValue?: string | null;
  hideCountry?: boolean;
  hideLeague?: boolean;
}) {
  const fn = useServerFn(getLeaderboard);
  const [filters, setFilters] = useState<LeaderboardFiltersState>(INITIAL_FILTERS);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", scope, scopeValue ?? null, filters],
    queryFn: () => fn({
      data: {
        category: filters.category,
        scope,
        scopeValue: scopeValue ?? null,
        filters: {
          country: filters.country,
          league: filters.league,
          market: filters.market,
          tradingStyle: filters.tradingStyle,
          experience: filters.experience,
          search: filters.search || null,
        },
        limit: 100,
      },
    }),
    staleTime: 30_000,
  });

  const cat = getCategory(filters.category);
  const rows: LeaderboardRow[] = (data?.rows ?? []) as any;
  const podium = useMemo(() => rows.slice(0, 3) as PodiumRow[], [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {podium.length > 0 ? (
        <GlassCard className="p-6">
          <Podium rows={podium} category={cat} />
        </GlassCard>
      ) : null}

      <LeaderboardFilters state={filters} onChange={setFilters} hideCountry={hideCountry} hideLeague={hideLeague} />

      <LeaderboardTable rows={rows} isLoading={isLoading} category={cat} />

      {data?.myRank ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2 text-center text-xs">
          Your position for <b>{cat.label}</b>: <span className="font-mono font-bold text-primary">#{data.myRank}</span> of {data.total}
        </div>
      ) : null}
    </div>
  );
}
