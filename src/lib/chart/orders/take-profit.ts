/**
 * Position Tool — Phase 6 multiple take-profit model.
 *
 * A position carries an ordered ladder of TP legs. Each leg allocates a
 * percentage of the ORIGINAL quantity, so allocations stay stable as the
 * position is partially closed: TP2 at 50% always means "half the original
 * size", never "half of whatever is left".
 *
 * Each leg may also carry a post-fill action, which is what turns the ladder
 * into a management plan:
 *
 *    TP1 25%  → move stop to break-even
 *    TP2 50%  → activate the trailing stop
 *    TP3 rest → close
 */

export type TakeProfitAction = "none" | "break_even" | "trail";

export interface TakeProfitLeg {
  id: string;
  /** 1-based position in the ladder — TP1, TP2, TP3. */
  index: number;
  price: number;
  /** Share of the ORIGINAL quantity, 0…100. */
  percent: number;
  action: TakeProfitAction;
  status: "pending" | "filled";
  filledAt?: number;
  filledPrice?: number;
}

export const TP_ACTION_LABEL: Record<TakeProfitAction, string> = {
  none: "No action",
  break_even: "Move stop to break-even",
  trail: "Activate trailing stop",
};

export function newTpId() {
  return `tp_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

export function makeTakeProfit(
  index: number,
  price: number,
  percent: number,
  action: TakeProfitAction = "none",
): TakeProfitLeg {
  return { id: newTpId(), index, price, percent, action, status: "pending" };
}

/**
 * A sensible default ladder between the fill and the target: 25 / 25 / 50,
 * spaced at 50% / 75% / 100% of the way to the original target.
 */
export function defaultLadder(
  direction: "buy" | "sell",
  fill: number,
  target: number,
): TakeProfitLeg[] {
  const span = target - fill;
  if (!Number.isFinite(span) || span === 0) return [];
  const at = (f: number) => fill + span * f;
  void direction; // span already carries the sign
  return [
    makeTakeProfit(1, at(0.5), 25, "break_even"),
    makeTakeProfit(2, at(0.75), 25, "trail"),
    makeTakeProfit(3, at(1), 50, "none"),
  ];
}

export function pendingLegs(legs: readonly TakeProfitLeg[] = []) {
  return legs.filter((l) => l.status === "pending").sort((a, b) => a.index - b.index);
}

export function allocatedPercent(legs: readonly TakeProfitLeg[] = []) {
  return legs.reduce((sum, l) => sum + (Number.isFinite(l.percent) ? l.percent : 0), 0);
}

/** Allocation is valid when the ladder never promises more than 100%. */
export function validateLadder(legs: readonly TakeProfitLeg[] = []): string[] {
  const errors: string[] = [];
  if (allocatedPercent(legs) > 100.0001) {
    errors.push("Take-profit allocation exceeds 100% of the position.");
  }
  for (const l of legs) {
    if (!(l.percent > 0)) errors.push(`TP${l.index}: allocation must be greater than 0%.`);
    if (!(Number.isFinite(l.price) && l.price > 0)) errors.push(`TP${l.index}: invalid price.`);
  }
  return errors;
}

/**
 * Has this tick reached the leg? Touching the level counts, exactly like the
 * Phase 3 exit rule, and there is no price improvement: the fill is the leg
 * price, never a better gapped price.
 */
export function legTriggered(direction: "buy" | "sell", leg: TakeProfitLeg, price: number) {
  if (leg.status !== "pending") return false;
  return direction === "buy" ? price >= leg.price : price <= leg.price;
}

/** Re-index a ladder after an insert / remove so labels stay TP1…TPn. */
export function reindex(legs: readonly TakeProfitLeg[]): TakeProfitLeg[] {
  return [...legs]
    .sort((a, b) => a.index - b.index)
    .map((l, i) => ({ ...l, index: i + 1 }));
}
