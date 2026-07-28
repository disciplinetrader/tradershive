import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Flame, Clock, History, Swords } from "lucide-react";
import { listBattles, listMyBattleStats, tickBattles } from "@/lib/battle-arena.functions";
import { BattleCard } from "@/components/battle-arena/BattleCard";
import { MyBattleStats } from "@/components/battle-arena/MyBattleStats";
import { JoinByCodeDialog } from "@/components/battle-arena/JoinByCodeDialog";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/battle-arena/")({
  component: BattleArenaHome,
});

function BattleArenaHome() {
  const qc = useQueryClient();
  const fnList = useServerFn(listBattles);
  const fnMine = useServerFn(listBattles);
  const fnStats = useServerFn(listMyBattleStats);
  const fnTick = useServerFn(tickBattles);

  const featured = useQuery({ queryKey: ["battles", "featured"], queryFn: () => fnList({ data: { scope: "featured", limit: 6 } }) });
  const live = useQuery({ queryKey: ["battles", "live"], queryFn: () => fnList({ data: { scope: "live", limit: 12 } }), refetchInterval: 15000 });
  const upcoming = useQuery({ queryKey: ["battles", "upcoming"], queryFn: () => fnList({ data: { scope: "upcoming", limit: 12 } }) });
  const mine = useQuery({ queryKey: ["battles", "mine"], queryFn: () => fnMine({ data: { scope: "mine", limit: 12 } }) });
  const history = useQuery({ queryKey: ["battles", "history"], queryFn: () => fnList({ data: { scope: "history", limit: 6 } }) });
  const stats = useQuery({ queryKey: ["battles", "stats"], queryFn: () => fnStats() });

  // Tick battles on interval so upcoming → live → completed transitions happen.
  useEffect(() => {
    const t = setInterval(() => { fnTick().catch(() => {}); }, 30000);
    fnTick().catch(() => {});
    return () => clearInterval(t);
  }, [fnTick]);

  // Realtime: refetch on any battle change.
  useEffect(() => {
    const ch = supabase
      .channel("battles-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "battles" }, () => {
        qc.invalidateQueries({ queryKey: ["battles"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Battle Arena"
        description="Compete in real-time paper trading battles. Real market data, real rankings, real XP."
        actions={
          <>
            <JoinByCodeDialog />
            <Button asChild size="sm">
              <Link to="/battle-arena/create"><Plus className="mr-1.5 h-4 w-4" />Create Battle</Link>
            </Button>
          </>
        }
      />

      <MyBattleStats data={stats.data} />

      <Section
        title="Featured" icon={Flame} items={featured.data} loading={featured.isLoading}
        empty={{ title: "No featured battles right now", body: "Featured battles are curated by staff — check back soon or start one yourself.", cta: { label: "Create Battle", to: "/battle-arena/create" } }}
      />
      <Section
        title="Live now" icon={Swords} items={live.data} loading={live.isLoading} pulse
        empty={{ title: "No battles running", body: "Kick off a live battle and invite others to join.", cta: { label: "Create Battle", to: "/battle-arena/create" } }}
      />
      <Section
        title="Upcoming" icon={Clock} items={upcoming.data} loading={upcoming.isLoading}
        empty={{ title: "No upcoming battles", body: "Be the first to schedule one — set entry, duration and prize pool.", cta: { label: "Create Battle", to: "/battle-arena/create" } }}
      />
      <Section
        title="My battles" icon={Swords} items={mine.data} loading={mine.isLoading}
        empty={{ title: "You haven't joined any battles yet", body: "Join a live battle or create your own to start competing.", cta: { label: "Browse Live", to: "/battle-arena" }, secondary: { label: "Create Battle", to: "/battle-arena/create" } }}
      />
      <Section
        title="Recent results" icon={History} items={history.data} loading={history.isLoading}
        empty={{ title: "No completed battles yet", body: "Results appear here after your first battle ends.", cta: { label: "Create Battle", to: "/battle-arena/create" } }}
      />
    </div>
  );
}

type EmptyCopy = {
  title: string;
  body?: string;
  cta?: { label: string; to: string };
  secondary?: { label: string; to: string };
};

function Section({ title, icon: Icon, items, loading, empty, pulse }: { title: string; icon: React.ComponentType<{ className?: string }>; items?: any[]; loading?: boolean; empty: EmptyCopy; pulse?: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 text-primary ${pulse ? "animate-pulse" : ""}`} />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {loading && !items ? (
        <CardGridSkeleton count={3} cardClassName="h-48" />
      ) : !items?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-8 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
          <div>
            <div className="text-sm font-semibold text-foreground">{empty.title}</div>
            {empty.body ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{empty.body}</p> : null}
          </div>
          {empty.cta || empty.secondary ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {empty.cta ? <Button asChild size="sm"><Link to={empty.cta.to}>{empty.cta.label}</Link></Button> : null}
              {empty.secondary ? <Button asChild size="sm" variant="outline"><Link to={empty.secondary.to}>{empty.secondary.label}</Link></Button> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="animate-content-in grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => <BattleCard key={b.id} battle={b} />)}
        </div>
      )}
    </section>
  );
}


