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

import { toast } from "sonner";
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
 * Report a failed write on the durable trade record — loudly.
 *
 * WHY THIS EXISTS
 *
 * `supabase-js` returns `{ error }`; it does not throw. An `await` that
 * discards the result therefore turns a rejected write into a no-op with no
 * log, no toast, and a green test suite. That is not hypothetical: RS-4
 * Stage A nullified `initial_risk_distance` and `realized_r` while both columns
 * were still `NOT NULL`, so every stopless position that closed lost its
 * durable record to a 400 — through a full unit suite, a full Playwright suite,
 * and a publish, without one visible symptom. The only trace was a bare `400`
 * in the browser console, found by accident while debugging an unrelated
 * assertion.
 *
 * The remote is still BEST-EFFORT by contract: a network failure must degrade
 * to local-only trading rather than break the session, so this reports and
 * returns — it never throws. But "best effort" was being used to justify
 * "silent", and those are different things. A closed trade that never reached
 * the database is missing from the journal and from every analytic built on it,
 * and the trader is the only one who can decide what to do about that.
 */
function reportWriteFailure(op: string, error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const detail = error.code ? `${error.code} · ${error.message}` : error.message;
  console.error(`[replay-trade-sync] ${op} failed — the durable trade record was NOT written:`, detail);
  toast.error("Trade record not saved", {
    description:
      "This trade stayed in the session but did not reach your journal. " +
      "Check the console for details before relying on today's analytics.",
  });
  return true;
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
      if (error) {
        // A failed READ degrades to "no remote history", which is the correct
        // best-effort behaviour — the local tape is authoritative during a
        // session. Logged rather than toasted: nothing has been lost.
        console.warn("[replay-trade-sync] closed-trade pull failed:", error.message);
        return [];
      }
      if (!data) return [];
      return (data as Record<string, unknown>[]).map(closedTradeFromRow);
    },

    async upsert(trade: ClosedTrade) {
      const userId = await currentUserId();
      if (!userId) return;
      const { error } = await supabase
        .from("chart_closed_trades")
        .upsert(toRow(trade, userId, sessionId) as never, {
          onConflict: "user_id,position_id",
          ignoreDuplicates: true,
        });
      reportWriteFailure("closed-trade upsert", error);
    },

    async patch(trade: ClosedTrade) {
      const userId = await currentUserId();
      if (!userId) return;
      const { error } = await supabase
        .from("chart_closed_trades")
        .update({
          journal_entry_id: trade.journalEntryId,
          journal_status: trade.journalStatus,
          archived_at: trade.archivedAt ?? null,
        } as never)
        .eq("id", trade.id)
        .eq("user_id", userId);
      reportWriteFailure("closed-trade patch", error);
    },
  };
}

/** Storage scope for a session's local tape — never shared with live charts. */
export const replayTradeScope = (sessionId: string) => `replay-session-${sessionId}`;
