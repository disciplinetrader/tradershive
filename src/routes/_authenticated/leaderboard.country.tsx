import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCountryRankings } from "@/lib/social.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { CountryFlag } from "@/components/social/CountryFlag";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaderboardScope } from "./leaderboard.index";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/leaderboard/country")({
  component: CountryLeaderboard,
});

function CountryLeaderboard() {
  const { profile } = useAuth();
  const [selected, setSelected] = useState<string | null>(profile?.country ?? null);
  const fn = useServerFn(getCountryRankings);
  const { data, isLoading } = useQuery({
    queryKey: ["country-rankings"],
    queryFn: () => fn({}),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Countries by total XP</h3>
          <span className="text-xs text-muted-foreground">{data?.length ?? 0} countries</span>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {(data ?? []).slice(0, 20).map((c) => (
              <button
                key={c.country}
                onClick={() => setSelected(c.country)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                  selected === c.country
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 bg-surface/40 hover:bg-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center font-mono text-xs text-muted-foreground">#{c.rank}</span>
                  <CountryFlag country={c.country} showName />
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold">{c.totalXp.toLocaleString()} XP</div>
                  <div className="text-[10px] text-muted-foreground">{c.traders} traders · avg {c.avgXp.toLocaleString()}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      {selected ? (
        <LeaderboardScope
          scope="country"
          scopeValue={selected}
          title={`Top traders — ${selected}`}
          description="Rankings within your selected country."
          hideCountry
        />
      ) : (
        <p className="text-center text-sm text-muted-foreground">Select a country above to see its leaderboard.</p>
      )}
    </div>
  );
}
