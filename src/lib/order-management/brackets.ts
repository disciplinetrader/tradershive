/**
 * Multi-target bracket plans (TP1..TPn + runner).
 *
 * Given the plan and a new price tick, returns the list of targets that
 * should fire. The manager translates each firing into a partial close.
 */

import type { BracketPlan, BracketTarget } from "./types";
import type { Side } from "@/lib/trading-engine";

let seq = 0;
function tid(): string { seq += 1; return `tp_${Date.now().toString(36)}_${seq.toString(36)}`; }

export function createBracket(fractions: number[], prices: number[]): BracketPlan {
  const targets: BracketTarget[] = prices.map((price, i) => ({
    id: tid(),
    fraction: fractions[i] ?? 0,
    price,
    filled: false,
  }));
  const totalFraction = targets.reduce((s, t) => s + t.fraction, 0);
  const runner = Math.max(0, 1 - totalFraction);
  return { targets, runner };
}

/** Return the targets that have been crossed since the last tick. */
export function findFiringTargets(
  plan: BracketPlan, side: Side, price: number,
): BracketTarget[] {
  const firing: BracketTarget[] = [];
  for (const t of plan.targets) {
    if (t.filled) continue;
    const hit = side === "long" ? price >= t.price : price <= t.price;
    if (hit) firing.push(t);
  }
  return firing;
}

export function markTargetFilled(
  plan: BracketPlan, id: string, realized: number,
): BracketPlan {
  return {
    ...plan,
    targets: plan.targets.map((t) => t.id === id
      ? { ...t, filled: true, filledAt: Date.now(), realizedPnl: realized }
      : t),
  };
}

export function bracketSummary(plan: BracketPlan): {
  filled: number; total: number; runner: number;
} {
  return {
    filled: plan.targets.filter((t) => t.filled).length,
    total: plan.targets.length,
    runner: plan.runner ?? 0,
  };
}
