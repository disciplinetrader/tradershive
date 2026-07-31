/**
 * Position Tool — Phase 3 order/position state machine.
 *
 * A single, explicit transition table is the ONLY way an order changes
 * status. Every mutation path (trigger engine, manual close, cancel,
 * archive) funnels through `transition()`, so an invalid or duplicate
 * transition is impossible by construction rather than by convention.
 *
 *   pending ──► filled ──► open ──► closed ──► archived
 *      │
 *      └──► cancelled ──► archived
 *
 * Notes
 *  · `filled` is a real, observable state (listeners see it) but it is
 *    transient: the engine advances filled → open in the same atomic step.
 *  · Terminal states (`archived`) accept no further transitions.
 *  · `transition()` is idempotent-safe: asking for a transition that is not
 *    allowed returns `null` instead of throwing, so a double-fire from a
 *    racing tick is a silent no-op, never a duplicate fill.
 */

import type { OrderStatus, PositionOrder } from "./model";

/** Allowed successor states for every status. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["filled", "cancelled"],
  filled: ["open"],
  open: ["closed"],
  closed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** True once the order can never change again. */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** True while the order is a live, market-exposed position. */
export function isLive(status: OrderStatus): boolean {
  return status === "filled" || status === "open";
}

/**
 * Apply a status change plus an optional field patch.
 * Returns `null` when the transition is not legal — callers treat that as
 * "someone already did this", which is exactly the duplicate-fill guard.
 */
export function transition(
  order: PositionOrder,
  to: OrderStatus,
  patch: Partial<PositionOrder> = {},
  now = Date.now(),
): PositionOrder | null {
  if (!canTransition(order.status, to)) return null;
  return { ...order, ...patch, status: to, updatedAt: now };
}
