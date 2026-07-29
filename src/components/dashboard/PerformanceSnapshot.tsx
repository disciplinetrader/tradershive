import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeSummary } from "@/lib/dashboard-home.functions";

type Props = { data: HomeSummary["performance"] };

const MIN_TRADES_FOR_STATS = 10;

/**
 * Section 2 — Performance Snapshot.
 * Answers: "How am I performing?"
 * Three focused KPIs: Net PnL (with sparkline + trade count), Win Rate, Profit Factor.
 * Below 10 trades in the 30d window, Win Rate + Profit Factor are hidden
 * behind a single "More trades needed" tile to avoid misleading statistics.
 */
export function PerformanceSnapshot({ data }: Props) {
  const enoughData = data.trades30d >= MIN_TRADES_FOR_STATS;
  const pnlTone = data.netPnl30d > 0 ? "up" : data.netPnl30d < 0 ? "down" : "flat";

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Performance · Last 30 days</h2>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <NetPnlTile pnl={data.netPnl30d} trades={data.trades30d} tone={pnlTone} spark={data.pnlSpark14d} />

        {enoughData ? (
          <>
            <KpiTile
              label="Win rate"
              value={`${data.winRate.toFixed(0)}%`}
              tone={data.winRate >= 50 ? "up" : "down"}
              sub="Closed trades · 30d"
            />
            <KpiTile
              label="Profit factor"
              value={data.profitFactor > 0 ? data.profitFactor.toFixed(2) : "—"}
              tone={data.profitFactor >= 1.5 ? "up" : data.profitFactor >= 1 ? "flat" : "down"}
              sub="Gross win ÷ loss"
            />
          </>
        ) : (
          <div className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/40 p-4">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/40 text-muted-foreground">
              <Info className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">More trades needed</p>
              <p className="text-xs text-muted-foreground">
                Win rate and profit factor unlock after {MIN_TRADES_FOR_STATS} closed trades
                ({data.trades30d}/{MIN_TRADES_FOR_STATS}).
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NetPnlTile({ pnl, trades, tone, spark }: { pnl: number; trades: number; tone: "up" | "down" | "flat"; spark: number[] }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net PnL</span>
        <TrendIcon trend={tone} />
      </div>
      <div className={cn("mt-2 text-3xl font-bold tabular-nums",
        tone === "up" && "text-success",
        tone === "down" && "text-danger",
      )}>
        {fmtPnl(pnl)}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <Sparkline values={spark} tone={tone} />
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {trades} trade{trades === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone, sub }: { label: string; value: string; tone: "up" | "down" | "flat"; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <TrendIcon trend={tone} />
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: "up" | "down" | "flat" }) {
  const path = useMemo(() => {
    if (!values.length) return "";
    const w = 96, h = 28;
    let cum = 0;
    const pts = values.map((v) => (cum += v));
    const min = Math.min(0, ...pts);
    const max = Math.max(0, ...pts);
    const range = max - min || 1;
    return pts
      .map((p, i) => {
        const x = (i / Math.max(1, pts.length - 1)) * w;
        const y = h - ((p - min) / range) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  const stroke = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-muted-foreground";

  return (
    <svg viewBox="0 0 96 28" width={96} height={28} className={cn("stroke-current", stroke)} aria-hidden>
      <path d={path} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-success" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-danger" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function fmtPnl(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  const formatted = abs >= 1000 ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 }) : abs.toFixed(2);
  return `${sign}$${formatted}`;
}
