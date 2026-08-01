/**
 * Phase 9 · drill evaluation.
 *
 * Pure. Consumes canonical ClosedTrade-derived facts and a versioned drill
 * template, and returns objective results, violations and a score. Nothing
 * subjective is silently scored: reflection objectives return "unknown"
 * unless the trader answered them.
 */

import type { DrillTemplate } from "./drills";

export type ObjectiveStatus = "met" | "missed" | "unknown";

/** Canonical facts, already derived from ClosedTrades + order history. */
export interface DrillTrade {
  id: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  netPnl: number;
  riskAmount: number | null;
  initialStop: number | null;
  finalStop: number | null;
  initialTarget: number | null;
  closeReason: string;
  /** Stop/target/partial changes recorded after the fill. */
  managedAfterEntry: boolean;
  /** True when the final stop sits further from entry than the initial stop. */
  stopWidened: boolean;
  direction: "long" | "short";
}

export interface DrillFacts {
  startingBalance: number;
  trades: DrillTrade[];
  /** Answers to reflection objectives, keyed by objective id. */
  reflections?: Record<string, boolean>;
}

export interface ObjectiveResult {
  id: string;
  label: string;
  kind: "objective" | "reflection";
  status: ObjectiveStatus;
  weight: number;
  evidence: string;
}

export interface DrillViolation {
  ruleId: string;
  message: string;
  evidence: string;
}

export interface DrillResult {
  drillId: string;
  drillVersion: number;
  scoreVersion: string;
  objectives: ObjectiveResult[];
  violations: DrillViolation[];
  /** 0–100, or null when nothing objective could be measured. */
  score: number | null;
  completed: boolean;
  failed: boolean;
  sampleSize: number;
  evaluatedAt: number;
}

export function evaluateDrill(drill: DrillTemplate, facts: DrillFacts, now = Date.now()): DrillResult {
  const trades = facts.trades;
  const n = trades.length;
  const violations: DrillViolation[] = [];
  const r = drill.rules;

  if (r.maxTrades != null && n > r.maxTrades) {
    violations.push({
      ruleId: "max_trades",
      message: `Took ${n} trades; the drill allows ${r.maxTrades}.`,
      evidence: trades.slice(r.maxTrades).map((t) => t.id).join(", "),
    });
  }
  if (r.maxRiskPctPerTrade != null && facts.startingBalance > 0) {
    const limit = (r.maxRiskPctPerTrade / 100) * facts.startingBalance;
    const over = trades.filter((t) => t.riskAmount != null && t.riskAmount > limit + 1e-9);
    if (over.length) {
      violations.push({
        ruleId: "risk_per_trade",
        message: `${over.length} trade(s) risked more than ${r.maxRiskPctPerTrade}%.`,
        evidence: over.map((t) => t.id).join(", "),
      });
    }
  }
  if (r.stopRequiredBeforeEntry) {
    const missing = trades.filter((t) => t.initialStop == null);
    if (missing.length) {
      violations.push({
        ruleId: "stop_required",
        message: `${missing.length} trade(s) had no stop at fill.`,
        evidence: missing.map((t) => t.id).join(", "),
      });
    }
  }
  if (r.targetRequiredBeforeEntry) {
    const missing = trades.filter((t) => t.initialTarget == null);
    if (missing.length) {
      violations.push({
        ruleId: "target_required",
        message: `${missing.length} trade(s) had no target at fill.`,
        evidence: missing.map((t) => t.id).join(", "),
      });
    }
  }
  if (r.stopWideningForbidden) {
    const widened = trades.filter((t) => t.stopWidened);
    if (widened.length) {
      violations.push({
        ruleId: "stop_widened",
        message: `${widened.length} stop(s) were widened.`,
        evidence: widened.map((t) => t.id).join(", "),
      });
    }
  }
  if (r.dailyLossPct != null && facts.startingBalance > 0) {
    const loss = trades.reduce((s, t) => s + Math.min(0, t.netPnl), 0);
    const limit = (r.dailyLossPct / 100) * facts.startingBalance;
    if (Math.abs(loss) > limit + 1e-9) {
      violations.push({
        ruleId: "daily_loss",
        message: `Losses of ${Math.abs(loss).toFixed(2)} exceeded the ${r.dailyLossPct}% limit.`,
        evidence: `limit ${limit.toFixed(2)}`,
      });
    }
  }

  const objectives = drill.objectives.map<ObjectiveResult>((o) => {
    if (o.kind === "reflection") {
      const answer = facts.reflections?.[o.id];
      return {
        id: o.id,
        label: o.label,
        kind: o.kind,
        weight: o.weight,
        status: answer == null ? "unknown" : answer ? "met" : "missed",
        evidence: answer == null ? "Not answered in review." : "Trader-reported.",
      };
    }
    return { ...objectiveOutcome(o.id, drill, facts), id: o.id, label: o.label, kind: o.kind, weight: o.weight };
  });

  const scored = objectives.filter((o) => o.status !== "unknown");
  const totalWeight = scored.reduce((s, o) => s + o.weight, 0);
  const metWeight = scored.filter((o) => o.status === "met").reduce((s, o) => s + o.weight, 0);
  const score = totalWeight > 0 ? Math.round((metWeight / totalWeight) * 100) : null;

  const minTrades = r.minTrades ?? 0;
  const enoughTrades = n >= minTrades;
  const failed = violations.length > 0;

  return {
    drillId: drill.id,
    drillVersion: drill.version,
    scoreVersion: drill.scoreVersion,
    objectives,
    violations,
    score,
    completed: enoughTrades && !failed,
    failed,
    sampleSize: n,
    evaluatedAt: now,
  };
}

function objectiveOutcome(
  id: string,
  drill: DrillTemplate,
  facts: DrillFacts,
): { status: ObjectiveStatus; evidence: string } {
  const trades = facts.trades;
  if (!trades.length) return { status: "unknown", evidence: "No trades were taken." };

  switch (id) {
    case "trade_count": {
      const max = drill.rules.maxTrades;
      if (max == null) return { status: "unknown", evidence: "No trade cap defined." };
      return trades.length <= max
        ? { status: "met", evidence: `${trades.length} entr(ies) of ${max} allowed.` }
        : { status: "missed", evidence: `${trades.length} entries; ${max} allowed.` };
    }
    case "stop_defined": {
      const missing = trades.filter((t) => t.initialStop == null).length;
      return missing
        ? { status: "missed", evidence: `${missing} trade(s) without a stop.` }
        : { status: "met", evidence: "Every trade had a stop at fill." };
    }
    case "target_defined": {
      const missing = trades.filter((t) => t.initialTarget == null).length;
      return missing
        ? { status: "missed", evidence: `${missing} trade(s) without a target.` }
        : { status: "met", evidence: "Every trade had a target at fill." };
    }
    case "no_widening": {
      const widened = trades.filter((t) => t.stopWidened).length;
      return widened
        ? { status: "missed", evidence: `${widened} stop(s) widened.` }
        : { status: "met", evidence: "No stop was widened." };
    }
    case "no_early_exit": {
      const manual = trades.filter((t) => t.closeReason === "manual").length;
      return manual
        ? { status: "missed", evidence: `${manual} trade(s) closed manually before stop or target.` }
        : { status: "met", evidence: "Every trade ran to stop or target." };
    }
    case "risk_cap": {
      const limitPct = drill.rules.maxRiskPctPerTrade;
      if (limitPct == null || facts.startingBalance <= 0) return { status: "unknown", evidence: "No risk cap defined." };
      const known = trades.filter((t) => t.riskAmount != null);
      if (!known.length) return { status: "unknown", evidence: "No trade carried a known risk amount." };
      const limit = (limitPct / 100) * facts.startingBalance;
      const over = known.filter((t) => (t.riskAmount ?? 0) > limit + 1e-9).length;
      return over
        ? { status: "missed", evidence: `${over} trade(s) above ${limitPct}%.` }
        : { status: "met", evidence: `All ${known.length} sized trade(s) within ${limitPct}%.` };
    }
    case "loss_limit": {
      const pct = drill.rules.dailyLossPct;
      if (pct == null || facts.startingBalance <= 0) return { status: "unknown", evidence: "No daily limit defined." };
      const loss = Math.abs(trades.reduce((s, t) => s + Math.min(0, t.netPnl), 0));
      const limit = (pct / 100) * facts.startingBalance;
      return loss > limit + 1e-9
        ? { status: "missed", evidence: `Lost ${loss.toFixed(2)} against a ${limit.toFixed(2)} limit.` }
        : { status: "met", evidence: `Stayed within the ${pct}% daily limit.` };
    }
    case "managed": {
      const managed = trades.filter((t) => t.managedAfterEntry).length;
      return managed
        ? { status: "met", evidence: `${managed} trade(s) actively managed.` }
        : { status: "missed", evidence: "No trade was managed after entry." };
    }
    default:
      return { status: "unknown", evidence: "No evaluator for this objective." };
  }
}
