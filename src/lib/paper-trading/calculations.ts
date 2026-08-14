import { priceDecimals, type SymbolMeta } from "./symbols";

export type TradeSide = "long" | "short";

export function directionSign(dir: TradeSide): 1 | -1 {
  return dir === "long" ? 1 : -1;
}

/** Round a value to the symbol's price decimals. */
export function roundPrice(sym: SymbolMeta, price: number): number {
  const p = Math.pow(10, sym.decimals);
  return Math.round(price * p) / p;
}

/** Distance in pips between two prices for the given symbol. */
export function pipsBetween(sym: SymbolMeta, a: number, b: number): number {
  if (!sym.pipSize) return 0;
  return Math.abs(a - b) / sym.pipSize;
}

/** P/L in account currency, ignoring commission/swap. */
export function pnl(sym: SymbolMeta, side: TradeSide, entry: number, exit: number, lot: number): number {
  const pipDist = (exit - entry) / sym.pipSize;
  return pipDist * directionSign(side) * sym.pipValuePerLot * lot;
}

/** Position size (lots) that risks `riskAmount` given SL distance. */
export function lotForRisk(sym: SymbolMeta, entry: number, sl: number, riskAmount: number): number {
  const dist = pipsBetween(sym, entry, sl);
  if (dist <= 0 || sym.pipValuePerLot <= 0) return 0;
  const raw = riskAmount / (dist * sym.pipValuePerLot);
  const stepped = Math.max(sym.minLot, Math.round(raw / sym.lotStep) * sym.lotStep);
  return Math.min(sym.maxLot, Number(stepped.toFixed(4)));
}

/** Notional value of the position (contract size × lot × price). */
export function notionalValue(sym: SymbolMeta, lot: number, price: number): number {
  return sym.contractSize * lot * price;
}

/** Margin required at the given leverage. */
export function marginRequired(sym: SymbolMeta, lot: number, price: number, leverage: number): number {
  if (leverage <= 0) return 0;
  return notionalValue(sym, lot, price) / leverage;
}

export type TradeCalc = {
  pipDistance: number;
  pipReward: number;
  riskAmount: number;
  rewardAmount: number;
  rr: number;
  notional: number;
  margin: number;
  riskPct: number;
};

export function tradeCalculation(params: {
  sym: SymbolMeta;
  side: TradeSide;
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
  leverage: number;
  balance: number;
}): TradeCalc {
  const { sym, side, entry, sl, tp, lot, leverage, balance } = params;

  // Orientational sanity: if stop loss or take profit are on the wrong side
  // for the trade direction, we treat them as unset to avoid showing misleading
  // risk/reward or distance numbers in the UI.
  const effectiveSl = sl != null ? (side === "long" ? (sl < entry ? sl : null) : (sl > entry ? sl : null)) : null;
  const effectiveTp = tp != null ? (side === "long" ? (tp > entry ? tp : null) : (tp < entry ? tp : null)) : null;


  const pipDistance = effectiveSl ? pipsBetween(sym, entry, effectiveSl) : 0;
  const pipReward = effectiveTp ? pipsBetween(sym, entry, effectiveTp) : 0;
  const riskAmount = pipDistance * sym.pipValuePerLot * lot;
  const rewardAmount = pipReward * sym.pipValuePerLot * lot;
  const rr = riskAmount > 0 ? rewardAmount / riskAmount : 0;
  const notional = notionalValue(sym, lot, entry);
  const margin = marginRequired(sym, lot, entry, leverage);
  const riskPct = balance > 0 ? (riskAmount / balance) * 100 : 0;

  return { pipDistance, pipReward, riskAmount, rewardAmount, rr, notional, margin, riskPct };
}


/** Whether stop/take-profit is on the correct side of entry. */
export function validateStops(side: TradeSide, entry: number, sl: number | null, tp: number | null): string | null {
  // Sanity first — a negative or non-finite level can otherwise slip past the
  // orientation checks below (e.g. long entry 67550 with stop loss -10).
  if (!Number.isFinite(entry) || entry <= 0) return "Entry price must be a positive number";
  for (const [label, v] of [["Stop loss", sl], ["Take profit", tp]] as const) {
    if (v == null) continue;
    if (!Number.isFinite(v)) return `${label} must be a finite number`;
    if (v <= 0) return `${label} must be a positive price`;
    if (v > 1e12) return `${label} is out of range`;
  }
  if (sl != null) {
    if (side === "long" && sl >= entry) return "Stop loss must be below entry for a long";
    if (side === "short" && sl <= entry) return "Stop loss must be above entry for a short";
  }
  if (tp != null) {
    if (side === "long" && tp <= entry) return "Take profit must be above entry for a long";
    if (side === "short" && tp >= entry) return "Take profit must be below entry for a short";
  }
  return null;
}

export function formatCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function formatNumber(n: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/**
 * Render a PRICE at its instrument's precision.
 *
 * Use this anywhere a price reaches the screen. `formatNumber`'s 2-decimal
 * default and the various hardcoded `toFixed(4)` calls it replaces were both
 * wrong for forex: at 4 decimals a pip is the smallest visible increment, so
 * sub-pip movement, the real spread and any fractional-pip stop are invisible;
 * at 2 the pip itself disappears.
 *
 * Takes the symbol rather than a digit count so call sites cannot pick their
 * own number and drift apart from each other.
 */
export function formatPrice(
  symbol: string | SymbolMeta | null | undefined,
  price: number | string | null | undefined,
): string {
  // `null` and `""` both coerce to a perfectly finite 0, so a missing price
  // would render as 0.00000 — a real level, and a misleading one.
  if (price == null || price === "") return "—";
  const n = Number(price);
  if (!Number.isFinite(n)) return "—";
  return formatNumber(n, priceDecimals(symbol));
}
