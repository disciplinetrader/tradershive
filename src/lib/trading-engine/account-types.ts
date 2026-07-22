/**
 * Account types — Phase 2.
 *
 * Presets that combine a broker profile, risk settings, and an account
 * lifecycle policy (challenge rules, funded-account payouts, etc.). These
 * plug straight into `AccountConfig` used by the core engine.
 */

import type { AccountConfig } from "./types";
import { BROKER_PROFILES, type BrokerProfileId } from "./broker-profiles";

export type AccountKind = "demo" | "paper" | "challenge" | "funded" | "live_sim";

export type AccountTypeSpec = {
  kind: AccountKind;
  label: string;
  description: string;
  broker: BrokerProfileId;
  startingBalance: number;
  currency: string;
  maxTradeRiskPct: number;
  maxDailyRiskPct: number;
  maxOpenPositions: number;
  /** Optional challenge rules — enforced by callers, engine reads for display. */
  rules?: {
    profitTargetPct?: number;
    maxDailyDrawdownPct?: number;
    maxTotalDrawdownPct?: number;
    minTradingDays?: number;
    weekendHoldAllowed?: boolean;
  };
};

export const ACCOUNT_TYPES: Record<AccountKind, AccountTypeSpec> = {
  demo: {
    kind: "demo", label: "Demo",
    description: "Unrestricted sandbox for learning the platform.",
    broker: "retail_forex", startingBalance: 10_000, currency: "USD",
    maxTradeRiskPct: 5, maxDailyRiskPct: 20, maxOpenPositions: 20,
  },
  paper: {
    kind: "paper", label: "Paper Trading",
    description: "Realistic broker simulation with real market data.",
    broker: "retail_forex", startingBalance: 10_000, currency: "USD",
    maxTradeRiskPct: 2, maxDailyRiskPct: 5, maxOpenPositions: 15,
  },
  challenge: {
    kind: "challenge", label: "Prop Firm Challenge",
    description: "Two-step evaluation. Fail on daily / total drawdown breach.",
    broker: "prop_firm", startingBalance: 100_000, currency: "USD",
    maxTradeRiskPct: 2, maxDailyRiskPct: 5, maxOpenPositions: 10,
    rules: { profitTargetPct: 8, maxDailyDrawdownPct: 5, maxTotalDrawdownPct: 10, minTradingDays: 5, weekendHoldAllowed: false },
  },
  funded: {
    kind: "funded", label: "Funded Account",
    description: "Live capital simulation. Softer targets, strict drawdown.",
    broker: "prop_firm", startingBalance: 100_000, currency: "USD",
    maxTradeRiskPct: 1, maxDailyRiskPct: 4, maxOpenPositions: 10,
    rules: { maxDailyDrawdownPct: 5, maxTotalDrawdownPct: 8, weekendHoldAllowed: true },
  },
  live_sim: {
    kind: "live_sim", label: "Live Simulation",
    description: "Mirrors institutional broker with realistic latency and slippage.",
    broker: "institutional", startingBalance: 250_000, currency: "USD",
    maxTradeRiskPct: 1, maxDailyRiskPct: 3, maxOpenPositions: 30,
  },
};

/** Materialize an `AccountConfig` from a preset for the core engine. */
export function accountConfigFor(kind: AccountKind): AccountConfig {
  const spec = ACCOUNT_TYPES[kind];
  const broker = BROKER_PROFILES[spec.broker];
  return {
    starting_balance: spec.startingBalance,
    currency: spec.currency,
    leverage: broker.defaultLeverage,
    margin_call_level: broker.marginCallPct,
    stop_out_level: broker.stopOutPct,
    negative_balance_protection: broker.negativeBalanceProtection,
    max_trade_risk_pct: spec.maxTradeRiskPct,
    max_daily_risk_pct: spec.maxDailyRiskPct,
    max_open_positions: spec.maxOpenPositions,
    cost_profile: spec.broker === "prop_firm" ? "prop_firm"
      : spec.broker === "crypto_exchange" ? "crypto_spot"
      : spec.broker === "zero_cost" ? "zero"
      : "retail_forex",
    leverage_profile: spec.broker === "prop_firm" ? "prop"
      : spec.broker === "crypto_exchange" ? "crypto"
      : spec.broker === "institutional" ? "institutional"
      : "retail",
  };
}
