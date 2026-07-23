/**
 * Pure SL/TP hit predicate — extracted so it can be unit-tested and reused
 * by both the live monitor (`use-sl-tp-monitor`) and any candle-replay
 * code that needs identical semantics.
 *
 *   LONG  → SL: price <= sl   TP: price >= tp
 *   SHORT → SL: price >= sl   TP: price <= tp
 *
 * SL is evaluated before TP so a bar/tick that gapped through both is
 * conservatively resolved as a stop (matches MT4/MT5).
 */

export type Side = "long" | "short";
export type Hit = { price: number; reason: "stop_loss" | "take_profit" } | null;

export function evaluateSlTpOnTick(
  side: Side,
  price: number,
  sl: number | null | undefined,
  tp: number | null | undefined,
): Hit {
  if (!(price > 0)) return null;
  if (side === "long") {
    if (sl != null && price <= sl) return { price: sl, reason: "stop_loss" };
    if (tp != null && price >= tp) return { price: tp, reason: "take_profit" };
  } else {
    if (sl != null && price >= sl) return { price: sl, reason: "stop_loss" };
    if (tp != null && price <= tp) return { price: tp, reason: "take_profit" };
  }
  return null;
}

/**
 * Candle-based variant used by replay. Evaluates SL first, then TP.
 * Uses low for long-SL / short-TP and high for long-TP / short-SL.
 */
export function evaluateSlTpOnCandle(
  side: Side,
  candle: { high: number; low: number },
  sl: number | null | undefined,
  tp: number | null | undefined,
): Hit {
  if (side === "long") {
    if (sl != null && candle.low <= sl) return { price: sl, reason: "stop_loss" };
    if (tp != null && candle.high >= tp) return { price: tp, reason: "take_profit" };
  } else {
    if (sl != null && candle.high >= sl) return { price: sl, reason: "stop_loss" };
    if (tp != null && candle.low <= tp) return { price: tp, reason: "take_profit" };
  }
  return null;
}
