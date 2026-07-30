/** Compact performance grid. Missing inputs render as "—", never invented. */
import type { StoryMetrics } from "@/lib/journal/story";
import { formatCurrency, formatDuration, formatNumber } from "@/lib/journal/format";
import { Metric, MissingData } from "./primitives";

export function PerformanceSummary({ m, hasCandles }: { m: StoryMetrics; hasCandles: boolean }) {
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
  const price = (v: number | null) => (v == null ? "—" : formatNumber(v, 5));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <Metric label="Net P/L" value={formatCurrency(m.netPnl)} tone={m.netPnl == null ? "neutral" : m.netPnl > 0 ? "up" : m.netPnl < 0 ? "down" : "neutral"} />
        <Metric label="Gross P/L" value={formatCurrency(m.grossPnl)} />
        <Metric label="Fees" value={m.fees == null ? "—" : formatCurrency(-Math.abs(m.fees))} />
        <Metric
          label="R multiple"
          value={m.r == null ? "Not measurable" : `${m.r > 0 ? "+" : ""}${formatNumber(m.r, 2)}R`}
          tone={m.r == null ? "neutral" : m.r > 0 ? "up" : m.r < 0 ? "down" : "neutral"}
          hint={m.r == null ? "Needs a risk amount or entry + stop + size." : (m.rBasisLabel ?? undefined)}
        />
        <Metric
          label="Initial risk"
          value={
            m.riskAmount != null
              ? formatCurrency(m.riskAmount)
              : m.riskPct == null
                ? price(m.riskDistance)
                : `${formatNumber(m.riskPct, 2)}%`
          }
          hint={m.riskDistance == null ? undefined : `${price(m.riskDistance)} distance`}
        />

        <Metric label="Reward captured" value={m.plannedRR == null || m.r == null ? "—" : pct((m.r / m.plannedRR) * 100)} hint={m.plannedRR == null ? undefined : `plan ${formatNumber(m.plannedRR, 2)}R`} />
        <Metric label="MFE" value={price(m.mfe)} />
        <Metric label="MAE" value={price(m.mae)} />
        <Metric label="Hold time" value={formatDuration(m.holdSeconds)} />
        <Metric label="Entry efficiency" value={pct(m.entryEfficiency)} />
        <Metric label="Exit efficiency" value={pct(m.exitEfficiency)} />
        <Metric label="Sizing quality" value={m.sizingQuality == null ? "—" : `${m.sizingQuality}`} hint={m.sizingNote ?? undefined} />
      </div>
      {!hasCandles ? (
        <MissingData label="MFE, MAE and efficiency need chart history — they fill in once candles load for this window." />
      ) : null}
    </div>
  );
}
