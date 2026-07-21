import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { computePatternInsights, getCoachMemory, getTraderProfile } from "@/lib/replay-coach.functions";

export const Route = createFileRoute("/_authenticated/ai/coach/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const p = useServerFn(getTraderProfile);
  const m = useServerFn(getCoachMemory);
  const pat = useServerFn(computePatternInsights);
  const pQ = useQuery({ queryKey: ["coach", "profile"], queryFn: () => p() });
  const mQ = useQuery({ queryKey: ["coach", "memory"], queryFn: () => m() });
  const patQ = useQuery({ queryKey: ["coach", "patterns"], queryFn: () => pat() });

  const prof: any = pQ.data;
  const patterns: any = patQ.data;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassCard className="p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Trader Profile</div>
        <div className="text-2xl font-bold">{prof?.style ?? "—"}</div>
        <div className="grid grid-cols-2 gap-2">
          {(["consistency", "risk_discipline", "execution_quality", "patience", "decision_quality", "confidence"] as const).map((k) => (
            <div key={k} className="rounded-[3px] border border-border/60 bg-background/40 p-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">{k.replace(/_/g, " ")}</div>
              <div className="text-lg font-semibold tabular-nums">{prof?.[k] ?? 0}</div>
              <div className="h-1 mt-1 rounded-full bg-background/60 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, prof?.[k] ?? 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Strengths</div>
        <ul className="list-disc pl-4 text-sm space-y-0.5">
          {(prof?.strengths ?? []).map((s: string) => <li key={s} className="text-success">{s}</li>)}
          {!prof?.strengths?.length ? <li className="list-none text-xs text-muted-foreground">Complete more sessions to reveal strengths.</li> : null}
        </ul>
        <div className="text-xs uppercase tracking-wider text-muted-foreground pt-2">Weaknesses</div>
        <ul className="list-disc pl-4 text-sm space-y-0.5">
          {(prof?.weaknesses ?? []).map((w: string) => <li key={w} className="text-danger">{w}</li>)}
          {!prof?.weaknesses?.length ? <li className="list-none text-xs text-muted-foreground">None identified.</li> : null}
        </ul>
      </GlassCard>

      <GlassCard className="p-5 space-y-3 lg:col-span-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Pattern Insights</div>
        {patterns ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Pat label="Best Symbol" v={patterns.symbol?.best?.key} />
            <Pat label="Worst Symbol" v={patterns.symbol?.worst?.key} />
            <Pat label="Best Market" v={patterns.market?.best?.key} />
            <Pat label="Best Timeframe" v={patterns.timeframe?.best?.key} />
            <Pat label="Best Session" v={patterns.session?.best?.key} />
            <Pat label="Best Mode" v={patterns.mode?.best?.key} />
            <Pat label="Avg Hold" v={`${patterns.avg_holding_minutes}m`} />
            <Pat label="Ideal RR" v={`${patterns.rr_range?.low}-${patterns.rr_range?.high}`} />
          </div>
        ) : <div className="h-20 animate-pulse rounded-[3px] bg-muted/40" />}
      </GlassCard>

      <GlassCard className="p-5 space-y-3 lg:col-span-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Coach Memory</div>
        {(mQ.data as any[])?.length ? (
          <ul className="space-y-1.5 max-h-80 overflow-auto pr-1">
            {(mQ.data as any[]).map((row: any) => (
              <li key={row.id} className="flex items-center justify-between rounded-[3px] border border-border/60 bg-background/40 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">{row.kind}</span>
                  <span className="text-sm truncate">{row.key}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">weight {Number(row.weight).toFixed(1)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No memories yet. Debriefs teach the coach.</p>
        )}
      </GlassCard>
    </div>
  );
}

function Pat({ label, v }: { label: string; v: any }) {
  return (
    <div className="rounded-[3px] border border-border/60 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{v ?? "—"}</div>
    </div>
  );
}
