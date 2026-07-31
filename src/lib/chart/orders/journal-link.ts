/**
 * ClosedTrade → Journal X bridge.
 *
 * Mapping rules
 * -------------
 * Execution facts are written once, from the canonical ClosedTrade, and are
 * marked `synced` in `field_sources` so the editor renders them as imported,
 * non-authored data. Journal-owned fields (notes, setup, psychology, tags,
 * mistakes, ratings, screenshots) are left untouched here — the trader owns
 * them and this module never writes them.
 *
 * The reverse direction does not exist: nothing in the Journal can call back
 * into the trade store to rewrite an execution field. `linkJournal()` on the
 * store is the only mutator, and it only sets the entry id.
 */

import { createEntry, fetchEntry, type EntryInsert, type JournalEntry } from "@/lib/journal/api";
import type { ClosedTrade } from "./closed-trade";
import { tradeDuration, tradeResult } from "./closed-trade";
import type { ClosedTradeStore } from "./trade-store";

/** Execution fields imported from the trade — never trader-authored. */
export const IMMUTABLE_EXECUTION_FIELDS = [
  "symbol", "direction", "entry_price", "exit_price", "stop_loss", "take_profit",
  "opened_at", "closed_at", "duration_seconds", "pnl", "commission", "rr", "lot_size",
] as const;

const CLOSE_REASON_TO_EXIT_REASON: Record<ClosedTrade["closeReason"], string> = {
  manual: "manual",
  stop_loss: "stop",
  take_profit: "target",
};

/**
 * Build the insert payload for a Journal entry from a canonical trade.
 *
 * `risk_amount` is written into the narrative extras as the *planned* risk so
 * `deriveTrade()` uses exactly the denominator this trade was sized against —
 * this is what makes Journal R identical to `trade.realizedR`.
 */
export function journalInsertFromTrade(trade: ClosedTrade, userId: string): EntryInsert {
  const duration = tradeDuration(trade);
  const sources = Object.fromEntries(IMMUTABLE_EXECUTION_FIELDS.map((f) => [f, "synced"]));

  return {
    user_id: userId,
    status: "draft",
    symbol: trade.symbol,
    market: trade.market,
    direction: trade.direction === "buy" ? "long" : "short",
    entry_price: trade.fillPrice,
    exit_price: trade.exitPrice,
    stop_loss: trade.initialStop,
    take_profit: trade.initialTarget,
    lot_size: trade.quantity,
    opened_at: new Date(trade.entryTime).toISOString(),
    closed_at: new Date(trade.exitTime).toISOString(),
    duration_seconds: duration,
    pnl: trade.netPnl,
    commission: trade.fees,
    rr: trade.realizedR,
    field_sources: sources as unknown as EntryInsert["field_sources"],
    narrative: {
      x: {
        // Canonical derivation inputs — keeps Journal R identical to trade R.
        risk_amount: trade.riskAmount,
        planned_entry: trade.requestedEntry,
        expected_rr:
          trade.initialRiskDistance > 0
            ? Math.abs(trade.initialTarget - trade.fillPrice) / trade.initialRiskDistance
            : null,
        exit_reason: CLOSE_REASON_TO_EXIT_REASON[trade.closeReason],
        result: tradeResult(trade),
        // Provenance — the link back to the immutable execution record.
        closed_trade_id: trade.id,
        order_id: trade.orderId,
        position_id: trade.positionId,
        execution_source: trade.executionSource,
        slippage: trade.slippage,
        trade_source: trade.source,
      },
    } as unknown as EntryInsert["narrative"],
  };
}

export type LinkResult =
  | { ok: true; entryId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Idempotent "Add to Journal".
 *
 * A trade already carrying a `journalEntryId` resolves to that entry — a
 * repeated click opens it instead of creating a second one. The entry is
 * re-fetched first, so an entry deleted from the Journal is correctly
 * re-created rather than producing a dead link.
 */
export async function addTradeToJournal(
  store: ClosedTradeStore,
  tradeId: string,
  userId: string,
): Promise<LinkResult> {
  const trade = store.byId(tradeId);
  if (!trade) return { ok: false, error: "Trade not found." };

  if (trade.journalEntryId) {
    const existing = await fetchEntry(trade.journalEntryId).catch(() => null);
    if (existing) return { ok: true, entryId: existing.id, created: false };
  }

  const entry: JournalEntry = await createEntry(journalInsertFromTrade(trade, userId));
  store.linkJournal(trade.id, entry.id);
  return { ok: true, entryId: entry.id, created: true };
}
