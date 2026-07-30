/**
 * JOURNAL X — PHASE 5 · Improvement Intelligence primitives.
 *
 * Compact, dark, thin-bordered, tabular. Colour is only spent on deltas that
 * clear a meaningful threshold; sample size and evidence level are always
 * visible rather than tucked away.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LABEL, type Confidence, type Evidence } from "@/lib/journal/improvement";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border/60 bg-card/30", className)}>
      <header className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[12px] font-semibold tracking-tight">{title}</h3>
          {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

const CONF_CLASS: Record<Confidence, string> = {
  insufficient: "border-border/60 text-muted-foreground",
  early: "border-amber-500/30 text-amber-400/90",
  moderate: "border-sky-500/30 text-sky-400/90",
  strong: "border-emerald-500/30 text-emerald-400/90",
};

export function EvidencePill({ evidence, className }: { evidence: Evidence; className?: string }) {
  return (
    <span
      title={evidence.why}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1 py-px text-[9px] uppercase tracking-wide",
        CONF_CLASS[evidence.level],
        className,
      )}
    >
      {CONFIDENCE_LABEL[evidence.level]}
      <span className="tabular-nums opacity-70">n={evidence.sample}</span>
    </span>
  );
}

export function Sample({ n, unit = "attempts" }: { n: number; unit?: string }) {
  return (
    <span className="text-[10px] tabular-nums text-muted-foreground">
      n={n} {unit}
    </span>
  );
}

export function Delta({ value, digits = 0, threshold = 2, suffix }: { value: number | null | undefined; digits?: number; threshold?: number; suffix?: string }) {
  if (value == null) return <span className="text-[11px] text-muted-foreground">Not measurable</span>;
  const tone = value >= threshold ? "text-emerald-400" : value <= -threshold ? "text-rose-400" : "text-muted-foreground";
  return (
    <span className={cn("tabular-nums", tone)}>
      {value > 0 ? "+" : ""}
      {value.toFixed(digits)}
      {suffix ?? ""}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-[13px] font-medium tabular-nums">{value}</div>
      {hint ? <div className="truncate text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Small, non-decorative empty state that always points at one action. */
export function InlineEmpty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[3px] border border-dashed border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground">
      <span className="min-w-0 flex-1">{text}</span>
      {action}
    </div>
  );
}

/** Bare sparkline for process delta over time. No axes, no chrome. */
export function Sparkline({ points, height = 28 }: { points: number[]; height?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map(Math.abs), 5);
  const w = 100;
  const step = w / (points.length - 1);
  const y = (v: number) => height / 2 - (v / max) * (height / 2 - 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(p).toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <line x1="0" y1={height / 2} x2={w} y2={height / 2} stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.5" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" className={last >= 0 ? "text-emerald-400" : "text-rose-400"} />
    </svg>
  );
}

export function Bars({ rows, max }: { rows: { label: string; value: number; tone?: "up" | "down" | "flat" }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{r.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-[2px] bg-muted/30">
            <span
              className={cn(
                "block h-full rounded-[2px]",
                r.tone === "up" ? "bg-emerald-500/70" : r.tone === "down" ? "bg-rose-500/70" : "bg-primary/50",
              )}
              style={{ width: `${Math.min(100, (Math.abs(r.value) / top) * 100)}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums">{r.value > 0 ? "+" : ""}{r.value}</span>
        </div>
      ))}
    </div>
  );
}
