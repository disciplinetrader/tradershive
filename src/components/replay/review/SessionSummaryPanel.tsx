/**
 * Phase 8D · completed-session summary UI.
 *
 * Renders only what the server derived. No metric is computed here — if a
 * number is missing it is printed as "—" and explained in "Not measurable".
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReplaySessionSummary } from "@/lib/replay/review/summary";

const fmt = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-lg ${
          tone === "up" ? "text-emerald-500" : tone === "down" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </Card>
  );
}

export interface ScoreRecord {
  score: number;
  discipline: number;
  risk: number;
  execution: number;
  patience: number;
  consistency: number;
  journal_completion: number;
  score_version?: number | null;
  input_revision?: string | null;
  unknown_inputs?: unknown;
}

export function SessionSummaryPanel({
  summary,
  score,
  onScore,
  scoring,
}: {
  summary: ReplaySessionSummary;
  score: ScoreRecord | null;
  onScore: () => void;
  scoring: boolean;
}) {
  const p = summary.performance;
  return (
    <section className="space-y-4" aria-label="Session summary">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Net P/L" value={fmt(p.netPnl)} tone={p.netPnl >= 0 ? "up" : "down"} />
        <Kpi label="Trades" value={String(p.tradeCount)} />
        <Kpi label="Win rate" value={pct(p.winRate)} />
        <Kpi label="Expectancy" value={fmt(p.expectancy)} />
        <Kpi label="Average R" value={fmt(p.averageR)} />
        <Kpi label="Profit factor" value={fmt(p.profitFactor)} />
        <Kpi label="Max drawdown" value={fmt(summary.drawdown.maxDrawdown)} />
        <Kpi
          label="Ending balance"
          value={summary.endingBalance == null ? "—" : fmt(summary.endingBalance)}
        />
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Session score</div>
          <Button size="sm" variant="secondary" onClick={onScore} disabled={scoring}>
            {scoring ? "Scoring…" : score ? "Re-score" : "Score session"}
          </Button>
        </div>
        {score ? (
          <>
            <div className="flex items-baseline gap-3">
              <div className="font-mono text-3xl">{score.score}</div>
              <Badge variant="outline">v{score.score_version ?? 1}</Badge>
              {score.input_revision ? (
                <span className="font-mono text-[11px] text-muted-foreground">rev {score.input_revision}</span>
              ) : null}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              {[
                ["Discipline", score.discipline],
                ["Risk", score.risk],
                ["Execution", score.execution],
                ["Patience", score.patience],
                ["Consistency", score.consistency],
                ["Journaling", score.journal_completion],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded border border-border/50 px-2 py-1">
                  <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
                  <dd className="font-mono">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Not scored yet. Scoring runs on the server from the session's recorded trades, so the same session
            always produces the same score.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Reflection captured</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{summary.reflection.notes} notes</Badge>
          <Badge variant="outline">{summary.reflection.bookmarks} bookmarks</Badge>
          <Badge variant="outline">
            {summary.reflection.checklistDone}/{summary.reflection.checklistTotal} checklist
          </Badge>
          <Badge variant="outline">{summary.reflection.screenshots} screenshots</Badge>
          <Badge variant="outline">{summary.reflection.checkpoints} checkpoints</Badge>
        </div>
      </Card>

      {summary.unknowns.length ? (
        <Card className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Not measurable</div>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            {summary.unknowns.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

export function SessionTradesTable({ summary, trades }: { summary: ReplaySessionSummary; trades: { id: string; symbol: string; direction: string; fillPrice: number; exitPrice: number; netPnl: number; realizedR: number; closeReason: string; exitTime: number }[] }) {
  if (trades.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">No trades were closed in this session.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            {["Symbol", "Side", "Entry", "Exit", "R", "Net P/L", "Reason"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr
              key={t.id}
              className={`border-t border-border/40 ${
                t.id === summary.bestTradeId ? "bg-emerald-500/5" : t.id === summary.worstTradeId ? "bg-destructive/5" : ""
              }`}
            >
              <td className="px-2 py-1.5">{t.symbol}</td>
              <td className="px-2 py-1.5">{t.direction === "buy" ? "Long" : "Short"}</td>
              <td className="px-2 py-1.5 font-mono">{t.fillPrice}</td>
              <td className="px-2 py-1.5 font-mono">{t.exitPrice}</td>
              <td className="px-2 py-1.5 font-mono">{fmt(t.realizedR)}</td>
              <td className={`px-2 py-1.5 font-mono ${t.netPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {fmt(t.netPnl)}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{t.closeReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
