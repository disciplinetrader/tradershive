import type { SymbolMeta } from "./symbols";

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
  const pipDistance = sl ? pipsBetween(sym, entry, sl) : 0;
  const pipReward = tp ? pipsBetween(sym, entry, tp) : 0;
  const riskAmount = pipDistance * sym.pipValuePerLot * lot;
  const rewardAmount = pipReward * sym.pipValuePerLot * lot;
  const rr = riskAmount > 0 ? rewardAmount / riskAmount : 0;
  const notional = notionalValue(sym, lot, entry);
  const margin = marginRequired(sym, lot, entry, leverage);
  const riskPct = balance > 0 ? (riskAmount / balance) * 100 : 0;
  // Validate SL/TP orientation: warn silently by ignoring bad configs upstream.
  void side;
  return { pipDistance, pipReward, riskAmount, rewardAmount, rr, notional, margin, riskPct };
}

/** Whether stop/take-profit is on the correct side of entry. */
export function validateStops(side: TradeSide, entry: number, sl: number | null, tp: number | null): string | null {
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
