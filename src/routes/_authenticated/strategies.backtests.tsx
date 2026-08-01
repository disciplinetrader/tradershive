import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Film, Play } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { listStrategies } from "@/lib/strategy.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Strategy } from "@/lib/strategy/types";

export const Route = createFileRoute("/_authenticated/strategies/backtests")({
  component: BacktestsPage,
});

function BacktestsPage() {
  const { user } = useAuth();
  const listS = useServerFn(listStrategies);
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: () => listS() });

  const replays = useQuery({
    queryKey: ["strategy", "replays", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("replay_sessions").select("id,title,symbol,timeframe,status,updated_at")
        .eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Backtests" description="Link replay sessions and manual backtests to your strategies." />
      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" />Your Strategies</div>
          <ul className="divide-y divide-border/40">
            {((strategies.data ?? []) as unknown as Strategy[]).map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <Link to="/strategies/$id" params={{ id: s.id }} className="text-sm hover:text-primary">{s.name}</Link>
                <Button size="sm" variant="ghost" asChild><Link to="/replay">Open Replay →</Link></Button>
              </li>
            ))}
            {(strategies.data ?? []).length === 0 ? <li className="py-4 text-xs text-muted-foreground">No strategies yet.</li> : null}
          </ul>
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Film className="h-4 w-4 text-primary" />Recent Replay Sessions</div>
          <ul className="divide-y divide-border/40">
            {((replays.data ?? []) as any[]).map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground">{r.symbol} · {r.timeframe} · {r.status}</div>
                </div>
                <Button size="sm" variant="ghost" asChild><Link to="/replay/studio" search={{ id: r.id } as any}>Open</Link></Button>
              </li>
            ))}
            {(replays.data ?? []).length === 0 ? <li className="py-4 text-xs text-muted-foreground">No replay sessions yet.</li> : null}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}
