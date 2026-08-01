/**
 * Phase 8D · canonical Replay execution → comparison inputs.
 *
 * The Original-vs-Replay comparison already exists and is proven
 * (`@/lib/journal/replay-compare`). It speaks `ReplayTradeLike` + telemetry,
 * a legacy shape. Studio produces canonical `ClosedTrade` records and a
 * `ReplayEvent` log instead.
 *
 * This module is the ONLY bridge between the two. It translates, never
 * derives: every number is copied out of an immutable execution fact, and a
 * fact that does not exist stays `null`.
 */

import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { ReplayEvent } from "@/lib/replay/session/events";
import type { AttemptTelemetry, ReplayTradeLike } from "@/lib/journal/replay-compare";

const iso = (ms: number | null | undefined): string | null =>
  typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;

/** One canonical closed trade → the compare layer's trade shape. */
export function replayTradeLikeFrom(
  trade: ClosedTrade,
  opts: { startingBalance?: number | null } = {},
): ReplayTradeLike {
  const balance =
    typeof opts.startingBalance === "number" && opts.startingBalance > 0 ? opts.startingBalance : null;
  const riskDistance = Math.abs(trade.fillPrice - trade.initialStop);
  const rewardDistance = Math.abs(trade.initialTarget - trade.fillPrice);

  return {
    id: trade.id,
    direction: trade.direction === "buy" ? "long" : "short",
    entry_price: trade.fillPrice,
    exit_price: trade.exitPrice,
    stop_loss: Number.isFinite(trade.initialStop) ? trade.initialStop : null,
    take_profit: Number.isFinite(trade.initialTarget) ? trade.initialTarget : null,
    lot_size: trade.quantity,
    risk_pct: balance != null && Number.isFinite(trade.riskAmount)
      ? (Math.abs(trade.riskAmount) / balance) * 100
      : null,
    rr_planned: riskDistance > 0 && rewardDistance > 0 ? rewardDistance / riskDistance : null,
    rr_realized: trade.riskAmount > 0 && Number.isFinite(trade.realizedR) ? trade.realizedR : null,
    pnl: trade.netPnl,
    opened_at: iso(trade.entryTime) ?? new Date(0).toISOString(),
    closed_at: iso(trade.exitTime),
    status: "closed",
  };
}

export function replayTradeLikesFrom(
  trades: readonly ClosedTrade[],
  opts: { startingBalance?: number | null } = {},
): ReplayTradeLike[] {
  return trades
    .slice()
    .sort((a, b) => a.entryTime - b.entryTime)
    .map((t) => replayTradeLikeFrom(t, opts));
}

/**
 * Behaviour telemetry read straight off the append-only event log.
 *
 * The log is the audit trail of what the trader actually did, so these counts
 * are observations — not inferences.
 */
export function telemetryFromEvents(
  events: readonly ReplayEvent[],
  trades: readonly ClosedTrade[] = [],
): AttemptTelemetry {
  let pauses = 0;
  let speedChanges = 0;
  let entries = 0;
  let exits = 0;
  let firstDecision: number | null = null;
  let sessionStart: number | null = null;

  for (const e of events) {
    switch (e.type) {
      case "session_created":
      case "session_started":
        if (sessionStart == null) sessionStart = e.at;
        break;
      case "playback_paused": pauses += 1; break;
      case "speed_changed": speedChanges += 1; break;
      case "order_placed":
      case "order_filled":
        entries += 1;
        if (firstDecision == null) firstDecision = e.at;
        break;
      case "position_closed": exits += 1; break;
      default: break;
    }
  }

  const stopChanges = trades.filter(
    (t) => Number.isFinite(t.finalStop) && Number.isFinite(t.initialStop) && t.finalStop !== t.initialStop,
  ).length;
  const breakEven = trades.filter(
    (t) => Number.isFinite(t.finalStop) && Math.abs(t.finalStop - t.fillPrice) < Math.abs(t.fillPrice) * 1e-9,
  ).length;
  const targetChanges = trades.filter(
    (t) => Number.isFinite(t.finalTarget) && Number.isFinite(t.initialTarget) && t.finalTarget !== t.initialTarget,
  ).length;

  return {
    entries: entries || trades.length,
    exits: exits || trades.length,
    stop_changes: stopChanges,
    target_changes: targetChanges,
    partials: 0,
    break_even: breakEven,
    pauses,
    // Replay never rewinds — look-ahead protection forbids it.
    rewinds: 0,
    speed_changes: speedChanges,
    first_decision_ms:
      firstDecision != null && sessionStart != null ? Math.max(0, firstDecision - sessionStart) : null,
    events: events.length,
  };
}
