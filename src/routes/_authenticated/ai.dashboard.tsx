import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, LineChart, MessageSquare, RefreshCw, ShieldAlert, Sparkles, Target } from "lucide-react";
import { getAiDashboard, generateRecommendations, generateReport, updateRecommendationStatus, acknowledgeAlert } from "@/lib/ai.functions";
import { AiScoreCard } from "@/components/ai/AiScoreCard";
import { AiAvatar } from "@/components/ai/AiAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ai/dashboard")({ component: AiDashboardPage });

function AiDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dashFn = useServerFn(getAiDashboard);
  const recsFn = useServerFn(generateRecommendations);
  const reportFn = useServerFn(generateReport);
  const dismissFn = useServerFn(updateRecommendationStatus);
  const ackFn = useServerFn(acknowledgeAlert);

  const q = useQuery({ queryKey: ["ai", "dashboard"], queryFn: () => dashFn() });

  const genRecs = useMutation({
    mutationFn: () => recsFn(),
    onSuccess: () => { toast.success("Recommendations updated"); qc.invalidateQueries({ queryKey: ["ai", "dashboard"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const genReport = useMutation({
    mutationFn: () => reportFn({ data: { period: "weekly" } }),
    onSuccess: () => { toast.success("Weekly report generated"); qc.invalidateQueries({ queryKey: ["ai", "dashboard"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const data = q.data;
  const score = data?.score;
  const alerts = data?.alerts ?? [];
  const recs = data?.recommendations ?? [];
  const topRec = recs[0];

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Hero */}
      <Card className="md:col-span-3 relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="pointer-events-none absolute inset-0 opacity-30 gradient-radial-glow" />
        <CardContent className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <AiAvatar size={72} active />
            <div className="space-y-2 max-w-xl">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Today&rsquo;s insight</p>
              <h2 className="text-xl font-bold leading-snug">
                {q.isLoading ? "Analyzing your last 30 days…" : (topRec?.title ?? "Log more trades and I'll surface your strongest edge.")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {topRec?.description ?? "Your AI Coach analyzes every trade, every journal entry, every habit — and turns them into a single next action."}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => navigate({ to: "/ai/chat" })}>
                  <MessageSquare className="mr-1.5 h-4 w-4" /> Open Coach
                </Button>
                <Button variant="outline" onClick={() => navigate({ to: "/ai/trade-review" })}>
                  Analyze Trades <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => genReport.mutate()} disabled={genReport.isPending}>
                  <LineChart className="mr-1.5 h-4 w-4" /> Weekly Report
                </Button>
              </div>
            </div>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-3">
            <StatTile label="AI Score" value={Number(score?.overall ?? 0).toFixed(0)} highlight />
            <StatTile label="Discipline" value={Number(score?.discipline ?? 0).toFixed(0)} />
            <StatTile label="Risk Mgmt" value={Number(score?.risk_management ?? 0).toFixed(0)} />
            <StatTile label="Execution" value={Number(score?.execution ?? 0).toFixed(0)} />
          </div>
        </CardContent>
      </Card>

      <div className="md:col-span-2 space-y-6">
        <AiScoreCard score={score} />

        <Card className="bg-card/60 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" /> Recommendations</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => genRecs.mutate()} disabled={genRecs.isPending}>
              <RefreshCw className={genRecs.isPending ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} /> Regenerate
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recs.length === 0 && <p className="text-sm text-muted-foreground">No open recommendations yet. Click Regenerate.</p>}
            {recs.map((r: any) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-border/60 bg-background/40 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.priority === "critical" || r.priority === "high" ? "destructive" : "secondary"}>{r.priority}</Badge>
                    <span className="font-medium">{r.title}</span>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => dismissFn({ data: { id: r.id, status: "completed" } }).then(() => qc.invalidateQueries({ queryKey: ["ai", "dashboard"] }))}>Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissFn({ data: { id: r.id, status: "dismissed" } }).then(() => qc.invalidateQueries({ queryKey: ["ai", "dashboard"] }))}>Dismiss</Button>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-card/60 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4 text-warning" /> Smart Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && <p className="text-sm text-muted-foreground">All clear. Nothing to worry about.</p>}
            {alerts.map((a: any) => (
              <div key={a.id} className="rounded-md border border-border/60 bg-background/40 p-2 text-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span className="font-medium">{a.title}</span>
                </div>
                {a.message && <p className="text-xs text-muted-foreground mt-1">{a.message}</p>}
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => ackFn({ data: { id: a.id } }).then(() => qc.invalidateQueries({ queryKey: ["ai", "dashboard"] }))}>Acknowledge</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Latest Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data?.latestReport ? (
              <>
                <p className="font-medium">{(data.latestReport as any).title}</p>
                <p className="text-muted-foreground text-xs">{(data.latestReport as any).summary}</p>
              </>
            ) : (
              <p className="text-muted-foreground">No report generated yet.</p>
            )}
            <Button size="sm" variant="outline" className="w-full" onClick={() => genReport.mutate()} disabled={genReport.isPending}>
              {genReport.isPending ? "Generating…" : "Generate weekly report"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={"rounded-lg border border-border/60 bg-background/60 p-3 " + (highlight ? "border-primary/40 shadow-[0_0_20px_-8px_color-mix(in oklab, var(--primary) 60%, transparent)]" : "")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}
