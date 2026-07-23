import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Brush } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatistics } from "./context";
import {
  computeEquityCurve, computeKpis, groupBy, groupByDay, groupByMonth,
  rMultipleHistogram, timeOfDayBuckets, weekdayBuckets,
} from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";
import { SESSION_LABEL } from "@/lib/statistics/session";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

function ChartCard({ title, subtitle, actions, height = 260, children }: { title: string; subtitle?: string; actions?: React.ReactNode; height?: number; children: React.ReactNode }) {
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
      <div style={{ height }} className="w-full">{children}</div>
    </GlassCard>
  );
}

/* Equity curve with brush zoom */
export function EquityCurveCard() {
  const { filtered, accounts, filters, loading } = useStatistics();
  const startingBalance = useMemo(() => {
    if (filters.accounts.length === 1) {
      const a = accounts.find((x) => x.id === filters.accounts[0]);
      return a ? Number(a.starting_balance) : 0;
    }
    return 0;
  }, [accounts, filters.accounts]);
  const data = useMemo(() => computeEquityCurve(filtered, startingBalance), [filtered, startingBalance]);
  const last = data[data.length - 1]?.equity ?? startingBalance;
  const pnl = last - startingBalance;
  const up = pnl >= 0;

  if (loading && filtered.length === 0) {
    return (
      <GlassCard className="p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[320px] w-full rounded-xl" />
      </GlassCard>
    );
  }


  return (
    <ChartCard
      title="Equity curve"
      subtitle="Cumulative P&L across the filtered range"
      height={320}
      actions={
        <Badge variant="outline" className={up ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger"}>
          {fmtCurrency(pnl)}
        </Badge>
      }
    >
      {data.length === 0 ? (
        <EmptyMsg />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFillStats" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => new Date(v).toLocaleString()}
              formatter={(v: number, name: string) => [`$${Number(v).toLocaleString()}`, name === "equity" ? "Equity" : "Drawdown"]}
            />
            <Area type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={2} fill="url(#equityFillStats)" isAnimationActive animationDuration={600} />
            <Brush dataKey="date" height={20} stroke="var(--primary)" travellerWidth={8} tickFormatter={() => ""} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function DrawdownCard() {
  const { filtered } = useStatistics();
  const data = useMemo(() => computeEquityCurve(filtered, 0).map((d) => ({ ...d, drawdown: -d.drawdown })), [filtered]);
  const k = useMemo(() => computeKpis(filtered), [filtered]);
  return (
    <ChartCard
      title="Drawdown"
      subtitle={`Max ${fmtCurrency(k.maxDrawdown)} (${k.maxDrawdownPct.toFixed(1)}%) · Current ${fmtCurrency(k.currentDrawdown)}`}
      height={220}
    >
      {data.length === 0 ? <EmptyMsg /> : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="var(--danger)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${Math.abs(Number(v)).toLocaleString()}`, "Drawdown"]} />
            <Area type="monotone" dataKey="drawdown" stroke="rgb(244 63 94)" strokeWidth={2} fill="url(#ddFill)" isAnimationActive />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function MonthlyPerformanceCard() {
  const { filtered } = useStatistics();
  const [metric, setMetric] = useState<"pnl" | "trades" | "winRate" | "avgRR">("pnl");
  const data = useMemo(() => groupByMonth(filtered), [filtered]);
  const labels: Record<typeof metric, string> = { pnl: "Net P&L", trades: "Trades", winRate: "Win rate", avgRR: "Avg RR" };
  return (
    <ChartCard
      title="Monthly performance"
      actions={
        <div className="flex gap-1">
          {(["pnl","trades","winRate","avgRR"] as const).map((m) => (
            <Button key={m} size="sm" variant={metric === m ? "default" : "outline"} className="h-7 px-2 text-[10px]" onClick={() => setMetric(m)}>{labels[m]}</Button>
          ))}
        </div>
      }
    >
      {data.length === 0 ? <EmptyMsg /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey={metric} radius={[6,6,0,0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={metric === "pnl" ? (d.pnl >= 0 ? "var(--primary)" : "rgb(244 63 94)") : "var(--primary)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function DailyPerformanceCard() {
  const { filtered } = useStatistics();
  const data = useMemo(() => groupByDay(filtered), [filtered]);
  return (
    <ChartCard title="Daily performance" subtitle="Profit, RR and trades per day">
      {data.length === 0 ? <EmptyMsg /> : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="pnl" name="Daily P&L" stroke="var(--primary)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="avgRR" name="Avg RR" stroke="rgb(56 189 248)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/* Win rate donut + breakdown */
export function WinRateBreakdownCard() {
  const { filtered } = useStatistics();
  const k = useMemo(() => computeKpis(filtered), [filtered]);
  const longs = useMemo(() => computeKpis(filtered.filter((t) => t.direction === "long")), [filtered]);
  const shorts = useMemo(() => computeKpis(filtered.filter((t) => t.direction === "short")), [filtered]);
  const bySession = useMemo(() => groupBy(filtered, (t) => t.session), [filtered]);
  const byMarket = useMemo(() => groupBy(filtered, (t) => t.market), [filtered]);
  const pie = [
    { name: "Wins", value: k.wins, color: "var(--primary)" },
    { name: "Losses", value: k.losses, color: "rgb(244 63 94)" },
    { name: "BE", value: k.breakevens, color: "var(--muted-foreground)" },
  ];

  return (
    <ChartCard title="Win rate analysis" height={300}>
      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 h-full">
        <div className="relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pie} dataKey="value" innerRadius={54} outerRadius={82} paddingAngle={3} stroke="none">
                {pie.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-2xl font-bold tabular-nums">{fmtPercent(k.winRate)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall</div>
            </div>
          </div>
        </div>
        <div className="space-y-2 overflow-y-auto">
          <BreakdownRow label="Long" value={longs.winRate} sub={`${longs.totalTrades} trades`} />
          <BreakdownRow label="Short" value={shorts.winRate} sub={`${shorts.totalTrades} trades`} />
          {byMarket.map((r) => <BreakdownRow key={r.key} label={r.key} value={r.winRate} sub={`${r.trades} trades`} />)}
          {bySession.map((r) => <BreakdownRow key={r.key} label={SESSION_LABEL[r.key] ?? r.key} value={r.winRate} sub={`${r.trades} trades`} />)}
        </div>
      </div>
    </ChartCard>
  );
}

function BreakdownRow({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-muted-foreground truncate capitalize">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-primary" />
      </div>
      <div className="text-xs tabular-nums w-16 text-right">{fmtPercent(value)}</div>
      <div className="text-[10px] text-muted-foreground w-16 text-right">{sub}</div>
    </div>
  );
}

export function ProfitFactorCard() {
  const { filtered } = useStatistics();
  const k = useMemo(() => computeKpis(filtered), [filtered]);
  const items = [
    { label: "Gross profit", value: fmtCurrency(k.grossProfit), tone: "up" as const },
    { label: "Gross loss", value: fmtCurrency(-k.grossLoss), tone: "down" as const },
    { label: "Profit factor", value: k.profitFactor >= 999 ? "∞" : fmtNumber(k.profitFactor), tone: k.profitFactor >= 1 ? "up" as const : "down" as const },
    { label: "Average winner", value: fmtCurrency(k.avgWinner), tone: "up" as const },
    { label: "Average loser", value: fmtCurrency(k.avgLoser), tone: "down" as const },
    { label: "Largest winner", value: fmtCurrency(k.largestWinner), tone: "up" as const },
    { label: "Largest loser", value: fmtCurrency(-k.largestLoser), tone: "down" as const },
  ];
  return (
    <ChartCard title="Profit factor" height={220}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 h-full content-start">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl border border-border/40 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${it.tone === "up" ? "text-success" : "text-danger"}`}>{it.value}</div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

export function ExpectancyCard() {
  const { filtered } = useStatistics();
  const k = useMemo(() => computeKpis(filtered), [filtered]);
  const winProb = k.winRate / 100;
  const avgRisk = useMemo(() => {
    const rs = filtered.map((t) => t.risk_pct).filter((r): r is number => r != null && !Number.isNaN(r));
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  }, [filtered]);
  return (
    <ChartCard title="Expectancy" height={220}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
        <div className="rounded-xl border border-border/40 p-4 bg-background/40">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Formula</div>
          <div className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
            E = (WinRate × AvgWin) − (LossRate × AvgLoss)
          </div>
          <div className="mt-3 text-3xl font-bold tabular-nums">{fmtCurrency(k.expectancy)}</div>
          <div className="text-xs text-muted-foreground mt-1">per trade</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4 bg-background/40 space-y-2">
          <Row k="Win probability" v={fmtPercent(winProb * 100)} />
          <Row k="Average winner" v={fmtCurrency(k.avgWinner)} />
          <Row k="Average loser" v={fmtCurrency(k.avgLoser)} />
          <Row k="Average R" v={`${fmtNumber(k.avgRR)}R`} />
          <Row k="Average risk %" v={avgRisk ? `${fmtNumber(avgRisk)}%` : "—"} />
          <Row k="Projected 100-trade P&L" v={fmtCurrency(k.expectancy * 100)} tone={k.expectancy >= 0 ? "up" : "down"} />
        </div>
      </div>
    </ChartCard>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-bold tabular-nums ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}>{v}</span>
    </div>
  );
}

export function RMultipleCard() {
  const { filtered } = useStatistics();
  const data = useMemo(() => rMultipleHistogram(filtered), [filtered]);
  return (
    <ChartCard title="R multiple distribution">
      {data.every((d) => d.count === 0) ? <EmptyMsg /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" radius={[6,6,0,0]}>
              {data.map((d, i) => <Cell key={i} fill={d.bucket.startsWith("-") ? "rgb(244 63 94)" : d.bucket === "0R" ? "var(--muted-foreground)" : "var(--primary)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function TimeOfDayCard() {
  const { filtered } = useStatistics();
  const hours = useMemo(() => timeOfDayBuckets(filtered), [filtered]);
  const days = useMemo(() => weekdayBuckets(filtered), [filtered]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ChartCard title="Trades by hour" height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hours} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[6,6,0,0]}>
              {hours.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "var(--primary)" : "rgb(244 63 94)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Trades by weekday" height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[6,6,0,0]}>
              {days.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "var(--primary)" : "rgb(244 63 94)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function EmptyMsg() {
  return (
    <div className="grid h-full place-items-center text-xs text-muted-foreground">
      No trades in the selected range.
    </div>
  );
}
