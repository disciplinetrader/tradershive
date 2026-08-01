/**
 * Phase 9 · canonical challenge template model.
 *
 * A template is a pure, versioned rule set. It carries no state and no
 * account facts — the evaluator (`./evaluator`) consumes canonical account
 * and trade facts and produces status. Every rule declares how strongly the
 * platform can stand behind it so the UI never implies enforcement we do
 * not actually have.
 */

export const CHALLENGE_TEMPLATE_VERSION = 1;

/** How much the platform can actually guarantee about a rule. */
export type RuleEnforcement =
  /** Blocked before execution by the policy layer. */
  | "enforced"
  /** Measured from canonical facts after the fact. */
  | "evaluated"
  /** Depends on the trader telling us. */
  | "user_reported"
  /** We do not currently hold the data required. */
  | "not_verifiable";

export type ChallengeType =
  | "personal"
  | "risk"
  | "consistency"
  | "playbook"
  | "practice_streak"
  | "prop_simulation"
  | "coach_assigned";

export type DrawdownMode = "static" | "trailing";
export type DrawdownBasis = "balance" | "equity";
export type DailyLossBasis = "start_of_day_balance" | "start_of_day_equity";

export interface ChallengePhase {
  index: number;
  name: string;
  profitTargetPct: number | null;
  minTradingDays: number | null;
  maxTradingDays: number | null;
}

export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  version: number;
  challengeType: ChallengeType;
  /** Explicit — never inferred from the account. */
  startingBalance: number;
  timezone: string;

  profitTargetPct: number | null;
  maxTotalDrawdownPct: number | null;
  drawdownMode: DrawdownMode;
  drawdownBasis: DrawdownBasis;
  maxDailyLossPct: number | null;
  dailyLossBasis: DailyLossBasis;

  minTradingDays: number | null;
  maxTradingDays: number | null;
  maxRiskPerTradePct: number | null;
  maxOpenRiskPct: number | null;
  maxOpenPositions: number | null;

  allowedInstruments: string[] | null;
  restrictedInstruments: string[];
  minHoldTimeMs: number | null;

  weekendHolding: boolean | null;
  overnightHolding: boolean | null;

  phases: ChallengePhase[];
  /** ruleId → what we can honestly claim about it. */
  enforcement: Record<string, RuleEnforcement>;
}

export const RULE_IDS = {
  profitTarget: "profit_target",
  maxDrawdown: "max_drawdown",
  dailyLoss: "daily_loss",
  minTradingDays: "min_trading_days",
  maxTradingDays: "max_trading_days",
  riskPerTrade: "risk_per_trade",
  openRisk: "open_risk",
  openPositions: "open_positions",
  instruments: "instruments",
  minHoldTime: "min_hold_time",
  weekendHolding: "weekend_holding",
  overnightHolding: "overnight_holding",
} as const;

export type RuleId = (typeof RULE_IDS)[keyof typeof RULE_IDS];

export const DEFAULT_ENFORCEMENT: Record<string, RuleEnforcement> = {
  [RULE_IDS.profitTarget]: "evaluated",
  [RULE_IDS.maxDrawdown]: "evaluated",
  [RULE_IDS.dailyLoss]: "evaluated",
  [RULE_IDS.minTradingDays]: "evaluated",
  [RULE_IDS.maxTradingDays]: "evaluated",
  [RULE_IDS.riskPerTrade]: "enforced",
  [RULE_IDS.openRisk]: "enforced",
  [RULE_IDS.openPositions]: "enforced",
  [RULE_IDS.instruments]: "enforced",
  [RULE_IDS.minHoldTime]: "evaluated",
  // Simulated sessions do not model swap/roll or exchange calendars yet.
  [RULE_IDS.weekendHolding]: "not_verifiable",
  [RULE_IDS.overnightHolding]: "not_verifiable",
};

export function makeTemplate(patch: Partial<ChallengeTemplate> & { id: string; name: string }): ChallengeTemplate {
  return {
    description: "",
    version: CHALLENGE_TEMPLATE_VERSION,
    challengeType: "personal",
    startingBalance: 10_000,
    timezone: "UTC",
    profitTargetPct: null,
    maxTotalDrawdownPct: null,
    drawdownMode: "static",
    drawdownBasis: "equity",
    maxDailyLossPct: null,
    dailyLossBasis: "start_of_day_equity",
    minTradingDays: null,
    maxTradingDays: null,
    maxRiskPerTradePct: null,
    maxOpenRiskPct: null,
    maxOpenPositions: null,
    allowedInstruments: null,
    restrictedInstruments: [],
    minHoldTimeMs: null,
    weekendHolding: null,
    overnightHolding: null,
    phases: [],
    enforcement: DEFAULT_ENFORCEMENT,
    ...patch,
  };
}

/**
 * Built-in starting points. These are TradersHIVE simulation templates —
 * they are not any real prop firm's rule set, and nothing here syncs with a
 * broker.
 */
export const BUILT_IN_TEMPLATES: ChallengeTemplate[] = [
  makeTemplate({
    id: "discipline_v1",
    name: "30-day discipline challenge",
    description: "Stay inside a fixed risk budget for a month. Simulated, personal.",
    challengeType: "personal",
    maxDailyLossPct: 2,
    maxTotalDrawdownPct: 6,
    maxRiskPerTradePct: 1,
    minTradingDays: 10,
    maxTradingDays: 30,
  }),
  makeTemplate({
    id: "risk_v1",
    name: "Risk control challenge",
    description: "Every trade sized at or below 0.5% with at most two concurrent positions.",
    challengeType: "risk",
    maxRiskPerTradePct: 0.5,
    maxOpenRiskPct: 1,
    maxOpenPositions: 2,
    maxDailyLossPct: 1.5,
  }),
  makeTemplate({
    id: "prop_sim_two_phase_v1",
    name: "Two-phase evaluation (simulated)",
    description:
      "A generic two-phase evaluation shape. Rules are user-configurable; TradersHIVE does not replicate any specific firm.",
    challengeType: "prop_simulation",
    startingBalance: 100_000,
    profitTargetPct: 8,
    maxDailyLossPct: 5,
    maxTotalDrawdownPct: 10,
    drawdownMode: "trailing",
    minTradingDays: 5,
    maxTradingDays: 30,
    phases: [
      { index: 0, name: "Evaluation", profitTargetPct: 8, minTradingDays: 5, maxTradingDays: 30 },
      { index: 1, name: "Verification", profitTargetPct: 5, minTradingDays: 5, maxTradingDays: 60 },
    ],
  }),
];

export function findBuiltInTemplate(id: string): ChallengeTemplate | null {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? null;
}
