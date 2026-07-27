import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Percent, Activity, Sigma, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeSummary } from "@/lib/dashboard-home.functions";

type Props = { data: HomeSummary["performance"] };

/**
 * Section 2 — Performance Snapshot.
 * Answers: "How am I performing?" Concise KPIs with trend indicators.
 */
export function PerformanceSnapshot({ data }: Props) {
  const kpis = [
    { key: "todayR", label: "Today", value: fmtR(data.todayR), trend: signOf(data.todayR), sub: `${data.tradesToday} trade${data.tradesToday === 1 ? "" : "s"}`, icon: Activity },
    { key: "weekR", label: "This week", value: fmtR(data.weekR), trend: signOf(data.weekDeltaR), sub: fmtDelta(data.weekDeltaR, "vs last wk"), icon: TrendingUp },
    { key: "monthR", label: "This month", value: fmtR(data.monthR), trend: signOf(data.monthR), sub: "Rolling MTD", icon: Sigma },
    { key: "winRate", label: "Win rate", value: `${data.winRate.toFixed(0)}%`, trend: data.winRate >= 50 ? "up" as const : "down" as const, sub: "Last 30 days", icon: Percent },
    { key: "profitFactor", label: "Profit factor", value: data.profitFactor > 0 ? data.profitFactor.toFixed(2) : "—", trend: data.profitFactor >= 1.5 ? "up" as const : data.profitFactor >= 1 ? "flat" as const : "down" as const, sub: "Gross win ÷ loss", icon: Sigma },
    { key: "avgR", label: "Avg R", value: fmtR(data.avgR), trend: signOf(data.avgR), sub: "Per closed trade", icon: TrendingUp },
    { key: "drawdown", label: "Current DD", value: `−${data.currentDrawdownR.toFixed(2)}R`, trend: data.currentDrawdownR >= 3 ? "down" as const : "flat" as const, sub: "Peak-to-trough", icon: ShieldAlert },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Performance snapshot</h2>
          <p className="text-[11px] text-muted-foreground/80">Live from your closed trades — no manual input.</p>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7"
      >
        {kpis.map((k) => (
          <div key={k.key} className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur transition hover:border-primary/30 hover:bg-card/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</span>
              <TrendIcon trend={k.trend} />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{k.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-success" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-danger" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function signOf(n: number): "up" | "down" | "flat" {
  if (n > 0.01) return "up";
  if (n < -0.01) return "down";
  return "flat";
}

function fmtR(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "0.00R";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}R`;
}
function fmtDelta(v: number, suffix: string): string {
  if (!Number.isFinite(v) || Math.abs(v) < 0.01) return `Flat ${suffix}`;
  return `${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(2)}R ${suffix}`;
}

// Also apply subtle emphasis for negative today R
export function todayTone(_v: number): string {
  return cn();
}
