/**
 * Position Tool — Phase 6 execution history.
 *
 * One position. Many executions.
 *
 * A position is no longer "an entry and an exit": it is an ordered, append-only
 * tape of executions (open, scale-in, partial close, take-profit, stop-out,
 * final close) plus the protective-level moves that happened between them.
 * Every derived number in Phase 6 — remaining quantity, weighted average
 * entry, weighted average exit, realized P/L, realized R — is a pure function
 * of that tape, so no two surfaces can ever disagree and a refresh replays to
 * exactly the same state.
 *
 * Conventions
 * -----------
 *  · quantity is always POSITIVE; `kind` says whether it adds or removes
 *  · level moves (`stop_move`, `target_move`) carry quantity 0
 *  · realized R is expressed against the ORIGINAL risk basis
 *    (|entry at open − initial stop| × original quantity), so partial exits
 *    contribute fractional R and the legs sum to the trade's total R
 *  · when account sizing is unknown the whole model collapses to qty = 1
 *    (per-unit accounting) and R stays exactly the same
 */

import type { OrderDirection } from "./model";

export type ExecutionKind =
  | "open"
  | "scale_in"
  | "partial_close"
  | "scale_out"
  | "take_profit"
  | "stop_out"
  | "close"
  | "stop_move"
  | "target_move";

/** Executions that ADD exposure. */
export const ENTRY_KINDS: readonly ExecutionKind[] = ["open", "scale_in"];
/** Executions that REMOVE exposure. */
export const EXIT_KINDS: readonly ExecutionKind[] = [
  "partial_close", "scale_out", "take_profit", "stop_out", "close",
];

export function isEntryKind(kind: ExecutionKind) {
  return ENTRY_KINDS.includes(kind);
}
export function isExitKind(kind: ExecutionKind) {
  return EXIT_KINDS.includes(kind);
}

export interface PositionExecution {
  id: string;
  /** Monotonic per position — the canonical ordering, independent of clocks. */
  seq: number;
  time: number;
  kind: ExecutionKind;
  /** Units transacted, always positive. Zero for level moves. */
  quantity: number;
  price: number;
  /** Realized P/L of this leg only. Zero for entries and level moves. */
  realizedPnl: number;
  /** Realized R of this leg only, against the original risk basis. */
  realizedR: number;
  /** Remaining open quantity AFTER this execution. */
  remainingQuantity: number;
  /** Human label surfaced in the timeline (e.g. "TP1 · 25%"). */
  note?: string;
}

export const EXECUTION_LABEL: Record<ExecutionKind, string> = {
  open: "Open",
  scale_in: "Scale in",
  partial_close: "Partial close",
  scale_out: "Scale out",
  take_profit: "Take profit",
  stop_out: "Stop out",
  close: "Close",
  stop_move: "Stop moved",
  target_move: "Target moved",
};

export function newExecutionId() {
  return `x_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function nextSeq(executions: readonly PositionExecution[]) {
  return executions.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
}

/** Signed price move in the trader's favour. */
export function favourableMove(direction: OrderDirection, from: number, to: number) {
  return (to - from) * (direction === "buy" ? 1 : -1);
}

export interface PositionAggregate {
  /** Total units ever added (open + every scale-in). */
  totalEntryQuantity: number;
  /** Total units ever removed. */
  totalExitQuantity: number;
  /** Still open. */
  remainingQuantity: number;
  /** Quantity-weighted average of every entry leg. */
  averageEntry: number;
  /** Quantity-weighted average of every exit leg; null while nothing exited. */
  averageExit: number | null;
  realizedPnl: number;
  realizedR: number;
  entryCount: number;
  exitCount: number;
}

/**
 * Fold the tape. This is the ONLY place quantities and averages are derived;
 * the store, the panel, the closed-trade builder and the tests all read it.
 */
export function aggregateExecutions(
  executions: readonly PositionExecution[],
): PositionAggregate {
  let entryQty = 0;
  let entryNotional = 0;
  let exitQty = 0;
  let exitNotional = 0;
  let realizedPnl = 0;
  let realizedR = 0;
  let entryCount = 0;
  let exitCount = 0;

  for (const e of [...executions].sort((a, b) => a.seq - b.seq)) {
    if (isEntryKind(e.kind) && e.quantity > 0) {
      entryQty += e.quantity;
      entryNotional += e.quantity * e.price;
      entryCount += 1;
    } else if (isExitKind(e.kind) && e.quantity > 0) {
      exitQty += e.quantity;
      exitNotional += e.quantity * e.price;
      exitCount += 1;
      realizedPnl += e.realizedPnl;
      realizedR += e.realizedR;
    }
  }

  return {
    totalEntryQuantity: entryQty,
    totalExitQuantity: exitQty,
    remainingQuantity: Math.max(0, entryQty - exitQty),
    averageEntry: entryQty > 0 ? entryNotional / entryQty : 0,
    averageExit: exitQty > 0 ? exitNotional / exitQty : null,
    realizedPnl,
    realizedR,
    entryCount,
    exitCount,
  };
}

/** Chronological view for the UI timeline (stable, seq-ordered). */
export function orderedExecutions(executions: readonly PositionExecution[]) {
  return [...executions].sort((a, b) => a.seq - b.seq);
}

/**
 * Quantity is compared with a relative epsilon so floating-point dust from
 * percentage splits (25% + 25% + 50%) never leaves a position "open" with
 * 1e-13 units.
 */
export function isFlat(remaining: number, original: number) {
  const eps = Math.max(1e-9, Math.abs(original) * 1e-9);
  return remaining <= eps;
}
