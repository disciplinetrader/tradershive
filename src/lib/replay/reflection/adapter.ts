/**
 * Phase 8C · canonical → reflection adapter.
 *
 * Scoring has exactly ONE formula (`computeReplayScore`). Studio sessions
 * execute through the canonical engine and therefore produce `ClosedTrade`
 * records, not legacy `replay_trades` rows. This module translates canonical
 * execution facts into the score input shape — it derives nothing new and
 * invents nothing:
 *
 *   · risk_pct is emitted ONLY when the session's starting balance is known
 *   · every other field is copied verbatim from the immutable ClosedTrade
 *
 * Unknown stays unknown.
 */

import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";

/** The subset of a legacy replay trade that the score formula reads. */
export interface ScoreTradeFact {
  status: "closed";
  stop_loss: number | null;
  risk_pct?: number;
  pnl: number;
  rr_realized: number | null;
}

export function scoreFactsFromClosedTrades(
  trades: ClosedTrade[],
  opts: { startingBalance?: number | null } = {},
): ScoreTradeFact[] {
  const balance =
    typeof opts.startingBalance === "number" && opts.startingBalance > 0
      ? opts.startingBalance
      : null;

  return trades.map((t) => {
    const fact: ScoreTradeFact = {
      status: "closed",
      stop_loss: t.initialStop ?? null,
      pnl: t.netPnl,
      rr_realized: Number.isFinite(t.realizedR) ? t.realizedR : null,
    };
    if (balance != null && Number.isFinite(t.riskAmount)) {
      fact.risk_pct = (Math.abs(t.riskAmount) / balance) * 100;
    }
    return fact;
  });
}
