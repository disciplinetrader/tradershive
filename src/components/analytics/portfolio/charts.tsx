/**
 * Chart wrappers for the analytics workspace (§15).
 *
 * Rules enforced here so no chart can break them:
 *  · series come from selectors only
 *  · a zero baseline is always drawn
 *  · empty / single-point / all-loss data render an explicit message, never a
 *    fabricated placeholder series
 *  · the y axis is never truncated away from zero
 */

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/analytics/selectors";
import { formatMetric } from "./primitives";
import type { MetricFormat } from "@/lib/analytics/selectors";

const AXIS = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60">
      <p className="max-w-[70%] text-center text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function tooltipFormatter(format: MetricFormat) {
  return (value: number) => formatMetric(value, format);
}

/** Domain that always contains zero — prevents misleading axis truncation. */
function domainWithZero(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

export function CurveChart({
  points, format = "currency", empty, color = "var(--primary)",
}: {
  points: SeriesPoint[];
  format?: MetricFormat;
  empty: string;
  color?: string;
}) {
  if (points.length === 0) return <EmptyChart message={empty} />;
  const values = points.map((p) => p.value);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="analyticsCurve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeOpacity={0.12} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} domain={domainWithZero(values)} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
        <Tooltip
          formatter={tooltipFormatter(format) as never}
          labelFormatter={(l) => String(l)}
          contentStyle={{ fontSize: 12 }}
        />
        <Area type="monotone" dataKey="value" stroke={color} fill="url(#analyticsCurve)" strokeWidth={2} dot={points.length === 1} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarSeriesChart({
  points, format = "currency", empty,
}: { points: SeriesPoint[]; format?: MetricFormat; empty: string }) {
  if (points.length === 0) return <EmptyChart message={empty} />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeOpacity={0.12} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} domain={domainWithZero(points.map((p) => p.value))} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
        <Tooltip formatter={tooltipFormatter(format) as never} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="var(--primary)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HistogramChart({
  data, empty,
}: { data: { label: string; count: number }[]; empty: string }) {
  if (data.length === 0) return <EmptyChart message={empty} />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeOpacity={0.12} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-20} height={44} textAnchor="end" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="var(--primary)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UnderwaterChart({ points, empty }: { points: SeriesPoint[]; empty: string }) {
  if (points.length === 0) return <EmptyChart message={empty} />;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeOpacity={0.12} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} domain={domainWithZero(points.map((p) => p.value))} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
        <Tooltip formatter={tooltipFormatter("currency") as never} contentStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="value" stroke="var(--destructive)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
