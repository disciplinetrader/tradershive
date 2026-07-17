import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStatistics } from "./context";
import { computeKpis } from "@/lib/statistics/calculations";
import { resolveDateRange, previousPeriodRange } from "@/lib/statistics/date-range";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompareCard() {
  const { raw, filters } = useStatistics();
  const cur = resolveDateRange(filters.preset, filters.from, filters.to);
  const prev = previousPeriodRange(cur);

  const { curTrades, prevTrades } = useMemo(() => {
    const inRange = (r: { from: Date | null; to: Date | null }, t: (typeof raw)[number]) => {
      const anchor = t.closed_at ? new Date(t.closed_at) : new Date(t.opened_at);
      if (r.from && anchor < r.from) return false;
      if (r.to && anchor > r.to) return false;
      return true;
    };
    return {
      curTrades: raw.filter((t) => inRange(cur, t)),
      prevTrades: prev ? raw.filter((t) => inRange(prev, t)) : [],
    };
  }, [raw, cur, prev]);

  const c = computeKpis(curTrades);
  const p = computeKpis(prevTrades);

  const rows = [
    { label: "Net profit", cur: fmtCurrency(c.netProfit), prev: fmtCurrency(p.netProfit), delta: c.netProfit - p.netProfit, fmt: fmtCurrency },
    { label: "Win rate", cur: fmtPercent(c.winRate), prev: fmtPercent(p.winRate), delta: c.winRate - p.winRate, fmt: (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` },
    { label: "Avg RR", cur: `${fmtNumber(c.avgRR)}R`, prev: `${fmtNumber(p.avgRR)}R`, delta: c.avgRR - p.avgRR, fmt: (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}R` },
    { label: "Profit factor", cur: c.profitFactor >= 999 ? "∞" : fmtNumber(c.profitFactor), prev: p.profitFactor >= 999 ? "∞" : fmtNumber(p.profitFactor), delta: c.profitFactor - p.profitFactor, fmt: (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}` },
    { label: "Trades", cur: String(c.totalTrades), prev: String(p.totalTrades), delta: c.totalTrades - p.totalTrades, fmt: (n: number) => `${n >= 0 ? "+" : ""}${n}` },
  ];

  return (
    <GlassCard className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Compare with previous period</div>
      {!prev ? (
        <div className="grid h-24 place-items-center text-xs text-muted-foreground">Pick a bounded date range to compare.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {rows.map((r) => (
            <div key={r.label} className="rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">{r.cur}</div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Prev {r.prev}</span>
                <span className={cn("inline-flex items-center gap-0.5", r.delta > 0 ? "text-emerald-400" : r.delta < 0 ? "text-rose-400" : "text-muted-foreground")}>
                  {r.delta > 0 ? <ArrowUp className="h-3 w-3" /> : r.delta < 0 ? <ArrowDown className="h-3 w-3" /> : null}
                  {r.fmt(r.delta)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
