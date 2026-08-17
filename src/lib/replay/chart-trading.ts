/**
 * REPLAY STUDIO X — Phase 2 · Chart-native trading math.
 *
 * Pure, dependency-free helpers used by the ChartOrderLayer and the
 * FloatingOrderTicket. Nothing here talks to the replay engine, the
 * database or the server functions — it only turns prices + lots into
 * the numbers a trader reads while dragging a level.
 *
 * The P/L convention mirrors `bookClose()` in the replay context exactly:
 *   pnl = (direction === "long" ? exit - entry : entry - exit) * lots
 * so what the chart shows is what the engine books.
 */
import type { Candle, OrderType, ReplayTrade } from "./types";

export type ChartSide = "long" | "short";
export type LevelKind = "entry" | "sl" | "tp";

export type DraftOrder = {
  side: ChartSide;
  orderType: OrderType;
  /** true once the trader picks a type manually — stops auto-inference */
  typePinned: boolean;
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
};

export type TradeMetrics = {
  riskDistance: number;
  rewardDistance: number;
  riskAmount: number;
  rewardAmount: number;
  rr: number | null;
  /** Round-trip commission estimate for the ticket. */
  commission: number;
  /** Expected P/L at target, net of commission. */
  expectedProfit: number;
  /** Expected loss at stop, including commission. */
  expectedLoss: number;
};

/* ── Formatting ─────────────────────────────────────────────── */

export function priceDigits(price: number): number {
  const abs = Math.abs(price);
  if (abs >= 1000) return 2;
  if (abs >= 100) return 2;
  if (abs >= 1) return 4;
  return 5;
}

export function formatPrice(price: number, digits?: number): string {
  if (!Number.isFinite(price)) return "—";
  return price.toFixed(digits ?? priceDigits(price));
}

export function formatMoney(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  // Instruments quoted in small units (FX) would otherwise collapse to $0.00.
  if (abs > 0 && abs < 1) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatRR(rr: number | null): string {
  return rr == null || !Number.isFinite(rr) ? "—" : `${rr.toFixed(2)}R`;
}

/* ── Geometry helpers ───────────────────────────────────────── */

/** Average true-ish range over the last `n` revealed candles. */
export function averageRange(candles: Candle[], cursorIdx: number, n = 14): number {
  const end = Math.min(cursorIdx + 1, candles.length);
  const start = Math.max(0, end - n);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += Math.abs(candles[i].high - candles[i].low);
  return sum / (end - start);
}

/**
 * Sensible first-guess stop/target for a freshly armed order:
 * 1× recent range for the stop, 2× for the target (a 2R default).
 */
export function defaultStops(
  side: ChartSide,
  entry: number,
  unit: number,
): { sl: number; tp: number } {
  const u = unit > 0 ? unit : Math.max(Math.abs(entry) * 0.001, 1e-5);
  return side === "long"
    ? { sl: entry - u, tp: entry + u * 2 }
    : { sl: entry + u, tp: entry - u * 2 };
}

/**
 * Stop and target for an entry taken straight off the chart.
 *
 * The one place this arithmetic lives. Studio has two chart-native ways to
 * open a trade — the armed "click to place" flow and the right-click menu —
 * and they must derive identical levels from identical clicks, or the same
 * gesture means two different trades depending on how it was started.
 *
 * Distinct from `defaultStops`, which sizes off a recent-range `unit` for the
 * ticket's drag interaction. This sizes off a FRACTION of the entry price,
 * which is what the armed flow's "0.2% risk" control expresses.
 */
export function bracketFor(
  direction: "buy" | "sell",
  entry: number,
  opts: { stopFraction: number; rr: number },
): { entry: number; stop: number; target: number } {
  // A floor, not a nicety: a zero stop distance makes the risk basis zero,
  // and every R-multiple derived from it becomes Infinity.
  const dist = Math.max(Math.abs(entry) * opts.stopFraction, 1e-8);
  return {
    entry,
    stop: direction === "buy" ? entry - dist : entry + dist,
    target: direction === "buy" ? entry + dist * opts.rr : entry - dist * opts.rr,
  };
}

/** Smallest sensible nudge for Shift+Arrow fine adjustment. */
export function fineStep(price: number, unit: number): number {
  const byRange = unit > 0 ? unit / 20 : 0;
  const byPrice = Math.pow(10, -priceDigits(price));
  return Math.max(byPrice, byRange);
}

/* ── Order-type inference ───────────────────────────────────── */

/**
 * Dragging the entry away from the live price should change the order
 * type the way a professional terminal does:
 *   long below price  → limit   · long above price  → stop
 *   short above price → limit   · short below price → stop
 */
export function inferOrderType(side: ChartSide, entry: number, price: number, unit: number): OrderType {
  const tol = Math.max(unit * 0.05, Math.abs(price) * 1e-6);
  if (Math.abs(entry - price) <= tol) return "market";
  if (side === "long") return entry < price ? "limit" : "stop";
  return entry > price ? "limit" : "stop";
}

/* ── Validation ─────────────────────────────────────────────── */

export function validateDraft(d: DraftOrder): { ok: boolean; reason: string | null } {
  if (!Number.isFinite(d.entry) || d.entry <= 0) return { ok: false, reason: "Invalid entry" };
  if (!Number.isFinite(d.lot) || d.lot <= 0) return { ok: false, reason: "Volume must be > 0" };
  if (d.sl != null) {
    if (d.side === "long" && d.sl >= d.entry) return { ok: false, reason: "Stop must sit below entry" };
    if (d.side === "short" && d.sl <= d.entry) return { ok: false, reason: "Stop must sit above entry" };
  }
  if (d.tp != null) {
    if (d.side === "long" && d.tp <= d.entry) return { ok: false, reason: "Target must sit above entry" };
    if (d.side === "short" && d.tp >= d.entry) return { ok: false, reason: "Target must sit below entry" };
  }
  return { ok: true, reason: null };
}

/** Stop/target guard used when dragging an *open* position's levels. */
export function validateLevel(
  side: ChartSide,
  kind: LevelKind,
  entry: number,
  price: number,
): boolean {
  if (kind === "entry") return true;
  if (kind === "sl") return side === "long" ? price < entry : price > entry;
  return side === "long" ? price > entry : price < entry;
}

/* ── Metrics ────────────────────────────────────────────────── */

export function computeTradeMetrics(input: {
  side: ChartSide;
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
  commissionPerLot?: number;
}): TradeMetrics {
  const { entry, sl, tp, lot } = input;
  const riskDistance = sl != null ? Math.abs(entry - sl) : 0;
  const rewardDistance = tp != null ? Math.abs(tp - entry) : 0;
  const riskAmount = riskDistance * lot;
  const rewardAmount = rewardDistance * lot;
  const commission = (input.commissionPerLot ?? 0) * lot * 2;
  const rr = riskDistance > 0 && rewardDistance > 0 ? rewardDistance / riskDistance : null;
  return {
    riskDistance,
    rewardDistance,
    riskAmount,
    rewardAmount,
    rr,
    commission,
    expectedProfit: Math.max(0, rewardAmount - commission),
    expectedLoss: riskAmount + commission,
  };

}

/** Unrealised P/L for an open replay trade at `price`. */
export function openPnl(trade: ReplayTrade, price: number): number {
  const dir = trade.direction === "long" ? 1 : -1;
  return (price - trade.entry_price) * dir * trade.lot_size;
}

/** Progress from entry toward target (0..1), used for the R progress rail. */
export function targetProgress(trade: ReplayTrade, price: number): number {
  if (trade.take_profit == null) return 0;
  const span = Math.abs(trade.take_profit - trade.entry_price);
  if (span <= 0) return 0;
  const dir = trade.direction === "long" ? 1 : -1;
  return Math.max(0, Math.min(1, ((price - trade.entry_price) * dir) / span));
}

/** Realised-R of an open position against its own stop. */
export function openR(trade: ReplayTrade, price: number): number | null {
  if (trade.stop_loss == null) return null;
  const risk = Math.abs(trade.entry_price - trade.stop_loss) * trade.lot_size;
  if (risk <= 0) return null;
  return openPnl(trade, price) / risk;
}
