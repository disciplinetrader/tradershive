import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runPerformanceAnalysis, getLatestPerformance } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai/performance")({ component: PerformancePage });

function PerformancePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getLatestPerformance);
  const runFn = useServerFn(runPerformanceAnalysis);
  const q = useQuery({ queryKey: ["ai", "performance"], queryFn: () => getFn() });
  const run = useMutation({
    mutationFn: () => runFn({ data: { days: 60 } }),
    onSuccess: () => { toast.success("Performance analysis updated"); qc.invalidateQueries({ queryKey: ["ai", "performance"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const p = q.data;
  const pairs: [string, string, "up" | "down"][] = p
    ? [
        [p.best_session ?? "—", p.worst_session ?? "—", "up"],
        [p.best_strategy ?? "—", p.worst_strategy ?? "—", "up"],
        [p.best_pair ?? "—", p.worst_pair ?? "—", "up"],
        [p.best_day ?? "—", p.worst_day ?? "—", "up"],
        [p.best_time ?? "—", p.worst_time ?? "—", "up"],
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Performance Coach</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Detects your best and worst sessions, strategies, pairs, days and times.</p>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw className={run.isPending ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} /> Re-analyze last 60 days
          </Button>
        </CardHeader>
        <CardContent>
          {!p && <p className="text-sm text-muted-foreground">No analysis yet. Click Re-analyze to start.</p>}
          {p && (
            <>
              <p className="mb-4 text-sm">{p.summary}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Tile label="Best session" value={p.best_session} tone="up" />
                <Tile label="Worst session" value={p.worst_session} tone="down" />
                <Tile label="Best strategy" value={p.best_strategy} tone="up" />
                <Tile label="Worst strategy" value={p.worst_strategy} tone="down" />
                <Tile label="Best pair" value={p.best_pair} tone="up" />
                <Tile label="Worst pair" value={p.worst_pair} tone="down" />
                <Tile label="Best day" value={p.best_day} tone="up" />
                <Tile label="Worst day" value={p.worst_day} tone="down" />
                <Tile label="Best time" value={p.best_time} tone="up" />
                <Tile label="Worst time" value={p.worst_time} tone="down" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {p && (
        <Card className="bg-card/60 backdrop-blur-md">
          <CardHeader><CardTitle className="text-base">Suggestions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {((p.suggestions as any[]) ?? []).map((s, i) => (
              <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1"><span className="font-semibold">Why:</span> {s.why}</p>
                <p className="text-xs text-muted-foreground mt-0.5"><span className="font-semibold">How:</span> {s.how}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | null; tone: "up" | "down" }) {
  const Icon = tone === "up" ? TrendingUp : TrendingDown;
  const color = tone === "up" ? "text-success border-success/30" : "text-danger border-danger/30";
  return (
    <div className={"rounded-lg border bg-background/40 p-3 " + color}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="text-sm font-semibold mt-1">{value ?? "—"}</div>
    </div>
  );
}
