import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { FolderKanban, Rocket, Sparkles, TrendingUp, Trophy, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { StrategyCard } from "@/components/strategy/StrategyCard";
import { CreatorWizard } from "@/components/strategy/CreatorWizard";
import { getAnalyticsOverview, listStrategies } from "@/lib/strategy.functions";
import type { Strategy } from "@/lib/strategy/types";

export const Route = createFileRoute("/_authenticated/strategies/")({
  component: StrategiesDashboard,
});

function StrategiesDashboard() {
  const [wiz, setWiz] = useState(false);
  const list = useServerFn(listStrategies);
  const overview = useServerFn(getAnalyticsOverview);
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: () => list() });
  const ov = useQuery({ queryKey: ["strategies", "overview"], queryFn: () => overview() });

  const recent = useMemo(() => ((strategies.data ?? []) as unknown as Strategy[]).slice(0, 8), [strategies.data]);

  const kpis = [
    { label: "Total Strategies", value: ov.data?.total ?? 0, icon: FolderKanban },
    { label: "Active", value: ov.data?.active ?? 0, icon: Sparkles },
    { label: "Total Trades", value: ov.data?.totals?.trades ?? 0, icon: TrendingUp },
    { label: "Avg RR", value: (ov.data?.avgRr ?? 0).toFixed(2), icon: Trophy },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Strategy Builder"
        description="Design, refine and organize your complete trading systems."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/strategies/templates"><Sparkles className="mr-2 h-4 w-4" />Templates</Link></Button>
            <Button onClick={() => setWiz(true)}><Rocket className="mr-2 h-4 w-4" />New Strategy</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <GlassCard key={k.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <div className="text-xl font-bold tabular-nums">{k.value}</div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <HighlightCard title="Most Profitable" strategy={ov.data?.mostProfitable} metric={(s: any) => `${(s?.stats?.net_pnl ?? 0).toFixed(2)}`} />
        <HighlightCard title="Best Win Rate" strategy={ov.data?.bestWinRate} metric={(s: any) => `${Math.round((s?.stats?.win_rate ?? 0) * 100)}%`} />
        <HighlightCard title="Most Used" strategy={ov.data?.mostUsed} metric={(s: any) => `${s?.stats?.trades ?? 0} trades`} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Strategies</h2>
          <Link to="/strategies/library" className="text-xs text-primary hover:underline">View all →</Link>
        </div>
        {strategies.isPending ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="glass rounded-3xl h-32 animate-pulse" />)}
          </div>
        ) : recent.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Zap className="mx-auto h-8 w-8 text-primary" />
            <div className="text-sm text-muted-foreground">No strategies yet. Start from a template or build one from scratch.</div>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" asChild><Link to="/strategies/templates">Browse Templates</Link></Button>
              <Button onClick={() => setWiz(true)}><Rocket className="mr-2 h-4 w-4" />Create Strategy</Button>
            </div>
          </GlassCard>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {recent.map((s) => <StrategyCard key={s.id} strategy={s} />)}
          </motion.div>
        )}
      </section>

      <CreatorWizard open={wiz} onOpenChange={setWiz} />
    </div>
  );
}

function HighlightCard({ title, strategy, metric }: { title: string; strategy: any; metric: (s: any) => string }) {
  return (
    <GlassCard className="p-4 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      {strategy ? (
        <>
          <Link to="/strategies/$id" params={{ id: strategy.id }} className="text-base font-bold hover:text-primary">{strategy.name}</Link>
          <div className="text-sm text-success tabular-nums">{metric(strategy)}</div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">Log some trades to see highlights.</div>
      )}
    </GlassCard>
  );
}
