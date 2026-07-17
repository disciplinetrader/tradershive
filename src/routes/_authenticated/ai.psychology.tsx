import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runPsychologyAnalysis, getLatestPsychology } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/ai/psychology")({ component: PsychologyPage });

const EMOTIONS = ["fear", "greed", "fomo", "revenge", "overconfidence", "impatience", "discipline", "confidence"] as const;

function PsychologyPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getLatestPsychology);
  const runFn = useServerFn(runPsychologyAnalysis);
  const q = useQuery({ queryKey: ["ai", "psychology"], queryFn: () => getFn() });
  const run = useMutation({
    mutationFn: () => runFn({ data: { days: 30 } }),
    onSuccess: () => { toast.success("Psychology analysis updated"); qc.invalidateQueries({ queryKey: ["ai", "psychology"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const p = q.data;
  const emotionsData = p ? EMOTIONS.map((k) => ({ emotion: k, value: Number((p.emotions as any)?.[k] ?? 0) })) : [];
  const heatmap: Record<string, number> = (p?.heatmap as any) ?? {};
  const heatmapDays = Object.entries(heatmap).sort(([a], [b]) => a.localeCompare(b));
  const maxAbs = Math.max(1, ...heatmapDays.map(([, v]) => Math.abs(v)));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="bg-card/60 backdrop-blur-md lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Psychology Analysis</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Detects fear, greed, FOMO, revenge trading, overconfidence, impatience — from trades &amp; journal.</p>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw className={run.isPending ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} /> Analyze last 30 days
          </Button>
        </CardHeader>
        {p && <CardContent className="text-sm">{p.summary}</CardContent>}
      </Card>

      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader><CardTitle className="text-base">Emotion scores</CardTitle></CardHeader>
        <CardContent className="h-72">
          {emotionsData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run the analysis first.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emotionsData}>
                <XAxis dataKey="emotion" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader><CardTitle className="text-base">Patterns detected</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(((p?.patterns as any[]) ?? []).length === 0) && <p className="text-sm text-muted-foreground">No patterns yet.</p>}
          {((p?.patterns as any[]) ?? []).map((pt: any, i: number) => (
            <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <Badge variant={pt.severity === "high" ? "destructive" : "secondary"}>{pt.severity}</Badge>
                <span className="font-medium">{pt.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{pt.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur-md lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Emotion vs Profit heatmap</CardTitle></CardHeader>
        <CardContent>
          {heatmapDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No heatmap data yet.</p>
          ) : (
            <div className="grid grid-cols-7 gap-1 sm:grid-cols-14">
              {heatmapDays.map(([day, v]) => (
                <div key={day} className="aspect-square rounded" title={`${day}: ${v}`}
                  style={{
                    background: v >= 0
                      ? `hsl(150 70% 45% / ${0.15 + (v / maxAbs) * 0.7})`
                      : `hsl(0 70% 55% / ${0.15 + (Math.abs(v) / maxAbs) * 0.7})`,
                  }}
                />
              ))}
            </div>
          )}
          {p && (p.emotion_vs_profit as any) && (
            <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
              <p><span className="font-semibold">Correlation:</span> {(p.emotion_vs_profit as any).correlation}</p>
              <p className="text-muted-foreground mt-1">{(p.emotion_vs_profit as any).insight}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
