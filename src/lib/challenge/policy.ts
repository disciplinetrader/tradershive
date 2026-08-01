/**
 * Phase 9 · pre-execution challenge policy.
 *
 * This is a POLICY layer, not an execution change: the canonical engine keeps
 * no challenge formulas. Order services ask this whether an intent may
 * proceed. Risk-reducing intents (close, reduce, tighten stop) are always
 * allowed — a failed challenge must never trap a trader in a position.
 */

import type { ChallengeEvaluation } from "./evaluator";
import { isInstrumentAllowed } from "./evaluator";
import { RULE_IDS, type ChallengeTemplate, type RuleId } from "./model";

export type IntentKind = "open" | "increase" | "reduce" | "close" | "tighten_stop" | "widen_stop";

export interface OrderIntent {
  kind: IntentKind;
  symbol: string;
  /** Account-currency risk this intent would add; null when unknown. */
  riskAmount: number | null;
  /** Risk already open across the account, excluding this intent. */
  openRiskAmount: number;
  openPositions: number;
}

export interface PolicyDecision {
  allowed: boolean;
  ruleId: RuleId | null;
  reason: string;
}

const RISK_REDUCING: IntentKind[] = ["reduce", "close", "tighten_stop"];

const ALLOW: PolicyDecision = { allowed: true, ruleId: null, reason: "" };

export function checkChallengePolicy(input: {
  template: ChallengeTemplate;
  evaluation: ChallengeEvaluation;
  intent: OrderIntent;
}): PolicyDecision {
  const { template, evaluation, intent } = input;

  // Always let a trader get flat or smaller.
  if (RISK_REDUCING.includes(intent.kind)) return ALLOW;

  if (evaluation.status === "failed") {
    return {
      allowed: false,
      ruleId: evaluation.violations[0]?.ruleId ?? null,
      reason: "This challenge has failed. You can still close or reduce existing positions.",
    };
  }
  if (evaluation.status === "passed" || evaluation.status === "completed") {
    return { allowed: false, ruleId: null, reason: "This challenge is finished — start a new one to keep trading it." };
  }

  if (!isInstrumentAllowed(template, intent.symbol)) {
    return { allowed: false, ruleId: RULE_IDS.instruments, reason: `${intent.symbol} is not allowed in this challenge.` };
  }

  const start = template.startingBalance;

  if (template.maxRiskPerTradePct != null && intent.riskAmount != null && start > 0) {
    const pct = (intent.riskAmount / start) * 100;
    if (pct > template.maxRiskPerTradePct + 1e-9) {
      return {
        allowed: false,
        ruleId: RULE_IDS.riskPerTrade,
        reason: `Risk ${pct.toFixed(2)}% exceeds the ${template.maxRiskPerTradePct}% per-trade limit.`,
      };
    }
  }

  if (template.maxOpenRiskPct != null && intent.riskAmount != null && start > 0) {
    const pct = ((intent.openRiskAmount + intent.riskAmount) / start) * 100;
    if (pct > template.maxOpenRiskPct + 1e-9) {
      return {
        allowed: false,
        ruleId: RULE_IDS.openRisk,
        reason: `Open risk would reach ${pct.toFixed(2)}%, above the ${template.maxOpenRiskPct}% cap.`,
      };
    }
  }

  if (template.maxOpenPositions != null && intent.kind === "open" && intent.openPositions >= template.maxOpenPositions) {
    return {
      allowed: false,
      ruleId: RULE_IDS.openPositions,
      reason: `You already hold the maximum of ${template.maxOpenPositions} position(s).`,
    };
  }

  const dailyLoss = evaluation.rules.find((r) => r.ruleId === RULE_IDS.dailyLoss);
  if (dailyLoss?.status === "fail") {
    return { allowed: false, ruleId: RULE_IDS.dailyLoss, reason: "Daily loss limit reached — no new risk today." };
  }

  return ALLOW;
}
