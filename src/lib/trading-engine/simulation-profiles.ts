/**
 * Simulation Profiles — Phase 3.
 *
 * A Simulation Profile is a *user-facing* preset that bundles a broker
 * profile with recommended defaults (balance, leverage, risk caps) tuned
 * for a specific trading style. Profiles are additive — they compose
 * existing broker/leverage/cost profiles rather than replacing them.
 *
 * Consumers (Trading Workspace, Replay Studio, Championships) instantiate
 * simulation accounts from these presets; the underlying engine still
 * enforces every math invariant.
 */

import type { AccountConfig } from "./types";
import { BROKER_PROFILES, type BrokerProfileId } from "./broker-profiles";
import { ACCOUNT_TYPES, type AccountKind, accountConfigFor } from "./account-types";

export type SimulationProfileId =
  | "retail_forex"
  | "prop_firm_challenge"
  | "prop_firm_funded"
  | "crypto_futures"
  | "crypto_spot"
  | "stock_trading"
  | "swing_trading"
  | "scalping"
  | "championship"
  | "custom";

export type SimulationProfile = {
  id: SimulationProfileId;
  label: string;
  description: string;
  broker: BrokerProfileId;
  accountKind: AccountKind;
  defaultBalance: number;
  currency: string;
  defaultLeverage: number;
  /** Recommended per-trade risk %, engine still hard-caps at HARD_RISK_CAP_PCT. */
  riskPerTradePct: number;
  /** Recommended daily loss cap %. */
  dailyRiskPct: number;
  maxOpenPositions: number;
  stopOutPct: number;
  marginCallPct: number;
  negativeBalanceProtection: boolean;
  /** Style hints — consumed by UI copy, not by the engine. */
  style: "day" | "swing" | "scalp" | "position" | "mixed";
  timeframeHint: string;
};

export const SIMULATION_PROFILES: Record<SimulationProfileId, SimulationProfile> = {
  retail_forex: {
    id: "retail_forex", label: "Retail Forex",
    description: "ESMA-style 30:1 leverage with realistic spreads and swap.",
    broker: "retail_forex", accountKind: "paper",
    defaultBalance: 10_000, currency: "USD", defaultLeverage: 30,
    riskPerTradePct: 1, dailyRiskPct: 5, maxOpenPositions: 15,
    stopOutPct: 50, marginCallPct: 100, negativeBalanceProtection: true,
    style: "day", timeframeHint: "M15 – H4",
  },
  prop_firm_challenge: {
    id: "prop_firm_challenge", label: "Prop Firm Challenge",
    description: "$100k evaluation with 5% daily / 10% total drawdown and 8% profit target.",
    broker: "prop_firm", accountKind: "challenge",
    defaultBalance: 100_000, currency: "USD", defaultLeverage: 100,
    riskPerTradePct: 1, dailyRiskPct: 4, maxOpenPositions: 10,
    stopOutPct: 30, marginCallPct: 100, negativeBalanceProtection: true,
    style: "day", timeframeHint: "M5 – H1",
  },
  prop_firm_funded: {
    id: "prop_firm_funded", label: "Funded Account",
    description: "Post-evaluation funded simulation with tighter risk and weekend holds.",
    broker: "prop_firm", accountKind: "funded",
    defaultBalance: 100_000, currency: "USD", defaultLeverage: 100,
    riskPerTradePct: 0.5, dailyRiskPct: 3, maxOpenPositions: 10,
    stopOutPct: 30, marginCallPct: 100, negativeBalanceProtection: true,
    style: "swing", timeframeHint: "H1 – D1",
  },
  crypto_futures: {
    id: "crypto_futures", label: "Crypto Futures",
    description: "24/7 perpetual futures at 20:1 with isolated liquidation.",
    broker: "crypto_exchange", accountKind: "paper",
    defaultBalance: 5_000, currency: "USDT", defaultLeverage: 20,
    riskPerTradePct: 1.5, dailyRiskPct: 6, maxOpenPositions: 8,
    stopOutPct: 80, marginCallPct: 110, negativeBalanceProtection: false,
    style: "day", timeframeHint: "M5 – H4",
  },
  crypto_spot: {
    id: "crypto_spot", label: "Crypto Spot",
    description: "1:1 spot exchange, 0.10% taker fees, no liquidation risk.",
    broker: "crypto_exchange", accountKind: "paper",
    defaultBalance: 5_000, currency: "USDT", defaultLeverage: 1,
    riskPerTradePct: 3, dailyRiskPct: 10, maxOpenPositions: 20,
    stopOutPct: 100, marginCallPct: 100, negativeBalanceProtection: true,
    style: "position", timeframeHint: "H4 – W1",
  },
  stock_trading: {
    id: "stock_trading", label: "Stock Trading",
    description: "US equities with 2:1 overnight margin and regular-session hours.",
    broker: "stock_broker", accountKind: "paper",
    defaultBalance: 25_000, currency: "USD", defaultLeverage: 2,
    riskPerTradePct: 1, dailyRiskPct: 4, maxOpenPositions: 20,
    stopOutPct: 25, marginCallPct: 100, negativeBalanceProtection: true,
    style: "swing", timeframeHint: "H1 – D1",
  },
  swing_trading: {
    id: "swing_trading", label: "Swing Trading",
    description: "Multi-day holds with reduced leverage and wider stops.",
    broker: "retail_forex", accountKind: "paper",
    defaultBalance: 25_000, currency: "USD", defaultLeverage: 10,
    riskPerTradePct: 0.75, dailyRiskPct: 3, maxOpenPositions: 6,
    stopOutPct: 50, marginCallPct: 100, negativeBalanceProtection: true,
    style: "swing", timeframeHint: "H4 – D1",
  },
  scalping: {
    id: "scalping", label: "Scalping",
    description: "Tight spreads, high leverage, low execution delay for M1–M5.",
    broker: "prop_firm", accountKind: "paper",
    defaultBalance: 25_000, currency: "USD", defaultLeverage: 100,
    riskPerTradePct: 0.5, dailyRiskPct: 3, maxOpenPositions: 4,
    stopOutPct: 30, marginCallPct: 100, negativeBalanceProtection: true,
    style: "scalp", timeframeHint: "M1 – M15",
  },
  championship: {
    id: "championship", label: "Championship",
    description: "Zero-cost sandbox for tournaments — all players equal.",
    broker: "zero_cost", accountKind: "demo",
    defaultBalance: 10_000, currency: "USD", defaultLeverage: 100,
    riskPerTradePct: 2, dailyRiskPct: 10, maxOpenPositions: 20,
    stopOutPct: 20, marginCallPct: 100, negativeBalanceProtection: true,
    style: "mixed", timeframeHint: "any",
  },
  custom: {
    id: "custom", label: "Custom",
    description: "User-defined simulation. All parameters editable.",
    broker: "retail_forex", accountKind: "paper",
    defaultBalance: 10_000, currency: "USD", defaultLeverage: 30,
    riskPerTradePct: 1, dailyRiskPct: 5, maxOpenPositions: 15,
    stopOutPct: 50, marginCallPct: 100, negativeBalanceProtection: true,
    style: "mixed", timeframeHint: "any",
  },
};

export function getSimulationProfile(id: SimulationProfileId): SimulationProfile {
  return SIMULATION_PROFILES[id];
}

export function listSimulationProfiles(): SimulationProfile[] {
  return Object.values(SIMULATION_PROFILES);
}

/**
 * Materialize an engine `AccountConfig` from a simulation profile plus
 * optional user overrides (starting balance, leverage, risk caps).
 */
export function accountConfigFromProfile(
  id: SimulationProfileId,
  overrides: Partial<{
    startingBalance: number;
    currency: string;
    leverage: number;
    riskPerTradePct: number;
    dailyRiskPct: number;
    maxOpenPositions: number;
  }> = {},
): AccountConfig {
  const profile = SIMULATION_PROFILES[id];
  const base = accountConfigFor(profile.accountKind);
  const broker = BROKER_PROFILES[profile.broker];
  const _account = ACCOUNT_TYPES[profile.accountKind]; // referenced for symmetry
  void _account;
  return {
    ...base,
    starting_balance: overrides.startingBalance ?? profile.defaultBalance,
    currency: overrides.currency ?? profile.currency,
    leverage: Math.max(1, overrides.leverage ?? profile.defaultLeverage),
    margin_call_level: profile.marginCallPct,
    stop_out_level: profile.stopOutPct,
    negative_balance_protection: profile.negativeBalanceProtection,
    max_trade_risk_pct: overrides.riskPerTradePct ?? profile.riskPerTradePct,
    max_daily_risk_pct: overrides.dailyRiskPct ?? profile.dailyRiskPct,
    max_open_positions: overrides.maxOpenPositions ?? profile.maxOpenPositions,
    cost_profile:
      broker.id === "prop_firm" ? "prop_firm" :
      broker.id === "crypto_exchange" ? "crypto_spot" :
      broker.id === "zero_cost" ? "zero" :
      "retail_forex",
    leverage_profile:
      broker.id === "prop_firm" ? "prop" :
      broker.id === "crypto_exchange" ? "crypto" :
      broker.id === "institutional" ? "institutional" :
      "retail",
  };
}
