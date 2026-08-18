/**
 * Presentation primitives for the analytics workspace.
 *
 * These render numbers the engine produced. They contain no formulas — the
 * only logic here is formatting and the explicit "unavailable" state (§17):
 * a metric we cannot measure is never drawn as 0.
 */

import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { Measured } from "@/lib/analytics";
import type { MetricFormat, MetricView } from "@/lib/analytics/selectors";

export function formatMetric(value: number, format: MetricFormat): string {
  switch (format) {
    case "currency":
      return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "r":
      return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}R`;
    case "duration": {
      const s = Math.max(0, Math.round(value));
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ${m % 60}m`;
      return `${Math.floor(h / 24)}d ${h % 24}h`;
    }
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
}

export function fmt(value: number | null | undefined, format: MetricFormat): string {
  return value == null || !Number.isFinite(value) ? "—" : formatMetric(value, format);
}

export function Unavailable({ reason }: { reason: string }) {
  return (
    <span className="text-sm font-medium text-muted-foreground" title={reason}>
      Unavailable
    </span>
  );
}

export function MeasuredValue({
  value, format, className,
}: { value: Measured<number>; format: MetricFormat; className?: string }) {
  if (!value.available) return <Unavailable reason={value.reason} />;
  return <span className={className}>{formatMetric(value.value, format)}</span>;
}

export function MetricTile({ metric }: { metric: MetricView }) {
  const toneClass =
    metric.tone === "up" ? "text-success" : metric.tone === "down" ? "text-danger" : "";
  return (
    <GlassCard className="p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{metric.label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        <MeasuredValue value={metric.value} format={metric.format} className={toneClass} />
      </p>
      {metric.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{metric.hint}</p> : null}
    </GlassCard>
  );
}

export function Panel({
  title, subtitle, actions, children, className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={cn("p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </GlassCard>
  );
}

export function StatRow({
  label, value, hint, testId,
}: { label: string; value: ReactNode; hint?: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground" title={hint}>{label}</span>
      <span className="text-xs font-medium tabular-nums" data-testid={testId}>{value}</span>
    </div>
  );
}

export function ToneNumber({ value, format }: { value: number | null; format: MetricFormat }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("tabular-nums", value > 0 ? "text-success" : value < 0 ? "text-danger" : "")}>
      {formatMetric(value, format)}
    </span>
  );
}

/** Small notice used for partial-data and missing-metadata states (§17). */
export function DataNotice({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data coverage</p>
      <ul className="mt-1 space-y-0.5">
        {notes.map((n) => (
          <li key={n} className="text-[11px] text-muted-foreground">· {n}</li>
        ))}
      </ul>
    </div>
  );
}
