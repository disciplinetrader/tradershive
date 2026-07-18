import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Calendar, Users, Sparkles, ArrowRight, History } from "lucide-react";
import { listChampionships } from "@/lib/championship.functions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/championship/")({
  component: ChampionshipIndex,
});

function ChampionshipIndex() {
  const nav = useNavigate();
  const fn = useServerFn(listChampionships);
  const current = useQuery({
    queryKey: ["champ", "current"],
    queryFn: () => fn({ data: { scope: "current" } }) as unknown as Promise<any[]>,
  });
  const past = useQuery({
    queryKey: ["champ", "past"],
    queryFn: () => fn({ data: { scope: "past", limit: 12 } }) as unknown as Promise<any[]>,
  });

  const featured = current.data?.find((c) => c.status === "live") ?? current.data?.[0];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Monthly Championship</h1>
        <p className="text-sm text-muted-foreground">
          The flagship platform-wide competition. One winner every month. A permanent place in the Hall of Fame.
        </p>
      </header>

      {featured ? (
        <button
          onClick={() => nav({ to: "/championship/$slug", params: { slug: featured.slug } })}
          className="group relative w-full overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-amber-500/15 via-primary/10 to-background p-6 text-left shadow-elegant transition hover:border-primary/60 md:p-10"
        >
          <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-primary/30 bg-background/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <span className={cn("h-2 w-2 rounded-full", featured.status === "live" ? "animate-pulse bg-emerald-500" : "bg-amber-500")} />
            {featured.status}
          </div>
          <div className="flex items-center gap-3 text-primary">
            <Trophy className="h-6 w-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Current championship</span>
          </div>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">{featured.name}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{featured.description}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(featured.start_at).toLocaleDateString()} — {new Date(featured.end_at).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              ${Number(featured.starting_balance).toLocaleString()} starting balance
            </div>
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">
            View championship <ArrowRight className="h-4 w-4" />
          </div>
        </button>
      ) : current.isLoading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-muted/40" />
      ) : (
        <EmptyState title="No active championship" description="A new championship will be created automatically at the start of next month." />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Past championships</h3>
        <Link to="/championship/hall-of-fame">
          <Button variant="outline" size="sm">
            <History className="mr-1.5 h-3.5 w-3.5" /> Hall of Fame
          </Button>
        </Link>
      </div>

      {past.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {past.data.map((c) => (
            <Link
              key={c.id}
              to="/championship/$slug"
              params={{ slug: c.slug }}
              className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-elegant"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-3.5 w-3.5" /> Completed
              </div>
              <div className="mt-1 text-lg font-semibold">{c.name}</div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Recap</span>
                <span>{new Date(c.end_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : past.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      ) : (
        <EmptyState className="py-10" title="No previous championships yet" description="Winners will appear here after the first championship ends." />
      )}
    </div>
  );
}
