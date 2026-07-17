import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listRewardsHistory } from "@/lib/gamification.functions";

export const Route = createFileRoute("/_authenticated/challenges/rewards")({
  head: () => ({ meta: [{ title: "Reward Ledger — TradersHIVE Arena" }] }),
  component: Rewards,
});

function Rewards() {
  const fn = useServerFn(listRewardsHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["gami", "rewards"],
    queryFn: () => fn({}) as unknown as Promise<{ xp: any[]; coins: any[] }>,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Reward Ledger" description="Every XP and coin change with source and reason.">
        <Link to="/challenges" className="text-xs text-primary hover:underline">← Back to challenges</Link>
      </PageHeader>

      <Tabs defaultValue="xp">
        <TabsList className="glass">
          <TabsTrigger value="xp"><Zap className="mr-1 h-3.5 w-3.5" /> XP</TabsTrigger>
          <TabsTrigger value="coins"><Coins className="mr-1 h-3.5 w-3.5" /> Coins</TabsTrigger>
        </TabsList>
        <TabsContent value="xp" className="mt-4">
          <Ledger rows={data?.xp} isLoading={isLoading} unit="XP" />
        </TabsContent>
        <TabsContent value="coins" className="mt-4">
          <Ledger rows={data?.coins} isLoading={isLoading} unit="🪙" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Ledger({ rows, isLoading, unit }: { rows: any[] | undefined; isLoading: boolean; unit: string }) {
  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;
  if (!rows?.length) return <GlassCard className="p-8 text-center text-sm text-muted-foreground">No transactions yet.</GlassCard>;
  return (
    <GlassCard className="divide-y divide-border/40">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3.5 text-sm">
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{r.reason}</div>
            <div className="text-[11px] text-muted-foreground capitalize">
              {r.source} · {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
          <div className={"tabular-nums font-semibold " + (r.delta >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {r.delta >= 0 ? "+" : ""}{r.delta} {unit}
          </div>
        </div>
      ))}
    </GlassCard>
  );
}
