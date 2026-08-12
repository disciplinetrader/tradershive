/**
 * Order ticket input modes — the sizing and target math behind `OrderTicket`.
 *
 * Everything here is pure and client-side. The ticket converts whatever mode
 * the trader is typing in down to a plain `lot_size` before it calls
 * `openTrade`, so the wire contract is byte-identical to the one `OrderPanel`
 * has always sent. The server stays the authority on *acceptance* —
 * `openTrade` re-runs `validateNewOrder` against a fresh quote regardless of
 * what we computed here.
 *
 * One rule runs through the whole file: **report the size we will actually
 * send, and the risk that size actually carries.** `lotForRisk` snaps to the
 * symbol's lot step and clamps to min/max, so "risk $200" frequently becomes
 * $187.50 or $212.00 once the lot is real. Showing the requested figure would
 * be the same class of lie as a win rate computed over one trade: confident,
 * precise, and wrong. Every resolver below returns `requestedRisk` and
 * `actualRisk` separately and the UI shows the second one.
 */
import { lotForRisk, pipsBetween, directionSign, type TradeSide } from "./calculations";
import type { SymbolMeta } from "./symbols";

/** How the trader is expressing position size. */
export type QuantityMode = "units" | "risk_currency" | "risk_percent";

/** How the trader is expressing a take-profit / stop-loss level. */
export type TargetMode = "price" | "reward_currency" | "reward_percent";

export const QUANTITY_MODE_LABEL: Record<QuantityMode, string> = {
  units: "Units",
  risk_currency: "Risk $",
  risk_percent: "Risk %",
};

export const TARGET_MODE_LABEL: Record<TargetMode, string> = {
  price: "Price",
  reward_currency: "Reward $",
  reward_percent: "Reward %",
};

export type SizingResult = {
  /** The lot size to send. `null` when the inputs cannot produce one. */
  lot: number | null;
  /** What the trader asked to risk, in account currency. */
  requestedRisk: number | null;
  /** What `lot` actually risks once stepped and clamped. */
  actualRisk: number | null;
  /** Set when lot-step rounding or min/max clamping moved the risk. */
  clamped: "min" | "max" | "step" | null;
  /** Why no lot could be produced — surfaced verbatim in the ticket. */
  error: string | null;
};

const NO_RESULT: SizingResult = {
  lot: null, requestedRisk: null, actualRisk: null, clamped: null, error: null,
};

/** Risk carried by `lot` given the stop distance, in account currency. */
export function riskForLot(sym: SymbolMeta, entry: number, sl: number, lot: number): number {
  return pipsBetween(sym, entry, sl) * sym.pipValuePerLot * lot;
}

/**
 * Resolve whatever the trader typed into a lot size.
 *
 * The two risk modes need a stop loss — position size is computed backward
 * from the stop distance, so without a stop there is no distance and no
 * answer. That is a deliberate refusal rather than a fallback to some default
 * size: silently sizing a trade the trader believes is risk-bounded is exactly
 * the failure this input mode exists to prevent.
 */
export function resolveQuantity(params: {
  mode: QuantityMode;
  sym: SymbolMeta | null;
  entry: number;
  sl: number | null;
  balance: number;
  /** Raw field value for the active mode: units, currency amount, or percent. */
  value: number;
}): SizingResult {
  const { mode, sym, entry, sl, balance, value } = params;
  if (!sym) return NO_RESULT;

  if (mode === "units") {
    if (!Number.isFinite(value) || value <= 0) {
      return { ...NO_RESULT, error: "Lot size must be a positive number" };
    }
    const actualRisk = sl != null && entry > 0 ? riskForLot(sym, entry, sl, value) : null;
    return { lot: value, requestedRisk: null, actualRisk, clamped: null, error: null };
  }

  // ---- risk-based sizing ----
  if (!Number.isFinite(entry) || entry <= 0) {
    return { ...NO_RESULT, error: "Enter an entry price to size from risk" };
  }
  if (sl == null || !Number.isFinite(sl) || sl <= 0) {
    return { ...NO_RESULT, error: "Risk sizing needs a stop loss" };
  }
  if (pipsBetween(sym, entry, sl) <= 0) {
    return { ...NO_RESULT, error: "Stop loss must be a different price from entry" };
  }

  let requestedRisk: number;
  if (mode === "risk_percent") {
    if (!Number.isFinite(value) || value <= 0) {
      return { ...NO_RESULT, error: "Risk % must be a positive number" };
    }
    if (!(balance > 0)) {
      return { ...NO_RESULT, error: "Account balance is zero — size in units or risk $" };
    }
    requestedRisk = balance * (value / 100);
  } else {
    if (!Number.isFinite(value) || value <= 0) {
      return { ...NO_RESULT, error: "Risk amount must be a positive number" };
    }
    requestedRisk = value;
  }

  const lot = lotForRisk(sym, entry, sl, requestedRisk);
  if (!lot) {
    return { ...NO_RESULT, requestedRisk, error: "Cannot size — check the entry/stop distance" };
  }

  const actualRisk = riskForLot(sym, entry, sl, lot);

  // Distinguish "we rounded you to the lot step" from "we hit the symbol's
  // floor/ceiling". The second is worth saying out loud: at min lot the trade
  // may risk considerably more than asked, which is the opposite of what
  // someone typing into a "Risk $" field expects.
  let clamped: SizingResult["clamped"] = null;
  const raw = requestedRisk / (pipsBetween(sym, entry, sl) * sym.pipValuePerLot);
  if (raw < sym.minLot) clamped = "min";
  else if (raw > sym.maxLot) clamped = "max";
  else if (Math.abs(lot - raw) > 1e-9) clamped = "step";

  return { lot, requestedRisk, actualRisk, clamped, error: null };
}

/**
 * Turn a reward expressed in currency or percent into a price level.
 *
 * Needs a lot size, because "make $500" is only a price once you know how big
 * the position is. Returns `null` rather than guessing when it is not.
 */
export function targetPriceForReward(params: {
  sym: SymbolMeta | null;
  side: TradeSide;
  entry: number;
  lot: number | null;
  balance: number;
  mode: TargetMode;
  value: number;
}): number | null {
  const { sym, side, entry, lot, balance, mode, value } = params;
  if (!sym || mode === "price") return null;
  if (!lot || lot <= 0) return null;
  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(value) || value <= 0) return null;

  const reward = mode === "reward_percent" ? balance * (value / 100) : value;
  if (!(balance > 0) && mode === "reward_percent") return null;

  const perPip = sym.pipValuePerLot * lot;
  if (perPip <= 0) return null;

  const pips = reward / perPip;
  const price = entry + directionSign(side) * pips * sym.pipSize;
  if (!Number.isFinite(price) || price <= 0) return null;

  const p = Math.pow(10, sym.decimals);
  return Math.round(price * p) / p;
}

/** Inverse of the above — the currency gain a target price represents. */
export function rewardForTargetPrice(
  sym: SymbolMeta, side: TradeSide, entry: number, target: number, lot: number,
): number {
  const pips = pipsBetween(sym, entry, target);
  const signed = directionSign(side) * (target - entry) >= 0 ? 1 : -1;
  return signed * pips * sym.pipValuePerLot * lot;
}
