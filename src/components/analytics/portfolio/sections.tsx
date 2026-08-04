/**
 * Sections A–G of the analytics workspace (§14).
 *
 * Every number below is read straight off the engine result. If a section
 * needs a figure that does not exist yet, the correct fix is to add it to the
 * engine — not to compute it here.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  selectBalanceSeries, selectCumulativeRSeries, selectEquitySeries, selectMonthlyReturns,
  selectOverview, selectPnlDistribution, selectUnderwaterSeries, selectWinLossSplit,
} from "@/lib/analytics/selectors";
import type { CohortRow } from "@/lib/analytics";
import { BarSeriesChart, CurveChart, HistogramChart, UnderwaterChart } from "./charts";
import { DataNotice, MetricTile, Panel, StatRow, ToneNumber, fmt } from "./primitives";
import { useAnalyticsWorkspace } from "./provider";

/* ── A. Overview ─────────────────────────────────────────────────────────── */

export function OverviewSection() {
  const { result } = useAnalyticsWorkspace();
  const metrics = useMemo(() => selectOverview(result), [result]);
  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => <MetricTile key={m.id} metric={m} />)}
      </div>
      <DataNotice notes={result.coverage.notes} />
    </section>
  );
}

/* ── B. Equity & drawdown ────────────────────────────────────────────────── */

type Curve = "pnl" | "balance" | "r";

export function EquitySection() {
  const { result, resolution } = useAnalyticsWorkspace();
  const [curve, setCurve] = useState<Curve>("pnl");

  const series = useMemo(() => {
    if (curve === "balance") return selectBalanceSeries(result);
    if (curve === "r") return selectCumulativeRSeries(result);
    return selectEquitySeries(result);
  }, [curve, result]);

  const dd = result.drawdown;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel
        className="xl:col-span-2"
        title="Equity curve"
        subtitle={`Cumulative ${curve === "r" ? "R" : curve === "balance" ? "balance" : "P/L"} · ${resolution}`}
        actions={
          <div className="inline-flex rounded-md border border-border/60 p-0.5">
            {([["pnl", "P/L"], ["balance", "Balance"], ["r", "R"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCurve(id)}
                className={cn(
                  "rounded-sm px-2 py-1 text-[11px] font-medium",
                  curve === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <CurveChart
          points={series}
          format={curve === "r" ? "r" : "currency"}
          empty={
            curve === "balance"
              ? "Balance curve needs an account starting balance — none is available for this selection."
              : curve === "r"
                ? "No trade in this selection has a risk basis, so there is no R curve to draw."
                : "No trades in this selection."
          }
        />
      </Panel>

      <Panel title="Drawdown" subtitle="Peak-to-trough on the filtered sample">
        <StatRow label="Current" value={<ToneNumber value={-dd.currentDrawdown} format="currency" />} />
        <StatRow label="Maximum" value={<ToneNumber value={-dd.maxDrawdown} format="currency" />} />
        <StatRow label="Max %" value={fmt(dd.maxDrawdownPercent, "percent")} hint="Requires a starting balance" />
        <StatRow label="Average" value={fmt(dd.averageDrawdown, "currency")} />
        <StatRow label="Recovery" value={fmt(dd.recoveryDurationSeconds, "duration")} />
        <StatRow label="Longest underwater" value={fmt(dd.longestDrawdownSeconds, "duration")} />
        <StatRow label="Episodes" value={dd.episodes.length} />
        <div className="mt-3">
          <UnderwaterChart points={selectUnderwaterSeries(result)} empty="No trades in this selection." />
        </div>
      </Panel>
    </div>
  );
}

/* ── C. Distribution ─────────────────────────────────────────────────────── */

export function DistributionSection() {
  const { result } = useAnalyticsWorkspace();
  const p = result.performance;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Monthly returns" subtitle="Realized P/L per calendar month">
        <BarSeriesChart points={selectMonthlyReturns(result)} empty="No closed trades yet." />
      </Panel>
      <Panel title="P/L distribution" subtitle="Buckets derived from this sample">
        <HistogramChart data={selectPnlDistribution(result)} empty="No closed trades yet." />
      </Panel>
      <Panel title="Outcome split" subtitle="Winners · losers · scratches">
        <HistogramChart data={selectWinLossSplit(result)} empty="No closed trades yet." />
        <div className="mt-2">
          <StatRow label="Average winner" value={<ToneNumber value={p.averageWinner} format="currency" />} />
          <StatRow label="Average loser" value={<ToneNumber value={p.averageLoser} format="currency" />} />
          <StatRow label="Payoff ratio" value={fmt(p.payoffRatio, "number")} />
          <StatRow label="Longest win streak" value={p.maxConsecutiveWins} />
          <StatRow label="Longest loss streak" value={p.maxConsecutiveLosses} />
          <StatRow label="Average hold" value={fmt(p.averageHoldSeconds, "duration")} />
        </div>
      </Panel>
    </div>
  );
}

/* ── D. Risk & execution quality ─────────────────────────────────────────── */

export function RiskExecutionSection() {
  const { result } = useAnalyticsWorkspace();
  const r = result.risk;
  const e = result.execution;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Risk profile" subtitle={`${r.sampleWithRisk} trade(s) carry a risk basis`}>
        <StatRow label="Average risk" value={fmt(r.averageRisk, "currency")} />
        <StatRow label="Maximum risk" value={fmt(r.maximumRisk, "currency")} />
        <StatRow label="Average risk %" value={fmt(r.averageRiskPercent, "percent")} />
        <StatRow label="Risk efficiency" value={fmt(r.riskEfficiency, "number")} hint="R returned per R risked" />
        <StatRow label="Reward capture" value={fmt(r.rewardCapturePercent, "percent")} hint="Realized R ÷ planned R" />
        <StatRow label="Stopped out" value={`${r.stopLossFrequency.toFixed(0)}%`} />
        <StatRow label="Target hit" value={`${r.takeProfitFrequency.toFixed(0)}%`} />
        <StatRow label="Closed manually" value={`${r.manualCloseFrequency.toFixed(0)}%`} />
      </Panel>

      <Panel title="R distribution" subtitle="Where your outcomes land">
        <HistogramChart
          data={r.rDistribution.map((b) => ({ label: b.bucket, count: b.count }))}
          empty="No trade in this selection has a risk basis."
        />
      </Panel>

      <Panel title="Execution quality" subtitle={`Execution tape on ${e.tapeCoverage.toFixed(0)}% of trades`}>
        <StatRow label="Average slippage" value={fmt(e.averageEntrySlippage, "number")} />
        <StatRow label="Slippage cost" value={<ToneNumber value={e.totalSlippageCost != null ? -e.totalSlippageCost : null} format="currency" />} />
        <StatRow label="Partial close effect" value={<ToneNumber value={e.partialCloseEffect} format="r" />} hint="Average R with partials vs without" />
        <StatRow label="Scale-in effect" value={<ToneNumber value={e.scaleInEffect} format="r" />} />
        <StatRow label="Break-even effect" value={<ToneNumber value={e.breakEvenEffect} format="r" />} />
        <StatRow label="Trailing stop effect" value={<ToneNumber value={e.trailingStopEffect} format="r" />} />
        <StatRow label="Planned vs realized R" value={`${fmt(e.averagePlannedR, "r")} → ${fmt(e.averageRealizedR, "r")}`} />
        <StatRow label="Reward left on table" value={fmt(e.rewardLeftOnTable, "r")} />
        <StatRow label="Executions per position" value={fmt(e.averageExecutionsPerPosition, "number")} />
      </Panel>
    </div>
  );
}

/* ── E. Behaviour ────────────────────────────────────────────────────────── */

export function BehaviourSection() {
  const { result } = useAnalyticsWorkspace();
  const { facts, flags } = result.behaviour;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Recorded behaviour" subtitle={`Journal metadata on ${facts.coveragePercent.toFixed(0)}% of trades`}>
        {facts.journaledCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing recorded yet. Emotions, plan adherence and mistakes come from your journal entries.
          </p>
        ) : (
          <>
            <StatRow label="Plan adherence" value={fmt(facts.planAdherenceRate, "percent")} />
            <StatRow label="Cost of mistakes" value={<ToneNumber value={facts.costOfMistakes} format="currency" />} />
            <StatRow label="Rule violations" value={facts.ruleViolationCount} />
            {facts.byEmotion.slice(0, 5).map((c) => (
              <StatRow
                key={c.key}
                label={`Emotion · ${c.key}`}
                value={<span>{c.count} · {c.winRate.toFixed(0)}% win · <ToneNumber value={c.netPnl} format="currency" /></span>}
              />
            ))}
            {facts.mistakeFrequency.slice(0, 5).map((m) => (
              <StatRow key={m.key} label={`Mistake · ${m.key}`} value={`${m.count} (${m.sharePercent.toFixed(0)}%)`} />
            ))}
          </>
        )}
      </Panel>

      <Panel title="Detected patterns" subtitle="Inferred from execution timing and sizing — not recorded facts">
        {flags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No behavioural pattern crossed its threshold in this selection.</p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={f.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{f.label}</p>
                  <Badge variant={f.severity === "high" ? "destructive" : "secondary"} className="h-5 text-[10px]">
                    {f.count} trade{f.count === 1 ? "" : "s"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{f.rule}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ── F. Playbooks & breakdowns ───────────────────────────────────────────── */

function CohortTable({ rows, minSample }: { rows: CohortRow[]; minSample: number }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data in this selection.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Name</th>
            <th className="py-2 pr-2 text-right font-medium">Trades</th>
            <th className="py-2 pr-2 text-right font-medium">Net P/L</th>
            <th className="py-2 pr-2 text-right font-medium">Avg R</th>
            <th className="py-2 pr-2 text-right font-medium">Win %</th>
            <th className="py-2 text-right font-medium">PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border/40 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 pr-2">
                <div className="max-w-[120px] truncate" title={r.label}>{r.label}</div>
                {!r.rankable ? (
                  <div className="text-[9px] text-muted-foreground" title={`Fewer than ${minSample} trades`}>
                    low sample
                  </div>
                ) : null}
              </td>
              <td className="py-2.5 pr-2 text-right tabular-nums">{r.count}</td>
              <td className="py-2.5 pr-2 text-right"><ToneNumber value={r.netPnl} format="currency" /></td>
              <td className="py-2.5 pr-2 text-right"><ToneNumber value={r.averageR} format="r" /></td>
              <td className="py-2.5 pr-2 text-right tabular-nums">{r.winRate.toFixed(0)}%</td>
              <td className="py-2.5 text-right tabular-nums">{r.profitFactor == null ? "—" : r.profitFactor.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BREAKDOWN_TABS = [
  { id: "symbol", label: "Symbol" },
  { id: "assetClass", label: "Asset" },
  { id: "direction", label: "Direction" },
  { id: "orderType", label: "Order type" },
  { id: "closeReason", label: "Close reason" },
  { id: "setup", label: "Setup" },
] as const;

export function PlaybookSection() {
  const { result, minSample } = useAnalyticsWorkspace();
  const [tab, setTab] = useState<(typeof BREAKDOWN_TABS)[number]["id"]>("symbol");

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Playbooks" subtitle={`Ranked once a playbook reaches ${minSample} trades`}>
        <CohortTable rows={result.playbooks} minSample={minSample} />
      </Panel>
      <Panel
        title="Breakdowns"
        subtitle="Same metrics, sliced by dimension"
        actions={
          <div className="flex flex-wrap gap-1">
            {BREAKDOWN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-sm px-2 py-1 text-[11px] font-medium",
                  tab === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        <CohortTable rows={result.breakdown[tab]} minSample={minSample} />
      </Panel>
    </div>
  );
}

/* ── G. Time, sessions & accounts ────────────────────────────────────────── */

function HeatStrip({ cells }: { cells: { label: string; netPnl: number; count: number }[] }) {
  const max = Math.max(1, ...cells.map((c) => Math.abs(c.netPnl)));
  return (
    <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-1.5">
      {cells.map((c) => {
        const intensity = Math.abs(c.netPnl) / max;
        return (
          <div
            key={c.label}
            title={`${c.label} · ${c.count} trades · ${c.netPnl.toFixed(2)}`}
            className="group relative flex h-10 items-center justify-center rounded-lg border border-border/40 text-[10px] font-medium tabular-nums transition-colors hover:border-border/80"
            style={{
              backgroundColor:
                c.count === 0
                  ? "transparent"
                  : `color-mix(in oklab, var(${c.netPnl >= 0 ? "--success" : "--destructive"}) ${Math.round(
                      15 + intensity * 65,
                    )}%, transparent)`,
            }}
          >
            <span className={cn(
              "transition-opacity duration-200 group-hover:opacity-0",
              c.count === 0 && "opacity-30"
            )}>
              {c.label.split(':')[0]}
            </span>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="font-bold">{c.count}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TimeSection() {
  const { result, minSample } = useAnalyticsWorkspace();
  const t = result.time;
  const cmp = result.comparison;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Sessions" subtitle={`Classified in ${result.timezone}`}>
          <CohortTable rows={t.sessions} minSample={minSample} />
          {t.bestSession ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-success" /> Best: {t.bestSession.label}
              {t.worstSession ? (
                <>
                  <TrendingDown className="ml-2 h-3 w-3 text-danger" /> Worst: {t.worstSession.label}
                </>
              ) : null}
            </p>
          ) : null}
        </Panel>
        <Panel title="Weekdays" subtitle="Realized P/L by day of week">
          <CohortTable rows={t.weekdays} minSample={minSample} />
        </Panel>
        <Panel title="Hour of day" subtitle="Entry hour, local timezone">
          <HeatStrip cells={t.hours.map((h) => ({ label: h.label, netPnl: h.netPnl, count: h.count }))} />
        </Panel>
      </div>

      <Panel
        title="Account comparison"
        subtitle="Combined return is weighted by starting balance, never averaged"
      >
        {cmp.accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No accounts in this selection.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Account</th>
                    <th className="py-1 pr-2 text-right font-medium">Trades</th>
                    <th className="py-1 pr-2 text-right font-medium">Net P/L</th>
                    <th className="py-1 pr-2 text-right font-medium">Return %</th>
                    <th className="py-1 pr-2 text-right font-medium">Avg R</th>
                    <th className="py-1 text-right font-medium">Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {cmp.accounts.map((a) => (
                    <tr key={a.accountId} className="border-t border-border/40">
                      <td className="py-1.5 pr-2">{a.accountName}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{a.count}</td>
                      <td className="py-1.5 pr-2 text-right"><ToneNumber value={a.netPnl} format="currency" /></td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {a.returnPercent == null ? "—" : `${a.returnPercent.toFixed(2)}%`}
                      </td>
                      <td className="py-1.5 pr-2 text-right"><ToneNumber value={a.averageR} format="r" /></td>
                      <td className="py-1.5 text-right tabular-nums">{a.maxDrawdown.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
              <span className="text-muted-foreground">Portfolio</span>
              <span><ToneNumber value={cmp.combinedNetPnl} format="currency" /></span>
              <span>
                {cmp.combinedReturnPercent == null ? (
                  <span className="text-muted-foreground">Return % unavailable</span>
                ) : (
                  `${cmp.combinedReturnPercent.toFixed(2)}%`
                )}
              </span>
              {cmp.partialBalanceData ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" /> Some accounts have no starting balance
                </span>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
