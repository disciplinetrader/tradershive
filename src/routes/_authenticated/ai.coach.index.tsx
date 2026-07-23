import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Target, Trophy, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  computeTraderProfile,
  computeConfidenceScores,
  dismissRecommendation,
  generateHomework,
  generateRecommendations,
  getConfidenceTrend,
  getTraderProfile,
  listHomework,
  listRecommendations,
  listReplayDebriefs,
} from "@/lib/replay-coach.functions";

export const Route = createFileRoute("/_authenticated/ai/coach/")({
  component: OverviewPage,
});

function OverviewPage() {
  const qc = useQueryClient();
  const profile = useServerFn(getTraderProfile);
  const recomps = useServerFn(computeTraderProfile);
  const conf = useServerFn(getConfidenceTrend);
  const recompConf = useServerFn(computeConfidenceScores);
  const recs = useServerFn(listRecommendations);
  const genRecs = useServerFn(generateRecommendations);
  const dismiss = useServerFn(dismissRecommendation);
  const hw = useServerFn(listHomework);
  const genHw = useServerFn(generateHomework);
  const debriefs = useServerFn(listReplayDebriefs);

  const pQ = useQuery({ queryKey: ["coach", "profile"], queryFn: () => profile() });
  const cQ = useQuery({ queryKey: ["coach", "confidence"], queryFn: () => conf({ data: { days: 90 } }) });
  const rQ = useQuery({ queryKey: ["coach", "recs"], queryFn: () => recs() });
  const hQ = useQuery({ queryKey: ["coach", "homework"], queryFn: () => hw() });
  const dQ = useQuery({ queryKey: ["coach", "debriefs"], queryFn: () => debriefs({ data: { limit: 5 } }) });

  const refreshAll = useMutation({
    mutationFn: async () => {
      await recomps();
      await recompConf();
      await genRecs();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach"] }),
  });
  const newHw = useMutation({
    mutationFn: () => genHw(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach", "homework"] }),
  });
  const dis = useMutation({
    mutationFn: (id: string) => dismiss({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach", "recs"] }),
  });

  const p: any = pQ.data;
  const trend: any[] = (cQ.data as any) ?? [];
  const latestConf = trend[trend.length - 1];
  const activeHw = ((hQ.data as any) ?? []).find((h: any) => h.status === "pending" || h.status === "in_progress");

  if (pQ.isPending && !pQ.data) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-64 rounded-3xl bg-muted animate-shimmer" />
        <div className="h-64 rounded-3xl bg-muted animate-shimmer" />
        <div className="lg:col-span-2 h-48 rounded-3xl bg-muted animate-shimmer" />
        <div className="h-48 rounded-3xl bg-muted animate-shimmer" />
        <div className="lg:col-span-3 h-40 rounded-3xl bg-muted animate-shimmer" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <GlassCard className="p-5 space-y-4 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Your Coach</div>
            <div className="text-xl font-bold">{p?.style ?? "Not enough sessions yet"}</div>
            <div className="text-xs text-muted-foreground">Personalized from your real replay history.</div>
          </div>
          <Button size="sm" onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending}>
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            {refreshAll.isPending ? "Refreshing…" : "Refresh Insights"}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Consistency" value={p?.consistency ?? 0} />
          <Metric label="Risk Discipline" value={p?.risk_discipline ?? 0} />
          <Metric label="Execution" value={p?.execution_quality ?? 0} />
          <Metric label="Patience" value={p?.patience ?? 0} />
          <Metric label="Decision" value={p?.decision_quality ?? 0} />
          <Metric label="Confidence" value={p?.confidence ?? 0} />
        </div>
        {p?.weaknesses?.length ? (
          <div className="rounded-[3px] border border-border/60 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Focus areas</div>
            <ul className="list-disc pl-4 text-xs text-foreground/90 space-y-0.5">
              {p.weaknesses.map((w: string) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        ) : null}
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Confidence Snapshot</div>
        {latestConf ? (
          <div className="space-y-2">
            <div className="text-3xl font-bold tabular-nums text-primary">
              {latestConf.overall}<span className="text-sm text-muted-foreground">/100</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <MiniStat label="Execution" v={latestConf.execution} d={latestConf.deltas?.execution} />
              <MiniStat label="Risk" v={latestConf.risk} d={latestConf.deltas?.risk} />
              <MiniStat label="Psychology" v={latestConf.psychology} d={latestConf.deltas?.psychology} />
              <MiniStat label="Discipline" v={latestConf.discipline} d={latestConf.deltas?.discipline} />
            </div>
            {latestConf.reasons && Object.keys(latestConf.reasons).length > 0 ? (
              <ul className="text-[11px] text-muted-foreground space-y-0.5 pt-1">
                {Object.entries(latestConf.reasons).map(([k, v]) => (
                  <li key={k}>· <span className="font-medium text-foreground/80">{k}</span>: {String(v)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Run "Refresh Insights" to compute your confidence.</p>
        )}
      </GlassCard>

      <GlassCard className="p-5 space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Personal Recommendations</div>
          <Button size="sm" variant="ghost" onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending}>
            Refresh
          </Button>
        </div>
        {(rQ.data as any[])?.length ? (
          <ul className="space-y-2">
            {(rQ.data as any[]).map((r: any) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-[3px] border border-border/60 bg-background/40 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{r.title}</span>
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${r.priority === "high" ? "bg-danger/20 text-danger" : r.priority === "medium" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>
                      {r.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => dis.mutate(r.id)} aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No active recommendations. Run more replays and refresh.</p>
        )}
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Today's Homework</div>
          <Button size="sm" variant="ghost" onClick={() => newHw.mutate()} disabled={newHw.isPending}>
            <Target className="mr-1 h-3.5 w-3.5" />
            {newHw.isPending ? "…" : "Generate"}
          </Button>
        </div>
        {activeHw ? (
          <div className="rounded-[3px] border border-border/60 bg-background/40 p-3 space-y-1">
            <div className="text-sm font-semibold">{activeHw.symbol} · {activeHw.timeframe}</div>
            <div className="text-[11px] text-muted-foreground">
              {activeHw.market} · {activeHw.session_hint ?? "any"} session · {activeHw.difficulty} · target {activeHw.target_r}R · max {activeHw.max_trades} trades
            </div>
            <p className="text-xs">{activeHw.reason}</p>
            <Button asChild size="sm" className="mt-1 w-full">
              <Link to="/replay">Start Practice</Link>
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No active homework. Generate one.</p>
        )}
      </GlassCard>

      <GlassCard className="p-5 space-y-3 lg:col-span-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Recent Debriefs</div>
          <Trophy className="h-4 w-4 text-primary" />
        </div>
        {(dQ.data as any[])?.length ? (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {(dQ.data as any[]).map((d: any) => (
              <li key={d.id} className="rounded-[3px] border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Grade {d.grade}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-xs text-foreground/90 line-clamp-3">{d.overall_summary}</p>
                <Link to="/replay/session" search={{ id: d.session_id }} className="mt-2 inline-block text-[11px] text-primary hover:underline">
                  Open session →
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Finish a replay and hit "Generate Debrief" in the session panel.</p>
        )}
      </GlassCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[3px] border border-border/60 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="h-1 mt-1 rounded-full bg-background/60 overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, v, d }: { label: string; v: number; d?: number }) {
  const dNum = Number(d ?? 0);
  const color = dNum > 0 ? "text-success" : dNum < 0 ? "text-danger" : "text-muted-foreground";
  return (
    <div className="rounded-[3px] border border-border/60 bg-background/30 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{Math.round(v)}</div>
      {dNum !== 0 ? <div className={`text-[10px] ${color}`}>{dNum > 0 ? "+" : ""}{Math.round(dNum)}</div> : null}
    </div>
  );
}
