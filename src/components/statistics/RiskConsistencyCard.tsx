import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { useStatistics } from "./context";
import { computeRiskConsistency, riskDistribution } from "@/lib/statistics/advanced";
import { fmtNumber, fmtPercent } from "@/lib/statistics/format";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

/**
 * Risk consistency & distribution — Phase 7 risk analysis card.
 * Configurable cap defaults to 2% of equity per trade.
 */
export function RiskConsistencyCard({ riskCapPct = 2 }: { riskCapPct?: number }) {
  const { filtered } = useStatistics();
  const risk = useMemo(() => computeRiskConsistency(filtered, riskCapPct), [filtered, riskCapPct]);
  const dist = useMemo(() => riskDistribution(filtered), [filtered]);

  const scoreTone = (s: number) => s >= 75 ? "text-success" : s >= 50 ? "text-warning" : "text-danger";

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Risk consistency</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            How consistent is your risk-per-trade? Cap: {riskCapPct}% equity.
          </div>
        </div>
        {risk.breaches > 0 ? (
          <Badge variant="outline" className="border-danger/40 bg-danger/10 text-danger">
            {risk.breaches} breaches ({fmtPercent(risk.breachRate)})
          </Badge>
        ) : (
          <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Within cap</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid grid-cols-2 gap-2 content-start">
          <Metric label="Risk consistency" value={`${Math.round(risk.riskConsistencyScore)}/100`} tone={scoreTone(risk.riskConsistencyScore)} />
          <Metric label="Size consistency" value={`${Math.round(risk.positionSizeConsistencyScore)}/100`} tone={scoreTone(risk.positionSizeConsistencyScore)} />
          <Metric label="Avg risk %" value={`${fmtNumber(risk.avgRiskPct)}%`} />
          <Metric label="Median risk %" value={`${fmtNumber(risk.medianRiskPct)}%`} />
          <Metric label="Largest risk" value={`${fmtNumber(risk.largestRiskPct)}%`} tone={risk.largestRiskPct > riskCapPct ? "text-danger" : ""} />
          <Metric label="σ (std dev)" value={`${fmtNumber(risk.stdDevRiskPct)}%`} />
          <Metric label="Avg lot size" value={fmtNumber(risk.avgLotSize)} />
          <Metric label="Lot σ" value={fmtNumber(risk.stdDevLotSize)} />
        </div>
        <div className="min-h-[220px]">
          {dist.every((d) => d.count === 0) ? (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">No risk% data on filtered trades.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dist} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k: string) => k === "count" ? [v, "Trades"] : [`$${Number(v).toFixed(2)}`, "P&L"]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {dist.map((d, i) => {
                    const overCap = d.bucket === ">5%" || (riskCapPct <= 2 && (d.bucket === "2–3%" || d.bucket === "3–5%"));
                    return <Cell key={i} fill={overCap ? "var(--danger)" : "var(--primary)"} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
