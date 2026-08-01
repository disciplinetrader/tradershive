/**
 * Phase 8D · durable persistence for Replay-session closed trades.
 *
 * Live trades and Replay trades share ONE table (`chart_closed_trades`) and
 * ONE record shape, because they are produced by one execution engine. The
 * only difference is provenance: a Replay trade carries `replay_session_id`,
 * a live trade carries NULL.
 *
 * Consequences of that single choice:
 *   · a completed session can be summarised server-side from canonical rows
 *   · Replay results can never leak into live analytics (filters are explicit)
 *   · resuming on another device restores the result tape, not just the clock
 */

import { supabase } from "@/integrations/supabase/client";
import type { ClosedTrade } from "./closed-trade";
import { closedTradeFromRow } from "./trade-sync";
import type { TradeRemote } from "./trade-store";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function toRow(trade: ClosedTrade, userId: string, sessionId: string): Record<string, unknown> {
  return {
    id: trade.id,
    user_id: userId,
    replay_session_id: sessionId,
    order_id: trade.orderId,
    position_id: trade.positionId,
    drawing_id: trade.drawingId ?? null,
    symbol: trade.symbol,
    market: trade.market ?? null,
    direction: trade.direction,
    order_type: trade.orderType,
    requested_entry: trade.requestedEntry ?? null,
    fill_price: trade.fillPrice,
    entry_time: trade.entryTime,
    initial_stop: trade.initialStop ?? null,
    initial_target: trade.initialTarget ?? null,
    final_stop: trade.finalStop ?? null,
    final_target: trade.finalTarget ?? null,
    exit_price: trade.exitPrice,
    exit_time: trade.exitTime,
    close_reason: trade.closeReason,
    quantity: trade.quantity,
    position_size: trade.positionSize,
    gross_pnl: trade.grossPnl,
    fees: trade.fees,
    net_pnl: trade.netPnl,
    risk_amount: trade.riskAmount,
    initial_risk_distance: trade.initialRiskDistance,
    realized_r: trade.realizedR,
    return_percent: trade.returnPercent,
    slippage: trade.slippage,
    execution_source: trade.executionSource ?? null,
    closed_at: trade.closedAt,
    journal_entry_id: trade.journalEntryId,
    journal_status: trade.journalStatus,
    archived_at: trade.archivedAt ?? null,
    payload: trade as unknown as Record<string, unknown>,
  };
}

/**
 * Remote adapter bound to one Replay session. Best-effort by contract: a
 * network failure degrades to local-only trading, never to a broken session.
 */
export function createReplayTradeRemote(sessionId: string): TradeRemote {
  return {
    async pull() {
      const userId = await currentUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from("chart_closed_trades")
        .select("*")
        .eq("user_id", userId)
        .eq("replay_session_id", sessionId)
        .order("closed_at", { ascending: false })
        .limit(500);
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(closedTradeFromRow);
    },

    async upsert(trade: ClosedTrade) {
      const userId = await currentUserId();
      if (!userId) return;
      await supabase
        .from("chart_closed_trades")
        .upsert(toRow(trade, userId, sessionId) as never, {
          onConflict: "user_id,position_id",
          ignoreDuplicates: true,
        });
    },

    async patch(trade: ClosedTrade) {
      const userId = await currentUserId();
      if (!userId) return;
      await supabase
        .from("chart_closed_trades")
        .update({
          journal_entry_id: trade.journalEntryId,
          journal_status: trade.journalStatus,
          archived_at: trade.archivedAt ?? null,
        } as never)
        .eq("id", trade.id)
        .eq("user_id", userId);
    },
  };
}

/** Storage scope for a session's local tape — never shared with live charts. */
export const replayTradeScope = (sessionId: string) => `replay-session-${sessionId}`;
