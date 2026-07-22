/**
 * Trade-cost model.
 *
 * Every fill charges a configurable combination of spread, commission,
 * slippage, and (per-day) swap. Values differ by asset class so a prop-firm
 * FX account and a crypto-spot account can share the same engine.
 *
 * All costs return in the account currency, computed against the symbol
 * `pipValuePerLot` where relevant so lot sizing behaviour is stable.
 */

import type { SymbolMeta, PaperMarket } from "@/lib/paper-trading/symbols";
import type { CostProfileId, Side } from "./types";

export type CostRule = {
  /** Half-spread in pips (added to buy, subtracted from sell). */
  spread_pips: number;
  /** Commission per side, in account currency per 1.00 lot. */
  commission_per_lot: number;
  /** Random slippage max in pips (uniform 0..N). Deterministic when engine seed set. */
  slippage_pips: number;
  /** Overnight swap in pips/lot/day (positive = charge). Split long/short. */
  swap_long_pips: number;
  swap_short_pips: number;
};

export type CostProfile = {
  id: CostProfileId;
  label: string;
  description: string;
  by_market: Record<PaperMarket, CostRule>;
};

const ZERO: CostRule = {
  spread_pips: 0, commission_per_lot: 0, slippage_pips: 0,
  swap_long_pips: 0, swap_short_pips: 0,
};

export const COST_PROFILES: Record<CostProfileId, CostProfile> = {
  zero: {
    id: "zero", label: "Zero Costs",
    description: "Testing / championship mode — no execution costs.",
    by_market: {
      forex: ZERO, crypto: ZERO, stocks: ZERO,
      indices: ZERO, futures: ZERO, metals: ZERO,
    },
  },
  retail_forex: {
    id: "retail_forex", label: "Retail Forex Broker",
    description: "0.5–1.5 pip spreads, $0 commission, typical swap.",
    by_market: {
      forex:   { spread_pips: 1.0, commission_per_lot: 0, slippage_pips: 0.5, swap_long_pips: -0.3, swap_short_pips: -0.2 },
      crypto:  { spread_pips: 3.0, commission_per_lot: 0, slippage_pips: 1.0, swap_long_pips: -1.0, swap_short_pips: -1.0 },
      stocks:  { spread_pips: 2.0, commission_per_lot: 0, slippage_pips: 0.5, swap_long_pips: -0.5, swap_short_pips: -0.5 },
      indices: { spread_pips: 1.5, commission_per_lot: 0, slippage_pips: 0.5, swap_long_pips: -0.3, swap_short_pips: -0.3 },
      futures: { spread_pips: 1.0, commission_per_lot: 0, slippage_pips: 0.5, swap_long_pips: 0,    swap_short_pips: 0    },
      metals:  { spread_pips: 2.5, commission_per_lot: 0, slippage_pips: 0.5, swap_long_pips: -0.4, swap_short_pips: -0.4 },
    },
  },
  prop_firm: {
    id: "prop_firm", label: "Prop Firm ECN",
    description: "Raw spreads with per-lot commission.",
    by_market: {
      forex:   { spread_pips: 0.2, commission_per_lot: 7,  slippage_pips: 0.2, swap_long_pips: -0.2, swap_short_pips: -0.2 },
      crypto:  { spread_pips: 1.0, commission_per_lot: 20, slippage_pips: 0.5, swap_long_pips: -0.5, swap_short_pips: -0.5 },
      stocks:  { spread_pips: 0.5, commission_per_lot: 10, slippage_pips: 0.3, swap_long_pips: -0.3, swap_short_pips: -0.3 },
      indices: { spread_pips: 0.5, commission_per_lot: 5,  slippage_pips: 0.3, swap_long_pips: -0.2, swap_short_pips: -0.2 },
      futures: { spread_pips: 0.25, commission_per_lot: 4, slippage_pips: 0.25, swap_long_pips: 0,   swap_short_pips: 0    },
      metals:  { spread_pips: 0.5, commission_per_lot: 8,  slippage_pips: 0.5, swap_long_pips: -0.3, swap_short_pips: -0.3 },
    },
  },
  crypto_spot: {
    id: "crypto_spot", label: "Crypto Spot Exchange",
    description: "0.10% maker/taker fees, no swap.",
    by_market: {
      forex:  ZERO, indices: ZERO, futures: ZERO, metals: ZERO, stocks: ZERO,
      crypto: { spread_pips: 0.5, commission_per_lot: 0, slippage_pips: 0.5, swap_long_pips: 0, swap_short_pips: 0 },
    },
  },
  crypto_futures: {
    id: "crypto_futures", label: "Crypto Perpetual Futures",
    description: "Funding rate every 8h, 0.04% taker fee.",
    by_market: {
      forex:  ZERO, indices: ZERO, futures: ZERO, metals: ZERO, stocks: ZERO,
      crypto: { spread_pips: 0.2, commission_per_lot: 0, slippage_pips: 0.3, swap_long_pips: -0.1, swap_short_pips: -0.1 },
    },
  },
};

export type ExecutionFill = {
  /** Executed price after spread + slippage. */
  price: number;
  /** Commission charged (account currency). */
  commission: number;
  /** Pips of slippage applied to this fill. */
  slippage_pips: number;
};

/**
 * Deterministic-ish fill model. Callers can supply `rng` (0..1) for tests.
 * Spread widens the market against the trader; slippage is symmetric.
 */
export function computeFill(
  profile: CostProfile,
  meta: SymbolMeta,
  side: Side,
  requestedPrice: number,
  lots: number,
  rng: () => number = Math.random,
): ExecutionFill {
  const rule = profile.by_market[meta.market];
  const spread = rule.spread_pips * meta.pipSize;
  const slip = rule.slippage_pips * meta.pipSize * rng();
  const sign = side === "long" ? 1 : -1;
  const price = requestedPrice + sign * spread + sign * slip;
  const commission = rule.commission_per_lot * lots;
  return { price, commission, slippage_pips: rule.slippage_pips * rng() };
}

/** Daily swap in account currency (positive = charge). */
export function dailySwap(
  profile: CostProfile,
  meta: SymbolMeta,
  side: Side,
  lots: number,
): number {
  const rule = profile.by_market[meta.market];
  const pips = side === "long" ? rule.swap_long_pips : rule.swap_short_pips;
  return pips * meta.pipValuePerLot * lots;
}
