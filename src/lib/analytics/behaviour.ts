/**
 * §8 Behaviour analytics.
 *
 * Two strictly separated layers:
 *
 *   RECORDED FACTS   — what the trader actually wrote down (emotions,
 *                      mistakes, confidence, plan adherence). Reported as-is.
 *   INFERRED FLAGS   — patterns the engine deduces. Every flag carries the
 *                      rule that produced it and the evidence behind it, so a
 *                      trader can always challenge it.
 *
 * Inference never writes back to a Journal entry or a ClosedTrade.
 */

import type { AnalyticsRecord } from "./model";
import { pnlOf } from "./expectancy";

export interface CohortOutcome {
  key: string;
  count: number;
  winRate: number;
  averageR: number | null;
  netPnl: number;
}

export interface BehaviourFacts {
  /** Trades that carry any journal metadata at all. */
  journaledCount: number;
  coveragePercent: number;

  byEmotion: CohortOutcome[];
  planAdherenceRate: number | null;
  followedPlan: CohortOutcome | null;
  brokePlan: CohortOutcome | null;
  confidenceVsOutcome: { confidence: number; count: number; winRate: number; averageR: number | null }[];
  mistakeFrequency: { key: string; count: number; sharePercent: number }[];
  /** Net P/L booked on trades carrying at least one recorded mistake. */
  costOfMistakes: number | null;
  ruleViolationCount: number;
}

export type BehaviourFlagId =
  | "revenge_trading"
  | "overtrading"
  | "early_exit"
  | "late_entry"
  | "stop_widening";

export interface BehaviourFlag {
  id: BehaviourFlagId;
  label: string;
  /** Plain-language statement of the rule that fired. */
  rule: string;
  count: number;
  /** Trade ids that triggered it — the evidence. */
  tradeIds: string[];
  severity: "info" | "warn" | "high";
}

export interface BehaviourAnalytics {
  facts: BehaviourFacts;
  flags: BehaviourFlag[];
}

export interface BehaviourThresholds {
  /** A trade opened within this many minutes of a loss is revenge-suspect. */
  revengeWindowMinutes: number;
  /** Size multiple vs the prior trade required to call it revenge. */
  revengeSizeMultiple: number;
  /** Trades in one day above which the day counts as overtrading. */
  overtradingPerDay: number;
  /** Winner closed below this share of its planned R counts as an early exit. */
  earlyExitCapture: number;
}

export const DEFAULT_THRESHOLDS: BehaviourThresholds = {
  revengeWindowMinutes: 15,
  revengeSizeMultiple: 1.5,
  overtradingPerDay: 8,
  earlyExitCapture: 0.5,
};

function cohort(key: string, records: AnalyticsRecord[], excludeFees: boolean): CohortOutcome {
  const rs = records.map((r) => r.realizedR).filter((v): v is number => v != null);
  return {
    key,
    count: records.length,
    winRate: records.length ? (records.filter((r) => r.result === "win").length / records.length) * 100 : 0,
    averageR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    netPnl: records.reduce((s, r) => s + pnlOf(r, excludeFees), 0),
  };
}

export function computeBehaviour(
  records: readonly AnalyticsRecord[],
  opts: { excludeFees?: boolean; thresholds?: BehaviourThresholds } = {},
): BehaviourAnalytics {
  const excludeFees = !!opts.excludeFees;
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const list = [...records].sort((a, b) => a.entryTime - b.entryTime);

  // ── Recorded facts ────────────────────────────────────────────────────────
  const journaled = list.filter(
    (r) => r.journal.journalEntryId != null || r.journal.emotions.length > 0 || r.journal.mistakes.length > 0,
  );

  const emotionMap = new Map<string, AnalyticsRecord[]>();
  for (const r of list) {
    for (const e of r.journal.emotions) {
      const arr = emotionMap.get(e) ?? [];
      arr.push(r);
      emotionMap.set(e, arr);
    }
  }

  const planned = list.filter((r) => r.journal.followedPlan != null);
  const followed = planned.filter((r) => r.journal.followedPlan === true);
  const broke = planned.filter((r) => r.journal.followedPlan === false);

  const confidenceBuckets = new Map<number, AnalyticsRecord[]>();
  for (const r of list) {
    if (r.journal.confidence == null) continue;
    const c = Math.round(r.journal.confidence);
    const arr = confidenceBuckets.get(c) ?? [];
    arr.push(r);
    confidenceBuckets.set(c, arr);
  }

  const mistakeMap = new Map<string, number>();
  for (const r of list) for (const m of r.journal.mistakes) mistakeMap.set(m, (mistakeMap.get(m) ?? 0) + 1);
  const withMistakes = list.filter((r) => r.journal.mistakes.length > 0);

  const facts: BehaviourFacts = {
    journaledCount: journaled.length,
    coveragePercent: list.length ? (journaled.length / list.length) * 100 : 0,
    byEmotion: [...emotionMap.entries()]
      .map(([k, rs]) => cohort(k, rs, excludeFees))
      .sort((a, b) => b.count - a.count),
    planAdherenceRate: planned.length ? (followed.length / planned.length) * 100 : null,
    followedPlan: followed.length ? cohort("Followed plan", followed, excludeFees) : null,
    brokePlan: broke.length ? cohort("Broke plan", broke, excludeFees) : null,
    confidenceVsOutcome: [...confidenceBuckets.entries()]
      .map(([confidence, rs]) => {
        const c = cohort(String(confidence), rs, excludeFees);
        return { confidence, count: c.count, winRate: c.winRate, averageR: c.averageR };
      })
      .sort((a, b) => a.confidence - b.confidence),
    mistakeFrequency: [...mistakeMap.entries()]
      .map(([key, count]) => ({ key, count, sharePercent: list.length ? (count / list.length) * 100 : 0 }))
      .sort((a, b) => b.count - a.count),
    costOfMistakes: withMistakes.length
      ? withMistakes.reduce((s, r) => s + pnlOf(r, excludeFees), 0)
      : null,
    ruleViolationCount: broke.length + withMistakes.length,
  };

  // ── Inferred flags ────────────────────────────────────────────────────────
  const flags: BehaviourFlag[] = [];

  // Revenge trading: a new position opened very soon after a loss closed,
  // with materially larger risk than the trade that just lost.
  const revenge: string[] = [];
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1];
    const cur = list[i];
    if (prev.result !== "loss") continue;
    const gapMin = (cur.entryTime - prev.exitTime) / 60_000;
    if (gapMin < 0 || gapMin > t.revengeWindowMinutes) continue;
    const bigger =
      prev.riskAmount != null && cur.riskAmount != null
        ? cur.riskAmount >= prev.riskAmount * t.revengeSizeMultiple
        : false;
    if (bigger) revenge.push(cur.tradeId);
  }
  if (revenge.length) {
    flags.push({
      id: "revenge_trading",
      label: "Revenge trading",
      rule: `Opened within ${t.revengeWindowMinutes} min of a losing trade with at least ${t.revengeSizeMultiple}× the risk.`,
      count: revenge.length,
      tradeIds: revenge,
      severity: "high",
    });
  }

  // Overtrading: any calendar day (UTC anchor on exit) above the threshold.
  const perDay = new Map<string, AnalyticsRecord[]>();
  for (const r of list) {
    const k = new Date(r.exitTime).toISOString().slice(0, 10);
    const arr = perDay.get(k) ?? [];
    arr.push(r);
    perDay.set(k, arr);
  }
  const overtraded = [...perDay.values()].filter((rs) => rs.length > t.overtradingPerDay);
  if (overtraded.length) {
    flags.push({
      id: "overtrading",
      label: "Overtrading",
      rule: `More than ${t.overtradingPerDay} trades closed in a single day.`,
      count: overtraded.length,
      tradeIds: overtraded.flat().map((r) => r.tradeId),
      severity: "warn",
    });
  }

  // Early exit: a winner that captured less than half of its planned R.
  const early = list
    .filter(
      (r) =>
        r.result === "win" &&
        r.plannedR != null && r.plannedR > 0 &&
        r.realizedR != null &&
        r.realizedR < (r.plannedR as number) * t.earlyExitCapture,
    )
    .map((r) => r.tradeId);
  if (early.length) {
    flags.push({
      id: "early_exit",
      label: "Cutting winners early",
      rule: `Winning trade closed below ${Math.round(t.earlyExitCapture * 100)}% of its planned R.`,
      count: early.length,
      tradeIds: early,
      severity: "warn",
    });
  }

  // Late entry: fill materially worse than requested, i.e. adverse slippage
  // beyond a tenth of the initial risk distance.
  const late = list
    .filter((r) => {
      if (r.slippage == null || r.fillPrice == null || r.initialStop == null) return false;
      const risk = Math.abs(r.fillPrice - r.initialStop);
      return risk > 0 && Math.abs(r.slippage) > risk * 0.1;
    })
    .map((r) => r.tradeId);
  if (late.length) {
    flags.push({
      id: "late_entry",
      label: "Chasing entries",
      rule: "Entry slippage exceeded 10% of the initial risk distance.",
      count: late.length,
      tradeIds: late,
      severity: "info",
    });
  }

  // Stop widening: the final stop sat further from entry than the initial one.
  const widened = list
    .filter((r) => {
      if (r.fillPrice == null || r.initialStop == null || r.finalStop == null) return false;
      return Math.abs(r.fillPrice - r.finalStop) > Math.abs(r.fillPrice - r.initialStop) + 1e-9;
    })
    .map((r) => r.tradeId);
  if (widened.length) {
    flags.push({
      id: "stop_widening",
      label: "Widening stops",
      rule: "Final stop was further from entry than the stop the trade was sized against.",
      count: widened.length,
      tradeIds: widened,
      severity: "high",
    });
  }

  return { facts, flags };
}
