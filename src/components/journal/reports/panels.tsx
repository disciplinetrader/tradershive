/**
 * The six journal reports.
 *
 * Charts are the analytics workspace's wrappers, not new ones — they already
 * enforce a zero baseline, an un-truncated axis and an explicit message for
 * empty data. Those rules are the visual form of the same principle these
 * reports are built on: render the absence, never a fabricated number.
 */
import { GlassCard } from "@/components/ui/glass-card";
import { CurveChart, BarSeriesChart, UnderwaterChart } from "@/components/analytics/portfolio/charts";
import type { SeriesPoint } from "@/lib/analytics/selectors";
import type { CohortRow, TimeAnalytics } from "@/lib/analytics/cohorts";
import type { EquitySeries } from "@/lib/analytics/equity";
import type { DrawdownMetrics } from "@/lib/analytics/drawdown";
import {
  MIN_SAMPLE,
  measurableRate,
  type MistakeCostRow,
  type WinLossAnatomy,
} from "@/lib/journal/reports";
import { formatCurrency } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

/* ── shared primitives ───────────────────────────────────────────────────── */

export function ReportCard({
  title,
  question,
  children,
  footer,
}: {
  title: string;
  /** The question this report answers. If it has none, it should not exist. */
  question: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <GlassCard className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{question}</p>
      </div>
      {children}
      {footer ? <div className="mt-3 text-[11px] text-muted-foreground">{footer}</div> : null}
    </GlassCard>
  );
}

/**
 * A rate that refuses to render when the sample cannot support it.
 *
 * "100% win rate" over one trade is not a small error, it is a confident one —
 * and in a report it carries more authority than anywhere else in the product.
 */
export function Rate({
  sample,
  value,
  suffix = "%",
  min = MIN_SAMPLE,
}: {
  sample: number;
  value: number;
  suffix?: string;
  min?: number;
}) {
  const m = measurableRate(sample, value, min);
  if (!m.measurable) {
    return (
      <span className="text-muted-foreground" title={m.reason}>
        Not measurable <span className="text-[10px]">({m.reason})</span>
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {m.value.toFixed(1)}
      {suffix}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      >
        {value}
      </p>
    </div>
  );
}

const seconds = (s: number | null) =>
  s == null ? "—" : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`;

/* ── 1. Equity curve + drawdown ──────────────────────────────────────────── */

export function EquityReport({ equity, drawdown }: { equity: EquitySeries; drawdown: DrawdownMetrics }) {
  const curve: SeriesPoint[] = equity.points.map((p) => ({
    x: p.time,
    label: p.key,
    value: p.cumulativePnl,
  }));
  const underwater: SeriesPoint[] = equity.points.map((p) => ({
    x: p.time,
    label: p.key,
    value: p.underwater,
  }));

  return (
    <ReportCard
      title="Equity & drawdown"
      question="Am I growing, and how much do I give back on the way?"
      footer="Drawdown is the underwater plot of this same curve, not a separate calculation."
    >
      <CurveChart points={curve} empty="No closed trades in range." />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Net P&L"
          value={formatCurrency(equity.finalCumulativePnl)}
          tone={equity.finalCumulativePnl >= 0 ? "up" : "down"}
        />
        <Stat label="Max drawdown" value={formatCurrency(-Math.abs(drawdown.maxDrawdown))} tone="down" />
        <Stat
          label="Currently under"
          value={drawdown.currentDrawdown ? formatCurrency(-Math.abs(drawdown.currentDrawdown)) : "—"}
        />
        <Stat label="Longest underwater" value={seconds(drawdown.underwaterSeconds || null)} />
      </div>
      <div className="mt-3">
        <UnderwaterChart points={underwater} empty="No drawdown to plot yet." />
      </div>
    </ReportCard>
  );
}

/* ── 2. Setup performance ────────────────────────────────────────────────── */

export function SetupReport({ rows }: { rows: CohortRow[] }) {
  const ranked = [...rows].sort((a, b) => (b.expectancy ?? -Infinity) - (a.expectancy ?? -Infinity));
  return (
    <ReportCard
      title="Setup performance"
      question="Which setups actually make money?"
      footer={`Ranked by expectancy, not win rate — a 30% setup at 5R beats a 70% one at 0.3R. Rates need ${MIN_SAMPLE} trades.`}
    >
      {ranked.length === 0 ? (
        <Empty>Tag entries with a setup to rank them.</Empty>
      ) : (
        <Table
          head={["Setup", "Trades", "Expectancy", "Win rate", "Avg R", "Net"]}
          rows={ranked.map((r) => [
            r.label,
            String(r.count),
            r.expectancy == null ? "—" : formatCurrency(r.expectancy),
            <Rate key="w" sample={r.count} value={r.winRate} />,
            r.averageR == null ? "Not measurable" : r.averageR.toFixed(2),
            <span key="n" className={r.netPnl >= 0 ? "text-success" : "text-danger"}>
              {formatCurrency(r.netPnl)}
            </span>,
          ])}
        />
      )}
    </ReportCard>
  );
}

/* ── 3. Mistake cost ─────────────────────────────────────────────────────── */

export function MistakeCostReport({ rows }: { rows: MistakeCostRow[] }) {
  return (
    <ReportCard
      title="Mistake cost"
      question="What is my worst habit actually costing me?"
      footer="Cost contrasts trades carrying the tag against those that do not — it is not the sum of losses that happen to be tagged. Shown from the first occurrence, with the count beside it."
    >
      {rows.length === 0 ? (
        <Empty>No mistakes tagged in range. Tag them on a trade and this becomes the report that pays for the tagging.</Empty>
      ) : (
        <Table
          head={["Mistake", "Times", "Est. cost", "Net when tagged", "Avg R"]}
          rows={rows.map((r) => [
            r.value.replace(/_/g, " "),
            String(r.occurrences),
            <span key="c" className={r.estimatedCost > 0 ? "text-danger" : "text-success"}>
              {formatCurrency(-Math.abs(r.estimatedCost) * (r.estimatedCost > 0 ? 1 : -1))}
            </span>,
            formatCurrency(r.netPnl),
            r.avgR == null ? "Not measurable" : r.avgR.toFixed(2),
          ])}
        />
      )}
    </ReportCard>
  );
}

/* ── 4. Market session (UTC-anchored) ────────────────────────────────────── */

export function SessionReport({ time }: { time: TimeAnalytics }) {
  return (
    <ReportCard
      title="Market session"
      question="Which volatility regime suits me?"
      footer="Sessions are UTC-anchored — London is a market fact and does not move with the trader."
    >
      {time.sessions.length === 0 ? (
        <Empty>No session data in range.</Empty>
      ) : (
        <Table
          head={["Session", "Trades", "Win rate", "Avg R", "Net"]}
          rows={time.sessions.map((r) => [
            r.label,
            String(r.count),
            <Rate key="w" sample={r.count} value={r.winRate} />,
            r.averageR == null ? "Not measurable" : r.averageR.toFixed(2),
            <span key="n" className={r.netPnl >= 0 ? "text-success" : "text-danger"}>
              {formatCurrency(r.netPnl)}
            </span>,
          ])}
        />
      )}
    </ReportCard>
  );
}

/* ── 5. Hour of day (trader's timezone) ──────────────────────────────────── */

export function HourReport({ time, timezone }: { time: TimeAnalytics; timezone: string }) {
  const points: SeriesPoint[] = time.hours.map((r) => ({
    x: Number(r.key),
    label: `${String(r.key).padStart(2, "0")}:00`,
    value: r.netPnl,
  }));
  return (
    <ReportCard
      title="Hour of day"
      question="When in my own day am I sharp?"
      footer={`Attributed in ${timezone}. A different question from session: this one is about routine, sleep and screen time.`}
    >
      <BarSeriesChart points={points} empty="No closed trades in range." />
    </ReportCard>
  );
}

/* ── 6. Win vs loss anatomy ──────────────────────────────────────────────── */

export function AnatomyReport({ anatomy }: { anatomy: WinLossAnatomy }) {
  const { wins, losses, holdTimeRatio } = anatomy;
  return (
    <ReportCard
      title="Win vs loss anatomy"
      question="What is structurally different about my winners?"
      footer={
        holdTimeRatio == null
          ? "A hold-time ratio needs both a win and a loss in range."
          : `Losers are held ${holdTimeRatio.toFixed(1)}× as long as winners.`
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["Winners", wins, "up"],
          ["Losers", losses, "down"],
        ] as const).map(([label, side, tone]) => (
          <div key={label} className="rounded-xl border border-border/60 p-3">
            <p className={cn("text-xs font-semibold", tone === "up" ? "text-success" : "text-danger")}>
              {label} · {side.count}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Avg P&L" value={side.avgPnl == null ? "—" : formatCurrency(side.avgPnl)} />
              <Stat label="Avg R" value={side.avgR == null ? "Not measurable" : side.avgR.toFixed(2)} />
              <Stat label="Avg hold" value={seconds(side.avgHoldSeconds)} />
              <Stat label="Avg size" value={side.avgQuantity == null ? "—" : side.avgQuantity.toFixed(2)} />
            </div>
            {side.topTags.length ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Most tagged: {side.topTags.map((t) => `${t.value.replace(/_/g, " ")} (${t.count})`).join(", ")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </ReportCard>
  );
}

/* ── small shared bits ───────────────────────────────────────────────────── */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border/60 p-4">
      <p className="max-w-[80%] text-center text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/50">
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
