/**
 * MAE / MFE and running P&L over a trade's life.
 *
 * MAE (maximum adverse excursion) is the worst the trade ever looked; MFE
 * (maximum favourable) is the best it ever looked. Together they answer the two
 * questions a closed P&L cannot: "was I ever nearly stopped?" and "did I leave
 * money on the table?"
 *
 * Three rules, each of which exists because breaking it produces a number that
 * looks like a measurement and is not:
 *
 * 1. NEVER FROM SYNTHETIC CANDLES. The historical service can fabricate a tape.
 *    An MAE from fabricated bars is a specific adverse price that never
 *    happened — the most authoritative-looking lie available here. The caller
 *    refuses synthetic, and the DB has a CHECK constraint as a second line.
 *
 * 2. P&L COMES FROM THE CANONICAL FORMULA. Running P&L uses `pnl()` from the
 *    paper-trading calculator, the same function that priced the close. Hand
 *    multiplying price difference by lot size is how a forex trade ends up
 *    understated by its contract size (docs/known-issues.md BA-9).
 *
 * 3. R IS A RATIO OF P&L, NOT OF PRICE. `mae_r` is the excursion's P&L over the
 *    P&L that the stop represented. Computing it from raw price distance
 *    silently assumes the two are proportional, which contract sizes break.
 */
import { pnl as computePnl } from "@/lib/paper-trading/calculations";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";

export type ExcursionCandle = {
  time: number;
  high: number;
  low: number;
  close: number;
};

export type ExcursionPoint = {
  /** Epoch ms of the candle close. */
  t: number;
  /** Unrealised P&L at this candle's close, in account currency. */
  pnl: number;
};

export type ExcursionResult = {
  /** Extreme price against the position. */
  maePrice: number;
  /** Extreme price in favour of the position. */
  mfePrice: number;
  /** Adverse excursion in R — always <= 0. Null without a stop. */
  maeR: number | null;
  /** Favourable excursion in R — always >= 0. Null without a stop. */
  mfeR: number | null;
  /** Adverse excursion in account currency — always <= 0. */
  maePnl: number;
  /** Favourable excursion in account currency — always >= 0. */
  mfePnl: number;
  path: ExcursionPoint[];
};

export type ExcursionInput = {
  sym: SymbolMeta;
  direction: "long" | "short";
  entryPrice: number;
  stopLoss: number | null;
  lotSize: number;
  candles: readonly ExcursionCandle[];
};

/**
 * Compute excursions from a candle window.
 *
 * Uses each candle's high/low rather than its close, so a wick that nearly took
 * the stop is captured. That is the whole point of MAE: a trade that closed +2R
 * having first traded −0.9R was not a comfortable trade, and only the low knows.
 */
export function computeExcursions(input: ExcursionInput): ExcursionResult | null {
  const { sym, direction, entryPrice, stopLoss, lotSize, candles } = input;
  if (!candles.length || !Number.isFinite(entryPrice) || !(lotSize > 0)) return null;

  let highest = -Infinity;
  let lowest = Infinity;
  const path: ExcursionPoint[] = [];

  for (const c of candles) {
    if (Number.isFinite(c.high)) highest = Math.max(highest, c.high);
    if (Number.isFinite(c.low)) lowest = Math.min(lowest, c.low);
    if (Number.isFinite(c.close)) {
      path.push({ t: c.time, pnl: computePnl(sym, direction, entryPrice, c.close, lotSize) });
    }
  }
  if (!Number.isFinite(highest) || !Number.isFinite(lowest)) return null;

  // A long is hurt by the low and helped by the high; a short is the mirror.
  const maePrice = direction === "long" ? lowest : highest;
  const mfePrice = direction === "long" ? highest : lowest;

  const maePnl = Math.min(0, computePnl(sym, direction, entryPrice, maePrice, lotSize));
  const mfePnl = Math.max(0, computePnl(sym, direction, entryPrice, mfePrice, lotSize));

  // Risk basis: what the stop was worth, priced by the same formula.
  const riskPnl =
    stopLoss != null && Number.isFinite(stopLoss)
      ? Math.abs(computePnl(sym, direction, entryPrice, stopLoss, lotSize))
      : 0;
  const measurableR = riskPnl > 0;

  return {
    maePrice,
    mfePrice,
    maeR: measurableR ? maePnl / riskPnl : null,
    mfeR: measurableR ? mfePnl / riskPnl : null,
    maePnl,
    mfePnl,
    path,
  };
}

/**
 * Cap the stored path so one entry cannot carry an unbounded jsonb blob.
 * Down-samples evenly and always keeps the first and last point, so the shape
 * of the curve and both endpoints survive.
 */
export function capPath(path: ExcursionPoint[], max = 500): ExcursionPoint[] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  const out: ExcursionPoint[] = [];
  for (let i = 0; i < max; i += 1) out.push(path[Math.round(i * step)]);
  return out;
}

/** Finest timeframe worth resolving for a window — bounded so we never ask for
 *  a million 1m candles to describe a three-month swing trade. */
export function timeframeFor(durationMs: number): "1m" | "5m" | "15m" | "1H" | "4H" | "1D" {
  const hours = durationMs / 3_600_000;
  if (hours <= 4) return "1m";
  if (hours <= 24) return "5m";
  if (hours <= 24 * 5) return "15m";
  if (hours <= 24 * 30) return "1H";
  if (hours <= 24 * 120) return "4H";
  return "1D";
}
