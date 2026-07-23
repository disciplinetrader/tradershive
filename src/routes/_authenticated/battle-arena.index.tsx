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

      <Section title="Featured" icon={Flame} items={featured.data} loading={featured.isLoading} empty="No featured battles right now." />
      <Section title="Live now" icon={Swords} items={live.data} loading={live.isLoading} empty="No battles running." pulse />
      <Section title="Upcoming" icon={Clock} items={upcoming.data} loading={upcoming.isLoading} empty="No upcoming battles — be the first to create one." />
      <Section title="My battles" icon={Swords} items={mine.data} loading={mine.isLoading} empty="You haven't joined any battles yet." />
      <Section title="Recent results" icon={History} items={history.data} loading={history.isLoading} empty="No completed battles yet." />
    </div>
  );
}

function Section({ title, icon: Icon, items, loading, empty, pulse }: { title: string; icon: React.ComponentType<{ className?: string }>; items?: any[]; loading?: boolean; empty: string; pulse?: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 text-primary ${pulse ? "animate-pulse" : ""}`} />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {loading && !items ? (
        <CardGridSkeleton count={3} cardClassName="h-48" />
      ) : !items?.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => <BattleCard key={b.id} battle={b} />)}
        </div>
      )}
    </section>
  );
}

