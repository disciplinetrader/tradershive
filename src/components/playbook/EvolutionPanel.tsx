import { ArrowDown, ArrowRight, ArrowUp, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybookEvolution } from "@/lib/playbook/types";

export function EvolutionPanel({ evo, rangeDays }: { evo: PlaybookEvolution; rangeDays: number }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label={`Trades (last ${rangeDays}d)`} value={evo.current.trades} delta={evo.deltas.trades} format={(v) => String(v)} />
        <Metric label="Win rate" value={evo.current.win_rate} delta={evo.deltas.win_rate} format={(v) => `${Math.round(v * 100)}%`} />
        <Metric label="Avg R" value={evo.current.avg_r} delta={evo.deltas.avg_r} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`} />
      </div>

      <Sparkline points={evo.timeline.map((p) => p.avg_r)} labels={evo.timeline.map((p) => p.bucket)} />

      <div className="rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" /> Version history
        </div>
        {evo.versions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No prior versions. Every edit to rules or checklists is tracked here.</p>
        ) : (
          <ul className="space-y-2">
            {evo.versions.map((v) => (
              <li key={v.version} className="flex items-start gap-3 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-[11px] text-primary">
                  v{v.version}
                </span>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                  {v.change_notes ? <div className="mt-0.5 text-[13px]">{v.change_notes}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, delta, format }: { label: string; value: number; delta: number; format: (n: number) => string }) {
  const tone = delta > 0.0001 ? "up" : delta < -0.0001 ? "down" : "flat";
  const Icon = tone === "up" ? ArrowUp : tone === "down" ? ArrowDown : ArrowRight;
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{format(value)}</div>
      <div className={cn(
        "mt-1 inline-flex items-center gap-1 text-xs font-medium",
        tone === "up" && "text-success",
        tone === "down" && "text-destructive",
        tone === "flat" && "text-muted-foreground",
      )}>
        <Icon className="h-3 w-3" /> vs previous {format(delta)}
      </div>
    </div>
  );
}

function Sparkline({ points, labels }: { points: number[]; labels: string[] }) {
  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
        Not enough data for a trend yet. Log more trades to see performance over time.
      </div>
    );
  }
  const w = 600, h = 100, pad = 6;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const d = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const zeroY = h - pad - ((0 - min) / range) * (h - pad * 2);
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Avg R trend</span>
        <span>{labels[0]} → {labels[labels.length - 1]}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="currentColor" className="text-border" strokeDasharray="2 3" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" />
      </svg>
    </div>
  );
}
