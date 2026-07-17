import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LeaderboardScope } from "./leaderboard.index";
import { LEAGUES } from "@/lib/constants";
import { LEAGUE_META } from "@/lib/social/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/leaderboard/league")({
  component: LeagueLeaderboard,
});

function LeagueLeaderboard() {
  const { profile } = useAuth();
  const [selected, setSelected] = useState<string>(String(profile?.league ?? "bronze"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {LEAGUES.map((l) => {
          const meta = LEAGUE_META[l] ?? LEAGUE_META.bronze;
          const active = selected === l;
          return (
            <button
              key={l}
              onClick={() => setSelected(l)}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold uppercase tracking-wider transition",
                active
                  ? "border-transparent text-white shadow-lg"
                  : "border-border/60 bg-surface/40 text-muted-foreground hover:text-foreground",
              )}
              style={active ? { background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` } : undefined}
            >
              <span>{meta.icon}</span>
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="text-[10px] uppercase tracking-widest text-emerald-300">Promotion zone</div>
          <div className="mt-1 text-xs text-muted-foreground">Top 10% climb next season.</div>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
          <div className="text-[10px] uppercase tracking-widest text-primary">Safe zone</div>
          <div className="mt-1 text-xs text-muted-foreground">Middle 70% stay put.</div>
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
          <div className="text-[10px] uppercase tracking-widest text-rose-300">Relegation zone</div>
          <div className="mt-1 text-xs text-muted-foreground">Bottom 20% drop a league.</div>
        </div>
      </div>

      <LeaderboardScope
        scope="league"
        scopeValue={selected}
        title={`${LEAGUE_META[selected]?.label ?? selected} League`}
        description="Traders currently competing in this league."
        hideLeague
      />
    </div>
  );
}
