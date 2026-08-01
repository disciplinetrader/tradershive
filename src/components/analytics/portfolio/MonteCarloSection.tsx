/**
 * §H Monte Carlo — forward risk on the filtered sample.
 *
 * Bootstraps the realised P/L sequence into thousands of alternative futures
 * so a trader can see the spread of outcomes their edge actually implies,
 * rather than the single path history happened to take.
 */

import { useMemo, useState } from "react";
import { Dices } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { runMonteCarlo } from "@/lib/analytics/monte-carlo";
import { Panel, StatRow, ToneNumber, fmt, formatMetric } from "./primitives";
import { useAnalyticsWorkspace } from "./provider";

const AXIS = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;
const SIM_OPTIONS = [500, 1000, 5000] as const;

export function MonteCarloSection() {
  const { result } = useAnalyticsWorkspace();
  const [simulations, setSimulations] = useState<number>(1000);
  const [horizonMode, setHorizonMode] = useState<"sample" | 50 | 100 | 250>("sample");

  const pnls = useMemo(() => result.records.map((r) => r.netPnl), [result.records]);
  const startingBalance = result.equity.startingBalance;

  const mc = useMemo(
    () =>
      runMonteCarlo(pnls, {
        simulations,
        horizon: horizonMode === "sample" ? pnls.length : horizonMode,
        startingBalance,
      }),
    [pnls, simulations, horizonMode, startingBalance],
  );

  const chartData = useMemo(
    () =>
      mc.bands.map((b) => ({
        label: `Trade ${b.index}`,
        index: b.index,
        // Stacked areas draw the p5→p95 and p25→p75 envelopes.
        lower: b.p5,
        innerLowerSpan: b.p25 - b.p5,
        innerUpperSpan: b.p75 - b.p25,
        outerUpperSpan: b.p95 - b.p75,
        median: b.median,
        p5: b.p5,
        p95: b.p95,
      })),
    [mc.bands],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel
        className="xl:col-span-2"
        title="Monte Carlo projection"
        subtitle={
          mc.available
            ? `${mc.simulations.toLocaleString()} bootstrapped paths × ${mc.horizon} trades, resampled from ${mc.sampleSize} closed trades`
            : "Forward outcome envelope from your realised trade distribution"
        }
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <div className="inline-flex rounded-md border border-border/60 p-0.5">
              {SIM_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSimulations(n)}
                  className={cn(
                    "rounded-sm px-2 py-1 text-[11px] font-medium",
                    simulations === n ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n >= 1000 ? `${n / 1000}k` : n}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-border/60 p-0.5">
              {(["sample", 50, 100, 250] as const).map((h) => (
                <button
                  key={String(h)}
                  type="button"
                  onClick={() => setHorizonMode(h)}
                  className={cn(
                    "rounded-sm px-2 py-1 text-[11px] font-medium",
                    horizonMode === h ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {h === "sample" ? "Sample" : `${h} trades`}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {!mc.available ? (
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60">
            <p className="flex max-w-[70%] flex-col items-center gap-2 text-center text-xs text-muted-foreground">
              <Dices className="h-5 w-5" />
              {mc.reason}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={((value: number, name: string) =>
                  ["p5", "p95", "median"].includes(name)
                    ? [formatMetric(value, "currency"), name === "median" ? "Median" : name.toUpperCase()]
                    : null) as never}
              />
              {/* invisible base so the bands float at the p5 level */}
              <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="innerLowerSpan" stackId="band" stroke="none" fill="var(--primary)" fillOpacity={0.1} isAnimationActive={false} />
              <Area dataKey="innerUpperSpan" stackId="band" stroke="none" fill="var(--primary)" fillOpacity={0.22} isAnimationActive={false} />
              <Area dataKey="outerUpperSpan" stackId="band" stroke="none" fill="var(--primary)" fillOpacity={0.1} isAnimationActive={false} />
              <Line type="monotone" dataKey="median" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p5" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p95" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Outcome odds" subtitle="Across every simulated path">
        <StatRow
          label="Chance of profit"
          value={mc.available ? `${(mc.probabilityOfProfit * 100).toFixed(1)}%` : "—"}
        />
        <StatRow
          label="Risk of ruin (−50%)"
          value={mc.riskOfRuin == null ? "—" : `${(mc.riskOfRuin * 100).toFixed(1)}%`}
          hint="Requires an account starting balance"
        />
        <StatRow label="Median outcome" value={<ToneNumber value={mc.available ? mc.finalPnl.median : null} format="currency" />} />
        <StatRow label="Bad case (5th pct)" value={<ToneNumber value={mc.available ? mc.finalPnl.p5 : null} format="currency" />} />
        <StatRow label="Good case (95th pct)" value={<ToneNumber value={mc.available ? mc.finalPnl.p95 : null} format="currency" />} />
        <StatRow label="Median max drawdown" value={fmt(mc.available ? mc.maxDrawdown.median : null, "currency")} />
        <StatRow label="95th pct drawdown" value={fmt(mc.available ? mc.maxDrawdown.p95 : null, "currency")} />
        <StatRow label="Worst drawdown seen" value={fmt(mc.available ? mc.maxDrawdown.worst : null, "currency")} />
        <StatRow label="Losing streak (median / 95th)" value={mc.available ? `${mc.losingStreak.median.toFixed(0)} / ${mc.losingStreak.p95.toFixed(0)}` : "—"} />
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Trades are resampled with replacement from your own results, so the projection inherits your real
          win rate and tail sizes. It assumes future trades look like the filtered sample and are independent.
        </p>
      </Panel>
    </div>
  );
}
