import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { listBattles, listMyBattleStats } from "@/lib/battle-arena.functions";
import { BattleCard } from "@/components/battle-arena/BattleCard";
import { MyBattleStats } from "@/components/battle-arena/MyBattleStats";

export const Route = createFileRoute("/_authenticated/battle-arena/history")({
  component: History,
});

function History() {
  const fnList = useServerFn(listBattles);
  const fnStats = useServerFn(listMyBattleStats);
  const stats = useQuery({ queryKey: ["battles", "stats"], queryFn: () => fnStats() });
  const battles = useQuery({ queryKey: ["battles", "mine-history"], queryFn: () => fnList({ data: { scope: "mine", limit: 100 } }) });

  const completed = (battles.data ?? []).filter((b: any) => b.status === "completed");

  return (
    <div className="space-y-6">
      <PageHeader title="Battle history" description="Every battle you played and how you finished." />
      <MyBattleStats data={stats.data} />
      {completed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center text-sm text-muted-foreground">
          No completed battles yet.
        </div>
      ) : (
        <div className="animate-content-in grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {completed.map((b: any) => <BattleCard key={b.id} battle={b} />)}
        </div>
      )}
    </div>
  );
}
