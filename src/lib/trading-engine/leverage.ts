/**
 * Leverage & margin profiles by asset class.
 *
 * The Account Engine consults these to compute per-symbol margin — accounts
 * can pick a profile matching their broker/exchange (retail, prop firm,
 * crypto, institutional). No hardcoded per-market values live outside this
 * file.
 */

import type { PaperMarket } from "@/lib/paper-trading/symbols";
import type { LeverageProfileId } from "./types";

export type MarketLeverage = Record<PaperMarket, number>;

export type LeverageProfile = {
  id: LeverageProfileId;
  label: string;
  description: string;
  /** Max leverage the account may use per asset class. */
  max: MarketLeverage;
  /** Maintenance-margin ratio per asset class (used for liquidation). */
  mmr: MarketLeverage;
};

export const LEVERAGE_PROFILES: Record<LeverageProfileId, LeverageProfile> = {
  retail: {
    id: "retail",
    label: "Retail (EU / ESMA-style)",
    description: "30:1 FX majors, 20:1 minors/indices, 10:1 commodities, 5:1 stocks, 2:1 crypto.",
    max:  { forex: 30, crypto: 2,  stocks: 5,  indices: 20, futures: 20, metals: 10 },
    mmr:  { forex: 0.005, crypto: 0.05, stocks: 0.05, indices: 0.01, futures: 0.01, metals: 0.01 },
  },
  prop: {
    id: "prop",
    label: "Prop Firm",
    description: "Up to 100:1 across FX/metals/indices, tighter caps on crypto.",
    max:  { forex: 100, crypto: 10, stocks: 20, indices: 100, futures: 50, metals: 100 },
    mmr:  { forex: 0.005, crypto: 0.02, stocks: 0.03, indices: 0.005, futures: 0.005, metals: 0.005 },
  },
  crypto: {
    id: "crypto",
    label: "Crypto Exchange",
    description: "Binance-style 20:1 default, isolated liquidation.",
    max:  { forex: 20, crypto: 20, stocks: 5, indices: 10, futures: 20, metals: 20 },
    mmr:  { forex: 0.005, crypto: 0.005, stocks: 0.05, indices: 0.01, futures: 0.005, metals: 0.005 },
  },
  institutional: {
    id: "institutional",
    label: "Institutional",
    description: "500:1 FX, 50:1 crypto — for stress-testing risk math.",
    max:  { forex: 500, crypto: 50, stocks: 50, indices: 200, futures: 100, metals: 200 },
    mmr:  { forex: 0.002, crypto: 0.01, stocks: 0.02, indices: 0.003, futures: 0.003, metals: 0.003 },
  },
};

/** Effective leverage for a symbol on this account — capped by account + profile. */
export function effectiveLeverage(
  accountLeverage: number,
  profileId: LeverageProfileId,
  market: PaperMarket,
): number {
  const cap = LEVERAGE_PROFILES[profileId]?.max[market] ?? accountLeverage;
  return Math.max(1, Math.min(accountLeverage || 1, cap));
}

/** MMR (maintenance-margin ratio) for a symbol on this profile. */
export function maintenanceMargin(
  profileId: LeverageProfileId,
  market: PaperMarket,
): number {
  return LEVERAGE_PROFILES[profileId]?.mmr[market] ?? 0.005;
}
