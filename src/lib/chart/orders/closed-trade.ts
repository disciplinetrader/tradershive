/**
 * Position Tool — Phase 4 canonical ClosedTrade record.
 *
 * A closed order is a *lifecycle* object; a ClosedTrade is the *analytics*
 * object. They are deliberately separate:
 *
 *   · the order may be archived, its drawing deleted, its store scoped away
 *   · the trade is an immutable historical fact that outlives all of that
 *
 * Immutability contract
 * ---------------------
 * Every execution field below is written exactly once, at close time, and is
 * never rewritten — not by a later tick, not by a Journal edit, not by a
 * reconciliation pass. Only `journalEntryId`, `journalStatus` and `archivedAt`
 * are mutable, and each has a dedicated, narrow mutator in the store.
 *
 * Derivation contract
 * -------------------
 * Gross / fees / net / result / risk / R are NOT re-invented here. The
 * formulas live in `@/lib/journal/derive` and this module feeds them the same
 * inputs the Journal will later see, so the two can never disagree. See
 * `deriveClosedTrade()` below.
 */

import { resultOf, type TradeResult } from "@/lib/journal/derive";
import { closureAggregate } from "./position-manager";
import type {
  CloseReason, ExecutionSource, OrderDirection, OrderType, PositionOrder,
} from "./model";


export const CLOSED_TRADE_SOURCE = "PositionTool" as const;

export type JournalStatus = "unlinked" | "linked";

export interface ClosedTrade {
  id: string;
  orderId: string;
  positionId: string;
  drawingId: string;

  symbol: string;
  market: string | null;
  direction: OrderDirection;
  orderType: OrderType;

  /** Price the trader asked for (pre-slippage). */
  requestedEntry: number;
  /** Price the position actually opened at. */
  fillPrice: number;
  entryTime: number;

  /** Protective levels as they stood at fill time. */
  initialStop: number;
  initialTarget: number;
  /** Protective levels as they stood at close time (drag / break-even). */
  finalStop: number;
  finalTarget: number;

  exitPrice: number;
  exitTime: number;
  closeReason: CloseReason;

  /** Units traded; null when account sizing is unknown (per-unit accounting). */
  quantity: number | null;
  /** quantity × fillPrice, null when quantity is unknown. */
  positionSize: number | null;

  grossPnl: number;
  fees: number;
  netPnl: number;

  /** Account-currency risk the trade was sized against. */
  riskAmount: number;
  /** Price distance fill → initial stop. */
  initialRiskDistance: number;
  realizedR: number;
  returnPercent: number;

  slippage: number;
  executionSource: ExecutionSource;

  createdAt: number;
  closedAt: number;

  journalEntryId: string | null;
  journalStatus: JournalStatus;

  archivedAt?: number;

  source: typeof CLOSED_TRADE_SOURCE;
}

export function newClosedTradeId() {
  return `t_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Fees are not configurable in Phase 4 — no commission model exists yet. */
export const PHASE4_FEES = 0;

export interface DerivedClosedTrade {
  grossPnl: number;
  fees: number;
  netPnl: number;
  result: TradeResult;
  riskAmount: number;
  realizedR: number;
  returnPercent: number;
}

/**
 * The single derivation used by BOTH the trade record and the Journal entry
 * it produces.
 *
 * Equivalence with `@/lib/journal/derive`:
 *   fees      = commission + swap            → we write commission = fees
 *   gross     = net + fees                   → identical expression
 *   result    = resultOf(net)                → the canonical helper, imported
 *   riskAmount= |fill − stop| × qty          → the `levels` basis, and it is
 *               also written to the Journal as the `planned` risk extra so
 *               a later stop drag cannot re-base R
 *   R         = net / riskAmount             → identical expression
 *
 * With unknown size the whole set collapses to qty = 1 (per-unit accounting),
 * which leaves R and return% unchanged — they are size-independent.
 */
export function deriveClosedTrade(input: {
  direction: OrderDirection;
  fillPrice: number;
  exitPrice: number;
  initialStop: number;
  quantity: number | null;
  fees?: number;
}): DerivedClosedTrade {
  const qty = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const sign = input.direction === "buy" ? 1 : -1;
  const move = (input.exitPrice - input.fillPrice) * sign;

  const fees = input.fees ?? PHASE4_FEES;
  const grossPnl = move * qty;
  const netPnl = grossPnl - fees;

  const distance = Math.abs(input.fillPrice - input.initialStop);
  const riskAmount = distance * qty;

  return {
    grossPnl,
    fees,
    netPnl,
    result: resultOf(netPnl) ?? "breakeven",
    riskAmount,
    realizedR: riskAmount > 0 ? netPnl / riskAmount : 0,
    returnPercent: input.fillPrice !== 0 ? (move / input.fillPrice) * 100 : 0,
  };
}

/**
 * Missing execution facts are reported, never fabricated. A trade that fails
 * this check is not written — the caller surfaces the reason instead.
 */
export function missingExecutionFields(order: PositionOrder): string[] {
  const missing: string[] = [];
  if (!order.positionId) missing.push("positionId");
  if (!Number.isFinite(order.fillPrice ?? NaN)) missing.push("fillPrice");
  if (!Number.isFinite(order.filledAt ?? NaN)) missing.push("filledAt");
  if (!Number.isFinite(order.closePrice ?? NaN)) missing.push("exitPrice");
  if (!Number.isFinite(order.closedAt ?? NaN)) missing.push("exitTime");
  return missing;
}

export type BuildTradeResult =
  | { ok: true; trade: ClosedTrade }
  | { ok: false; missing: string[] };

/**
 * Materialise a canonical ClosedTrade from a closed order.
 *
 * `initialStop` / `initialTarget` come from the levels captured at fill time
 * when available (`initialStop` on the order), so a mid-trade stop drag or a
 * break-even move cannot retro-actively change the risk the trade was sized
 * against — exactly the rule the Journal derivation enforces.
 */
export function buildClosedTrade(
  order: PositionOrder,
  opts: { market?: string | null; now?: number } = {},
): BuildTradeResult {
  const missing = missingExecutionFields(order);
  if (missing.length) return { ok: false, missing };

  const initialStop = order.initialStop ?? order.stop;
  const initialTarget = order.initialTarget ?? order.target;

  // ── Phase 6 aggregation ────────────────────────────────────────────────
  // When the position carried an execution tape (partial closes, scale-ins,
  // TP legs), the trade is built from the AGGREGATE of that tape: weighted
  // average entry, weighted average exit, summed realized P/L and R. A
  // single-shot Phase 3/4/5 position has no tape and keeps its original
  // construction path byte-for-byte.
  const agg = closureAggregate(order);

  const fillPrice = agg ? agg.averageEntry : (order.fillPrice as number);
  const exitPrice = agg ? agg.averageExit : (order.closePrice as number);
  const quantity = agg ? agg.quantity : order.size;

  const d = agg
    ? (() => {
        const riskAmount = Math.abs((order.riskBasis ?? Math.abs(fillPrice - initialStop))) * agg.quantity;
        const fees = PHASE4_FEES;
        const grossPnl = agg.realizedPnl;
        const netPnl = grossPnl - fees;
        const move = agg.quantity > 0 ? grossPnl / agg.quantity : 0;
        return {
          grossPnl,
          fees,
          netPnl,
          result: resultOf(netPnl) ?? ("breakeven" as const),
          riskAmount,
          realizedR: riskAmount > 0 ? netPnl / riskAmount : 0,
          returnPercent: fillPrice !== 0 ? (move / fillPrice) * 100 : 0,
        };
      })()
    : deriveClosedTrade({
        direction: order.direction,
        fillPrice,
        exitPrice,
        initialStop,
        quantity: order.size,
      });


  return {
    ok: true,
    trade: {
      id: newClosedTradeId(),
      orderId: order.id,
      positionId: order.positionId as string,
      drawingId: order.drawingId,

      symbol: order.symbol,
      market: opts.market ?? null,
      direction: order.direction,
      orderType: order.orderType,

      requestedEntry: order.requestedEntry ?? order.entry,
      fillPrice,
      entryTime: order.filledAt as number,

      initialStop,
      initialTarget,
      finalStop: order.stop,
      finalTarget: order.target,

      exitPrice,
      exitTime: order.closedAt as number,
      closeReason: order.closeReason ?? agg?.closeReason ?? "manual",

      quantity,
      positionSize: quantity && quantity > 0 ? quantity * fillPrice : null,


      grossPnl: d.grossPnl,
      fees: d.fees,
      netPnl: d.netPnl,

      riskAmount: d.riskAmount,
      initialRiskDistance: Math.abs(fillPrice - initialStop),
      realizedR: d.realizedR,
      returnPercent: d.returnPercent,

      slippage: order.slippage ?? 0,
      executionSource: order.executionSource ?? "manual",

      createdAt: order.createdAt,
      closedAt: order.closedAt as number,

      journalEntryId: null,
      journalStatus: "unlinked",
      source: CLOSED_TRADE_SOURCE,
    },
  };
}

export function tradeResult(trade: ClosedTrade): TradeResult {
  return resultOf(trade.netPnl) ?? "breakeven";
}

/** Holding time in seconds. */
export function tradeDuration(trade: ClosedTrade): number {
  return Math.max(0, Math.round((trade.exitTime - trade.entryTime) / 1000));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  manual: "Manual",
  stop_loss: "Stop loss",
  take_profit: "Take profit",
};

export type TradeFilter =
  | "all" | "profit" | "loss" | "breakeven"
  | "manual" | "stop_loss" | "take_profit" | "archived";

export function matchesFilter(trade: ClosedTrade, filter: TradeFilter): boolean {
  if (filter === "archived") return !!trade.archivedAt;
  if (trade.archivedAt) return false;
  switch (filter) {
    case "all": return true;
    case "profit": return tradeResult(trade) === "win";
    case "loss": return tradeResult(trade) === "loss";
    case "breakeven": return tradeResult(trade) === "breakeven";
    case "manual":
    case "stop_loss":
    case "take_profit":
      return trade.closeReason === filter;
    default: return true;
  }
}
