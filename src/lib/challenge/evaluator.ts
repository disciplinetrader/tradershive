/**
 * Phase 9 · THE canonical challenge rule evaluator.
 *
 * One path, one answer. UI components must never recompute challenge status;
 * they render what this returns. It is pure: canonical facts in, rule results
 * out. Unknown is a first-class outcome and never counts as a pass.
 */

import { dayKey } from "@/lib/analytics/periods";
import {
  RULE_IDS,
  type ChallengeTemplate,
  type RuleEnforcement,
  type RuleId,
} from "./model";

export const CHALLENGE_EVALUATOR_VERSION = "challenge_eval_v1";

export type RuleStatus = "pass" | "at_risk" | "fail" | "unknown" | "pending";

export type ChallengeStatus =
  | "active"
  | "at_risk"
  | "passed"
  | "failed"
  | "completed"
  | "abandoned"
  | "data_unavailable";

/** A single point on the canonical account equity curve. */
export interface EquityPoint {
  t: number;
  equity: number;
}

export interface EvaluatorTrade {
  id: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  netPnl: number;
  /** Account-currency risk; null when sizing is unknown. */
  riskAmount: number | null;
}

export interface OpenPositionFact {
  id: string;
  symbol: string;
  riskAmount: number | null;
  openedAt: number;
}

export interface ChallengeFacts {
  startingBalance: number;
  /** Canonical equity curve — required for any drawdown/daily-loss rule. */
  equityPoints: EquityPoint[];
  closedTrades: EvaluatorTrade[];
  openPositions: OpenPositionFact[];
  pendingOrders: number;
  now: number;
  /** Overrides the template timezone when the account defines its own. */
  timezone?: string;
}

export interface RuleResult {
  ruleId: RuleId;
  ruleVersion: number;
  label: string;
  status: RuleStatus;
  enforcement: RuleEnforcement;
  currentValue: number | null;
  limit: number | null;
  remaining: number | null;
  evidence: string;
  unknownReason?: string;
  evaluatedAt: number;
}

export interface ChallengeEvaluation {
  evaluatorVersion: string;
  templateVersion: number;
  status: ChallengeStatus;
  rules: RuleResult[];
  violations: RuleResult[];
  progress: {
    equity: number | null;
    balanceChangePct: number | null;
    profitTargetPct: number | null;
    tradingDays: number;
    peakEquity: number | null;
    worstDrawdownPct: number | null;
  };
  evaluatedAt: number;
}

function unknown(
  ruleId: RuleId,
  label: string,
  enforcement: RuleEnforcement,
  reason: string,
  now: number,
  limit: number | null,
): RuleResult {
  return {
    ruleId,
    ruleVersion: 1,
    label,
    status: "unknown",
    enforcement,
    currentValue: null,
    limit,
    remaining: null,
    evidence: reason,
    unknownReason: reason,
    evaluatedAt: now,
  };
}

export function evaluateChallenge(
  template: ChallengeTemplate,
  facts: ChallengeFacts,
): ChallengeEvaluation {
  const now = facts.now;
  const tz = facts.timezone || template.timezone || "UTC";
  const enf = (id: RuleId): RuleEnforcement => template.enforcement[id] ?? "evaluated";
  const rules: RuleResult[] = [];

  const points = [...facts.equityPoints].sort((a, b) => a.t - b.t);
  const hasEquity = points.length > 0;
  const equity = hasEquity ? points[points.length - 1]!.equity : null;
  const start = template.startingBalance;

  let peak = start;
  let worstDdPct = 0;
  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    const anchor = template.drawdownMode === "trailing" ? peak : start;
    const ddPct = anchor > 0 ? ((anchor - p.equity) / anchor) * 100 : 0;
    if (ddPct > worstDdPct) worstDdPct = ddPct;
  }

  const tradingDayKeys = new Set(facts.closedTrades.map((t) => dayKey(t.exitTime, tz)));
  const tradingDays = tradingDayKeys.size;

  // ---- profit target -----------------------------------------------------
  if (template.profitTargetPct != null) {
    const label = `Profit target ${template.profitTargetPct}%`;
    if (equity == null) {
      rules.push(unknown(RULE_IDS.profitTarget, label, enf(RULE_IDS.profitTarget), "No account equity recorded yet.", now, template.profitTargetPct));
    } else {
      const gainPct = start > 0 ? ((equity - start) / start) * 100 : 0;
      rules.push({
        ruleId: RULE_IDS.profitTarget,
        ruleVersion: 1,
        label,
        status: gainPct >= template.profitTargetPct ? "pass" : "pending",
        enforcement: enf(RULE_IDS.profitTarget),
        currentValue: round(gainPct),
        limit: template.profitTargetPct,
        remaining: round(Math.max(0, template.profitTargetPct - gainPct)),
        evidence: `Equity ${round(equity)} vs start ${round(start)}.`,
        evaluatedAt: now,
      });
    }
  }

  // ---- max drawdown ------------------------------------------------------
  if (template.maxTotalDrawdownPct != null) {
    const label = `${template.drawdownMode === "trailing" ? "Trailing" : "Static"} max drawdown ${template.maxTotalDrawdownPct}%`;
    if (!hasEquity) {
      rules.push(unknown(RULE_IDS.maxDrawdown, label, enf(RULE_IDS.maxDrawdown), "Drawdown needs the canonical equity curve; none was recorded.", now, template.maxTotalDrawdownPct));
    } else {
      const limit = template.maxTotalDrawdownPct;
      rules.push({
        ruleId: RULE_IDS.maxDrawdown,
        ruleVersion: 1,
        label,
        status: worstDdPct >= limit ? "fail" : worstDdPct >= limit * 0.8 ? "at_risk" : "pass",
        enforcement: enf(RULE_IDS.maxDrawdown),
        currentValue: round(worstDdPct),
        limit,
        remaining: round(Math.max(0, limit - worstDdPct)),
        evidence: `Worst ${template.drawdownBasis} drawdown ${round(worstDdPct)}% (peak ${round(peak)}).`,
        evaluatedAt: now,
      });
    }
  }

  // ---- daily loss --------------------------------------------------------
  if (template.maxDailyLossPct != null) {
    const label = `Daily loss limit ${template.maxDailyLossPct}%`;
    if (!hasEquity) {
      rules.push(unknown(RULE_IDS.dailyLoss, label, enf(RULE_IDS.dailyLoss), "Daily loss needs intraday equity; none was recorded.", now, template.maxDailyLossPct));
    } else {
      const byDay = new Map<string, EquityPoint[]>();
      for (const p of points) {
        const k = dayKey(p.t, tz);
        const arr = byDay.get(k);
        if (arr) arr.push(p);
        else byDay.set(k, [p]);
      }
      let worstDayPct = 0;
      let worstDayKey: string | null = null;
      let prevClose = start;
      for (const [k, dayPoints] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        const anchor = prevClose;
        const low = Math.min(...dayPoints.map((p) => p.equity));
        const lossPct = anchor > 0 ? ((anchor - low) / anchor) * 100 : 0;
        if (lossPct > worstDayPct) {
          worstDayPct = lossPct;
          worstDayKey = k;
        }
        prevClose = dayPoints[dayPoints.length - 1]!.equity;
      }
      const limit = template.maxDailyLossPct;
      rules.push({
        ruleId: RULE_IDS.dailyLoss,
        ruleVersion: 1,
        label,
        status: worstDayPct >= limit ? "fail" : worstDayPct >= limit * 0.8 ? "at_risk" : "pass",
        enforcement: enf(RULE_IDS.dailyLoss),
        currentValue: round(worstDayPct),
        limit,
        remaining: round(Math.max(0, limit - worstDayPct)),
        evidence: worstDayKey
          ? `Worst day ${worstDayKey}: -${round(worstDayPct)}% from ${template.dailyLossBasis} (${tz}).`
          : `No completed day yet (${tz}).`,
        evaluatedAt: now,
      });
    }
  }

  // ---- trading days ------------------------------------------------------
  if (template.minTradingDays != null) {
    rules.push({
      ruleId: RULE_IDS.minTradingDays,
      ruleVersion: 1,
      label: `Minimum ${template.minTradingDays} trading days`,
      status: tradingDays >= template.minTradingDays ? "pass" : "pending",
      enforcement: enf(RULE_IDS.minTradingDays),
      currentValue: tradingDays,
      limit: template.minTradingDays,
      remaining: Math.max(0, template.minTradingDays - tradingDays),
      evidence: `${tradingDays} distinct trading day(s) in ${tz}.`,
      evaluatedAt: now,
    });
  }
  if (template.maxTradingDays != null) {
    rules.push({
      ruleId: RULE_IDS.maxTradingDays,
      ruleVersion: 1,
      label: `Maximum ${template.maxTradingDays} trading days`,
      status: tradingDays > template.maxTradingDays ? "fail" : "pass",
      enforcement: enf(RULE_IDS.maxTradingDays),
      currentValue: tradingDays,
      limit: template.maxTradingDays,
      remaining: Math.max(0, template.maxTradingDays - tradingDays),
      evidence: `${tradingDays} distinct trading day(s) in ${tz}.`,
      evaluatedAt: now,
    });
  }

  // ---- risk per trade ----------------------------------------------------
  if (template.maxRiskPerTradePct != null) {
    const limitAmount = (template.maxRiskPerTradePct / 100) * start;
    const sized = facts.closedTrades.filter((t) => t.riskAmount != null);
    const unsized = facts.closedTrades.length - sized.length;
    const worst = sized.reduce((m, t) => Math.max(m, t.riskAmount ?? 0), 0);
    const label = `Risk per trade ≤ ${template.maxRiskPerTradePct}%`;
    if (!sized.length && facts.closedTrades.length) {
      rules.push(unknown(RULE_IDS.riskPerTrade, label, enf(RULE_IDS.riskPerTrade), "No trade carried a known risk amount.", now, template.maxRiskPerTradePct));
    } else {
      const worstPct = start > 0 ? (worst / start) * 100 : 0;
      rules.push({
        ruleId: RULE_IDS.riskPerTrade,
        ruleVersion: 1,
        label,
        status: worstPct > template.maxRiskPerTradePct ? "fail" : "pass",
        enforcement: enf(RULE_IDS.riskPerTrade),
        currentValue: round(worstPct),
        limit: template.maxRiskPerTradePct,
        remaining: round(Math.max(0, template.maxRiskPerTradePct - worstPct)),
        evidence:
          `Largest risk ${round(worst)} of ${round(limitAmount)} allowed` +
          (unsized ? ` · ${unsized} trade(s) had unknown sizing and were not judged.` : "."),
        evaluatedAt: now,
      });
    }
  }

  // ---- open exposure -----------------------------------------------------
  if (template.maxOpenRiskPct != null) {
    const known = facts.openPositions.filter((p) => p.riskAmount != null);
    const label = `Open risk ≤ ${template.maxOpenRiskPct}%`;
    if (facts.openPositions.length && !known.length) {
      rules.push(unknown(RULE_IDS.openRisk, label, enf(RULE_IDS.openRisk), "Open positions have unknown risk amounts.", now, template.maxOpenRiskPct));
    } else {
      const total = known.reduce((s, p) => s + (p.riskAmount ?? 0), 0);
      const pct = start > 0 ? (total / start) * 100 : 0;
      rules.push({
        ruleId: RULE_IDS.openRisk,
        ruleVersion: 1,
        label,
        status: pct > template.maxOpenRiskPct ? "fail" : "pass",
        enforcement: enf(RULE_IDS.openRisk),
        currentValue: round(pct),
        limit: template.maxOpenRiskPct,
        remaining: round(Math.max(0, template.maxOpenRiskPct - pct)),
        evidence: `${known.length} open position(s) risking ${round(total)}.`,
        evaluatedAt: now,
      });
    }
  }

  if (template.maxOpenPositions != null) {
    const count = facts.openPositions.length;
    rules.push({
      ruleId: RULE_IDS.openPositions,
      ruleVersion: 1,
      label: `At most ${template.maxOpenPositions} open positions`,
      status: count > template.maxOpenPositions ? "fail" : "pass",
      enforcement: enf(RULE_IDS.openPositions),
      currentValue: count,
      limit: template.maxOpenPositions,
      remaining: Math.max(0, template.maxOpenPositions - count),
      evidence: `${count} position(s) open.`,
      evaluatedAt: now,
    });
  }

  // ---- instruments -------------------------------------------------------
  if (template.allowedInstruments?.length || template.restrictedInstruments.length) {
    const traded = new Set([
      ...facts.closedTrades.map((t) => t.symbol),
      ...facts.openPositions.map((p) => p.symbol),
    ]);
    const offenders = [...traded].filter((s) => !isInstrumentAllowed(template, s));
    rules.push({
      ruleId: RULE_IDS.instruments,
      ruleVersion: 1,
      label: "Instrument restrictions",
      status: offenders.length ? "fail" : "pass",
      enforcement: enf(RULE_IDS.instruments),
      currentValue: offenders.length,
      limit: 0,
      remaining: null,
      evidence: offenders.length ? `Traded outside the allowed list: ${offenders.join(", ")}.` : "All symbols allowed.",
      evaluatedAt: now,
    });
  }

  // ---- minimum hold time -------------------------------------------------
  if (template.minHoldTimeMs != null) {
    const tooFast = facts.closedTrades.filter((t) => t.exitTime - t.entryTime < template.minHoldTimeMs!);
    rules.push({
      ruleId: RULE_IDS.minHoldTime,
      ruleVersion: 1,
      label: `Minimum hold ${Math.round(template.minHoldTimeMs / 1000)}s`,
      status: tooFast.length ? "fail" : "pass",
      enforcement: enf(RULE_IDS.minHoldTime),
      currentValue: tooFast.length,
      limit: 0,
      remaining: null,
      evidence: tooFast.length ? `${tooFast.length} trade(s) closed under the minimum hold.` : "All trades held long enough.",
      evaluatedAt: now,
    });
  }

  // ---- honest non-verifiable rules --------------------------------------
  for (const [ruleId, flag, label] of [
    [RULE_IDS.weekendHolding, template.weekendHolding, "Weekend holding"] as const,
    [RULE_IDS.overnightHolding, template.overnightHolding, "Overnight holding"] as const,
  ]) {
    if (flag === false) {
      rules.push(
        unknown(ruleId, `${label} not allowed`, enf(ruleId), "TradersHIVE does not yet model session calendars for this rule.", now, null),
      );
    }
  }

  const violations = rules.filter((r) => r.status === "fail");
  const targetRule = rules.find((r) => r.ruleId === RULE_IDS.profitTarget);
  const minDaysRule = rules.find((r) => r.ruleId === RULE_IDS.minTradingDays);

  let status: ChallengeStatus;
  if (!hasEquity && (template.maxTotalDrawdownPct != null || template.maxDailyLossPct != null)) {
    status = "data_unavailable";
  } else if (violations.length) {
    status = "failed";
  } else if (targetRule?.status === "pass" && (!minDaysRule || minDaysRule.status === "pass")) {
    status = "passed";
  } else if (rules.some((r) => r.status === "at_risk")) {
    status = "at_risk";
  } else {
    status = "active";
  }

  return {
    evaluatorVersion: CHALLENGE_EVALUATOR_VERSION,
    templateVersion: template.version,
    status,
    rules,
    violations,
    progress: {
      equity: equity == null ? null : round(equity),
      balanceChangePct: equity == null || start <= 0 ? null : round(((equity - start) / start) * 100),
      profitTargetPct: template.profitTargetPct,
      tradingDays,
      peakEquity: hasEquity ? round(peak) : null,
      worstDrawdownPct: hasEquity ? round(worstDdPct) : null,
    },
    evaluatedAt: now,
  };
}

export function isInstrumentAllowed(template: ChallengeTemplate, symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (template.restrictedInstruments.some((r) => r.toUpperCase() === s)) return false;
  if (template.allowedInstruments && template.allowedInstruments.length) {
    return template.allowedInstruments.some((a) => a.toUpperCase() === s);
  }
  return true;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
