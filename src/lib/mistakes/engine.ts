import { runDetectors } from "./detectors";
import { buildInsights } from "./insights";
import type { EngineResult, NormalizedTrade, UserRiskLimits } from "./types";

export function analyseMistakes(
  trades: NormalizedTrade[],
  limits: UserRiskLimits,
  rangeDays: number,
): EngineResult {
  const detected = runDetectors(trades, limits).sort((a, b) => {
    // Active first, then by |impact|, then by frequency
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    const impact = Math.abs(b.impact_r) - Math.abs(a.impact_r);
    if (Math.abs(impact) > 0.01) return impact;
    return b.frequency - a.frequency;
  });

  const active = detected.filter((d) => !d.resolved);
  const totalImpact = active.reduce((s, d) => s + d.impact_r, 0);
  const top = active[0] ?? null;
  const improving = active.filter((d) => d.trend === "improving").length;
  const resolved = detected.filter((d) => d.resolved).length;

  return {
    range_days: rangeDays,
    total_trades: trades.length,
    closed_trades: trades.filter((t) => t.status === "closed").length,
    detected,
    insights: buildInsights(detected, trades),
    totals: {
      total_impact_r: Math.round(totalImpact * 100) / 100,
      top_kind: top?.kind ?? null,
      top_kind_impact_r: top?.impact_r ?? 0,
      resolved_count: resolved,
      improving_count: improving,
    },
  };
}

export * from "./types";
export { RULES } from "./rules";
