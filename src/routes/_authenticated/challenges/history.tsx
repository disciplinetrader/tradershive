import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { listChallengeHistory } from "@/lib/gamification.functions";
import { DIFFICULTY_STYLES } from "@/lib/gamification/constants";

export const Route = createFileRoute("/_authenticated/challenges/history")({
  head: () => ({ meta: [{ title: "Challenge History — TradersHIVE Arena" }] }),
  component: History,
});

function History() {
  const fn = useServerFn(listChallengeHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["gami", "challenge-history"],
    queryFn: () => fn({}) as unknown as Promise<any[]>,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Challenge History" description="Every challenge you've attempted, completed, and claimed.">
        <Link to="/challenges" className="text-xs text-primary hover:underline">← Back to challenges</Link>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (data ?? []).length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">No history yet.</GlassCard>
      ) : (
        <GlassCard className="divide-y divide-border/40">
          {data!.map((row) => {
            const ch = row.challenges ?? {};
            const icon = row.status === "claimed" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
                         row.status === "completed" ? <Clock className="h-4 w-4 text-primary" /> :
                         row.status === "expired" ? <XCircle className="h-4 w-4 text-rose-400" /> :
                         <Clock className="h-4 w-4 text-muted-foreground" />;
            const diff = DIFFICULTY_STYLES[ch.difficulty] ?? DIFFICULTY_STYLES.easy;
            return (
              <div key={row.id} className="flex items-center gap-3 p-4">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-background/50 text-lg">{ch.icon ?? "🎯"}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{ch.title ?? "Challenge"}</span>
                    <Badge variant="outline" className={"border " + diff.className}>{diff.label}</Badge>
                    <Badge variant="outline" className="border-border/60 capitalize">{ch.scope}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{row.period_key}</div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 capitalize text-muted-foreground">{icon}{row.status}</span>
                  <span className="tabular-nums text-primary">+{ch.xp_reward ?? 0} XP</span>
                </div>
              </div>
            );
          })}
        </GlassCard>
      )}
    </div>
  );
}
