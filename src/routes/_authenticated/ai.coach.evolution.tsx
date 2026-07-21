import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { computeImprovementTracking, getReplayEvolution } from "@/lib/replay-coach.functions";

export const Route = createFileRoute("/_authenticated/ai/coach/evolution")({
  component: EvolutionPage,
});

function EvolutionPage() {
  const evo = useServerFn(getReplayEvolution);
  const imp = useServerFn(computeImprovementTracking);
  const eQ = useQuery({ queryKey: ["coach", "evolution"], queryFn: () => evo() });
  const wQ = useQuery({ queryKey: ["coach", "improve", "weekly"], queryFn: () => imp({ data: { period: "weekly" } }) });
  const mQ = useQuery({ queryKey: ["coach", "improve", "monthly"], queryFn: () => imp({ data: { period: "monthly" } }) });
  const qQ = useQuery({ queryKey: ["coach", "improve", "quarterly"], queryFn: () => imp({ data: { period: "quarterly" } }) });
  const yQ = useQuery({ queryKey: ["coach", "improve", "yearly"], queryFn: () => imp({ data: { period: "yearly" } }) });

  const data: any = eQ.data;
  const series: { at: string; score: number }[] = data?.series ?? [];
  const max = Math.max(1, ...series.map((s) => s.score));
  const first = data?.first;
  const latest = data?.latest;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SnapshotCard title="First Replay" s={first} />
        <SnapshotCard title="Latest Replay" s={latest} />
        <GlassCard className="p-5 space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Growth</div>
          {first && latest ? (
            <>
              <div className="text-3xl font-bold tabular-nums text-primary">
                {(latest.score - first.score >= 0 ? "+" : "") + Math.round(latest.score - first.score)}
                <span className="text-xs text-muted-foreground"> points</span>
              </div>
              <p className="text-xs text-muted-foreground">Score change from first to latest replay.</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Not enough sessions yet.</p>
          )}
          <div className="text-[11px] text-muted-foreground">Total sessions: {data?.count ?? 0}</div>
        </GlassCard>
      </div>

      <GlassCard className="p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Replay Score Progress</div>
        {series.length > 1 ? (
          <div className="h-40 flex items-end gap-0.5">
            {series.map((s, i) => (
              <div key={i} title={`${new Date(s.at).toLocaleDateString()} · ${s.score}`}
                className="flex-1 bg-primary/70 hover:bg-primary rounded-t-[1px]"
                style={{ height: `${Math.max(2, (s.score / max) * 100)}%` }} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Run more sessions to build your trend.</p>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <ImprovementCard title="Weekly" data={wQ.data as any} />
        <ImprovementCard title="Monthly" data={mQ.data as any} />
        <ImprovementCard title="Quarterly" data={qQ.data as any} />
        <ImprovementCard title="Yearly" data={yQ.data as any} />
      </div>
    </div>
  );
}

function SnapshotCard({ title, s }: { title: string; s: any }) {
  return (
    <GlassCard className="p-5 space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      {s ? (
        <>
          <div className="text-2xl font-bold">{s.symbol}</div>
          <div className="text-xs text-muted-foreground">{s.market} · {s.timeframe}</div>
          <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</div>
          <div className="text-lg font-semibold tabular-nums text-primary">Score {s.score}</div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </GlassCard>
  );
}

function ImprovementCard({ title, data }: { title: string; data: any }) {
  if (!data) return <GlassCard className="p-4 h-32 animate-pulse" />;
  const items: [string, number, string?][] = [
    ["Score", data.deltas?.avg_score ?? 0, "pts"],
    ["Win Rate", data.deltas?.win_rate ?? 0, "%"],
    ["Avg RR", data.deltas?.avg_rr ?? 0, "R"],
    ["Mistakes", data.deltas?.mistakes ?? 0, ""],
  ];
  return (
    <GlassCard className="p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {items.map(([label, delta, unit]) => {
          const invert = label === "Mistakes";
          const positive = invert ? delta < 0 : delta > 0;
          const color = delta === 0 ? "text-muted-foreground" : positive ? "text-success" : "text-danger";
          return (
            <li key={label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-semibold tabular-nums ${color}`}>{delta > 0 ? "+" : ""}{delta}{unit}</span>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
