import { useMemo } from "react";
import type { PropChallengeDayRow } from "@/lib/prop-challenges/evaluator";

/**
 * Tiny inline SVG equity curve — no chart lib to keep bundle size down.
 * Renders daily end-of-day equity + a dashed drawdown-limit line.
 */
export function EquityCurve({ days, startingEquity, drawdownLimit }: {
  days: PropChallengeDayRow[];
  startingEquity: number;
  drawdownLimit: number;
}) {
  const w = 640, h = 200, pad = 24;

  const points = useMemo(() => {
    if (days.length === 0) return [] as { x: number; y: number; eq: number; date: string }[];
    const equities = [startingEquity, ...days.map((d) => Number(d.end_equity))];
    const min = Math.min(...equities, startingEquity - drawdownLimit);
    const max = Math.max(...equities, startingEquity * 1.02);
    const span = Math.max(1, max - min);
    return equities.map((eq, i) => ({
      x: pad + (i / Math.max(1, equities.length - 1)) * (w - pad * 2),
      y: pad + (1 - (eq - min) / span) * (h - pad * 2),
      eq,
      date: i === 0 ? "start" : (days[i - 1]?.day_date ?? ""),
    }));
  }, [days, startingEquity, drawdownLimit]);

  if (points.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
        Equity curve appears after your first trading day.
      </div>
    );
  }

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const min = Math.min(...points.map((p) => p.eq));
  const max = Math.max(...points.map((p) => p.eq));
  const span = Math.max(1, max - min);
  const yStart = pad + (1 - (startingEquity - min) / span) * (h - pad * 2);
  const yLimit = pad + (1 - (startingEquity - drawdownLimit - min) / span) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[200px] w-full">
      <line x1={pad} x2={w - pad} y1={yStart} y2={yStart} stroke="currentColor" className="text-muted-foreground/30" strokeDasharray="2 4" />
      <line x1={pad} x2={w - pad} y1={yLimit} y2={yLimit} stroke="currentColor" className="text-rose-500/50" strokeDasharray="4 4" />
      <path d={path} fill="none" strokeWidth={2} stroke="currentColor" className="text-primary" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} className="fill-primary" />
      ))}
    </svg>
  );
}
