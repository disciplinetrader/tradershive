/**
 * Broker Profiles — Phase 2.
 *
 * Each profile bundles: default leverage, margin/stop-out rules, spread and
 * commission overrides per asset class, swap policy, trading-hours policy,
 * execution delay, slippage envelope, and the set of asset classes it
 * supports. Accounts pick a broker profile at creation; the Trading Engine
 * consults it for every trade decision.
 */

import type { AssetClass } from "./instruments";
import { ASSET_CLASS_DEFAULTS, type AssetClassDefaults } from "./asset-classes";

export type BrokerProfileId =
  | "retail_forex" | "prop_firm" | "crypto_exchange"
  | "stock_broker" | "futures_broker" | "institutional" | "zero_cost";

export type BrokerProfile = {
  id: BrokerProfileId;
  label: string;
  description: string;
  defaultLeverage: number;
  marginCallPct: number;
  stopOutPct: number;
  negativeBalanceProtection: boolean;
  /** Milliseconds of simulated execution delay. */
  executionDelayMs: number;
  /** Additional slippage in ticks on top of asset-class default. */
  slippageTicks: number;
  allowExtendedHours: boolean;
  supportedAssetClasses: AssetClass[];
  /** Per-class overrides (spread, commission, swap, leverage cap). */
  overrides: Partial<Record<AssetClass, Partial<AssetClassDefaults>>>;
};

export const BROKER_PROFILES: Record<BrokerProfileId, BrokerProfile> = {
  retail_forex: {
    id: "retail_forex", label: "Retail Forex Broker",
    description: "ESMA-style retail: 30:1 FX, tight caps, no commission, wider spreads.",
    defaultLeverage: 30, marginCallPct: 100, stopOutPct: 50,
    negativeBalanceProtection: true, executionDelayMs: 150, slippageTicks: 1,
    allowExtendedHours: false,
    supportedAssetClasses: ["forex","metals","indices","crypto"],
    overrides: {
      forex:  { leverage: 30, spreadPips: 1.2, commissionPerLot: 0 },
      metals: { leverage: 10, spreadPips: 3.0 },
      indices:{ leverage: 20, spreadPips: 1.5 },
      crypto: { leverage: 2,  spreadPips: 5.0 },
    },
  },
  prop_firm: {
    id: "prop_firm", label: "Prop Firm ECN",
    description: "Raw spreads + per-lot commission. 100:1 leverage, aggressive stop-out.",
    defaultLeverage: 100, marginCallPct: 100, stopOutPct: 30,
    negativeBalanceProtection: true, executionDelayMs: 40, slippageTicks: 0,
    allowExtendedHours: false,
    supportedAssetClasses: ["forex","metals","indices","crypto","futures"],
    overrides: {
      forex:  { leverage: 100, spreadPips: 0.2, commissionPerLot: 7 },
      metals: { leverage: 100, spreadPips: 0.5, commissionPerLot: 8 },
      indices:{ leverage: 100, spreadPips: 0.5, commissionPerLot: 5 },
      crypto: { leverage: 10,  spreadPips: 1.0, commissionPerLot: 20 },
      futures:{ leverage: 50,  spreadPips: 0.25,commissionPerLot: 4 },
    },
  },
  crypto_exchange: {
    id: "crypto_exchange", label: "Crypto Exchange",
    description: "Binance-style 24/7. Isolated liquidation, 0.04-0.10% fees.",
    defaultLeverage: 20, marginCallPct: 110, stopOutPct: 80,
    negativeBalanceProtection: false, executionDelayMs: 30, slippageTicks: 1,
    allowExtendedHours: true,
    supportedAssetClasses: ["crypto"],
    overrides: {
      crypto: { leverage: 20, spreadPips: 0.5, commissionPerLot: 0, swapLongPips: -0.1, swapShortPips: -0.1 },
    },
  },
  stock_broker: {
    id: "stock_broker", label: "Retail Stock Broker",
    description: "Cash + margin equities. 2:1 overnight, 4:1 intraday. Regular hours.",
    defaultLeverage: 2, marginCallPct: 100, stopOutPct: 25,
    negativeBalanceProtection: true, executionDelayMs: 200, slippageTicks: 1,
    allowExtendedHours: false,
    supportedAssetClasses: ["stocks"],
    overrides: {
      stocks: { leverage: 2, spreadPips: 1.0, commissionPerLot: 0 },
    },
  },
  futures_broker: {
    id: "futures_broker", label: "Futures Broker",
    description: "CME/NYMEX. Contract-based margin, exchange fees per side.",
    defaultLeverage: 50, marginCallPct: 100, stopOutPct: 50,
    negativeBalanceProtection: true, executionDelayMs: 25, slippageTicks: 0,
    allowExtendedHours: true,
    supportedAssetClasses: ["futures","indices","metals"],
    overrides: {
      futures:{ leverage: 50, spreadPips: 0.25, commissionPerLot: 4.5 },
      indices:{ leverage: 30, spreadPips: 0.5,  commissionPerLot: 3 },
      metals: { leverage: 30, spreadPips: 0.5,  commissionPerLot: 3 },
    },
  },
  institutional: {
    id: "institutional", label: "Institutional",
    description: "500:1 FX, direct-market pricing, sub-tick slippage.",
    defaultLeverage: 500, marginCallPct: 100, stopOutPct: 20,
    negativeBalanceProtection: false, executionDelayMs: 5, slippageTicks: 0,
    allowExtendedHours: true,
    supportedAssetClasses: ["forex","metals","indices","futures","crypto","stocks"],
    overrides: {
      forex:  { leverage: 500, spreadPips: 0.05, commissionPerLot: 3 },
      metals: { leverage: 200, spreadPips: 0.2 },
      indices:{ leverage: 200, spreadPips: 0.3 },
      crypto: { leverage: 50,  spreadPips: 0.3 },
      futures:{ leverage: 100, spreadPips: 0.25,commissionPerLot: 2 },
      stocks: { leverage: 10,  spreadPips: 0.5 },
    },
  },
  zero_cost: {
    id: "zero_cost", label: "Zero-Cost Testing",
    description: "No spread, no commission, no swap. For championships & QA.",
    defaultLeverage: 100, marginCallPct: 100, stopOutPct: 20,
    negativeBalanceProtection: true, executionDelayMs: 0, slippageTicks: 0,
    allowExtendedHours: true,
    supportedAssetClasses: ["forex","metals","indices","crypto","stocks","futures","options"],
    overrides: {
      forex:  { spreadPips: 0, commissionPerLot: 0, swapLongPips: 0, swapShortPips: 0 },
      metals: { spreadPips: 0, commissionPerLot: 0, swapLongPips: 0, swapShortPips: 0 },
      indices:{ spreadPips: 0, commissionPerLot: 0, swapLongPips: 0, swapShortPips: 0 },
      crypto: { spreadPips: 0, commissionPerLot: 0, swapLongPips: 0, swapShortPips: 0 },
      stocks: { spreadPips: 0, commissionPerLot: 0, swapLongPips: 0, swapShortPips: 0 },
      futures:{ spreadPips: 0, commissionPerLot: 0 },
    },
  },
};

/** Effective per-class settings after profile overrides. */
export function resolveClassSettings(profile: BrokerProfile, cls: AssetClass): AssetClassDefaults {
  const base = ASSET_CLASS_DEFAULTS[cls];
  const override = profile.overrides[cls] ?? {};
  return { ...base, ...override } as AssetClassDefaults;
}

export function getBrokerProfile(id: BrokerProfileId): BrokerProfile {
  return BROKER_PROFILES[id];
}

export function brokerSupports(profile: BrokerProfile, cls: AssetClass): boolean {
  return profile.supportedAssetClasses.includes(cls);
}
