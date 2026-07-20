import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Medal, Award } from "lucide-react";
import { listHallOfFame } from "@/lib/championship.functions";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/championship/hall-of-fame")({
  component: HallOfFame,
});

function HallOfFame() {
  const fn = useServerFn(listHallOfFame);
  const q = useQuery({
    queryKey: ["champ", "hall-of-fame"],
    queryFn: () => fn() as unknown as Promise<{ entries: any[]; profiles: any[] }>,
  });

  const profileMap = new Map<string, any>((q.data?.profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Hall of Fame</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every monthly champion, permanently archived. Runners-up, third place, and top 10 recognised.
        </p>
      </header>

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      ) : !q.data?.entries.length ? (
        <EmptyState title="No champions yet" description="The Hall of Fame will open with the first completed championship." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.entries.map((e) => {
            const champ = profileMap.get(e.champion_user_id);
            const runner = profileMap.get(e.runner_up_user_id);
            const third = profileMap.get(e.third_user_id);
            const meta = e.championships;
            return (
              <Link
                key={e.id}
                to="/championship/$slug"
                params={{ slug: meta?.slug }}
                className="group relative overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/10 via-primary/5 to-background p-5 shadow-sm transition hover:border-warning hover:shadow-elegant"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-warning">
                  <Trophy className="h-3.5 w-3.5" /> Champion
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{meta?.name}</div>
                <div className="mt-4 flex items-center gap-3">
                  {champ?.avatar_url ? (
                    <img src={champ.avatar_url} className="h-14 w-14 rounded-full border-2 border-warning shadow" alt="" />
                  ) : (
                    <div className="h-14 w-14 rounded-full border-2 border-warning bg-muted" />
                  )}
                  <div>
                    <div className="text-lg font-bold">{champ?.display_name ?? champ?.username ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{champ?.country}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                  <Stat label="PnL" value={e.winning_stats?.pnl != null ? `$${Number(e.winning_stats.pnl).toFixed(0)}` : "—"} />
                  <Stat label="Win %" value={e.winning_stats?.win_rate != null ? `${Number(e.winning_stats.win_rate).toFixed(0)}%` : "—"} />
                  <Stat label="Trades" value={String(e.winning_stats?.trades ?? "—")} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-1.5">
                    <Medal className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{runner?.display_name ?? runner?.username ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-1.5">
                    <Award className={cn("h-3 w-3 text-warning")} />
                    <span className="truncate">{third?.display_name ?? third?.username ?? "—"}</span>
                  </div>
                </div>

                <div className="mt-3 text-[10px] text-muted-foreground">
                  {new Date(meta?.end_at).toLocaleDateString(undefined, { year: "numeric", month: "long" })}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2 text-center">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}
