/**
 * Visually-hidden accessible summary for canvas-based charts.
 * Renders an sr-only paragraph exposing the equivalent numeric summary
 * screen-reader users need (WCAG 1.1.1 / 2.4.6).
 *
 * Usage:
 *   <ChartA11ySummary label="Equity curve" series={equityPoints} unit="USD" />
 */
import { useMemo } from "react";

export type ChartA11ySummaryProps = {
  label: string;
  series: ReadonlyArray<number | { value: number } | null | undefined>;
  unit?: string;
  /** Optional current value override (e.g. live price different from last point). */
  current?: number;
  /** Number of decimals in exposed numbers. */
  digits?: number;
};

function pick(x: number | { value: number } | null | undefined): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  return Number.isFinite(x.value) ? x.value : null;
}

export function ChartA11ySummary({ label, series, unit, current, digits = 2 }: ChartA11ySummaryProps) {
  const summary = useMemo(() => {
    const values = series.map(pick).filter((v): v is number => v != null);
    if (values.length === 0) return `${label}: no data available.`;
    const first = values[0];
    const last = current ?? values[values.length - 1];
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    const net = last - first;
    const pct = first !== 0 ? (net / Math.abs(first)) * 100 : 0;
    const trend = net > 0 ? "up" : net < 0 ? "down" : "flat";
    const fmt = (n: number) => `${n.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
    return [
      `${label}.`,
      `Current ${fmt(last)}.`,
      `Range ${fmt(lo)} to ${fmt(hi)}.`,
      `Overall trend ${trend}, net change ${net >= 0 ? "+" : ""}${fmt(net)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%).`,
      `${values.length} data points.`,
    ].join(" ");
  }, [label, series, unit, current, digits]);

  return (
    <p className="sr-only" role="status" aria-live="polite" data-a11y="chart-summary">
      {summary}
    </p>
  );
}
