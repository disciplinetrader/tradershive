/**
 * Closed-trade remote persistence (Phase 4 follow-up).
 *
 * The local tape stays the source of truth for rendering — it is synchronous,
 * offline-safe and hydration-gated. This module mirrors it into
 * `chart_closed_trades` so the record survives a new device or a cleared
 * browser, using the browser Supabase client (RLS scopes every row to the
 * signed-in user).
 *
 * Contract:
 *   · execution facts are written once; upserts never rewrite them
 *   · only `journal_entry_id`, `journal_status` and `archived_at` are patched
 *   · every call is best-effort: a network failure must never break trading
 */

import { supabase } from "@/integrations/supabase/client";
import type { ClosedTrade } from "./closed-trade";
import { CLOSED_TRADE_SOURCE } from "./closed-trade";
import type { TradeRemote } from "./trade-store";

type Row = Record<string, unknown>;

function toRow(trade: ClosedTrade, userId: string): Row {
  return {
    id: trade.id,
    user_id: userId,
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
    payload: trade as unknown as Row,
  };
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

function fromRow(row: Row): ClosedTrade {
  const payload = (row.payload ?? {}) as Partial<ClosedTrade>;
  return {
    ...(payload as ClosedTrade),
    id: String(row.id),
    orderId: String(row.order_id),
    positionId: String(row.position_id),
    drawingId: (row.drawing_id as string) ?? payload.drawingId ?? "",
    symbol: String(row.symbol),
    market: (row.market as string) ?? null,
    direction: row.direction as ClosedTrade["direction"],
    orderType: row.order_type as ClosedTrade["orderType"],
    requestedEntry: num(row.requested_entry, num(row.fill_price)),
    fillPrice: num(row.fill_price),
    entryTime: num(row.entry_time),
    initialStop: num(row.initial_stop),
    initialTarget: num(row.initial_target),
    finalStop: num(row.final_stop),
    finalTarget: num(row.final_target),
    exitPrice: num(row.exit_price),
    exitTime: num(row.exit_time),
    closeReason: row.close_reason as ClosedTrade["closeReason"],
    quantity: row.quantity === null || row.quantity === undefined ? null : num(row.quantity),
    positionSize:
      row.position_size === null || row.position_size === undefined ? null : num(row.position_size),
    grossPnl: num(row.gross_pnl),
    fees: num(row.fees),
    netPnl: num(row.net_pnl),
    riskAmount: num(row.risk_amount),
    initialRiskDistance: num(row.initial_risk_distance),
    realizedR: num(row.realized_r),
    returnPercent: num(row.return_percent),
    slippage: num(row.slippage),
    executionSource: (row.execution_source as ClosedTrade["executionSource"]) ?? payload.executionSource!,
    createdAt: payload.createdAt ?? num(row.closed_at),
    closedAt: num(row.closed_at),
    journalEntryId: (row.journal_entry_id as string) ?? null,
    journalStatus: (row.journal_status as ClosedTrade["journalStatus"]) ?? "unlinked",
    archivedAt: row.archived_at === null || row.archived_at === undefined ? undefined : num(row.archived_at),
    source: CLOSED_TRADE_SOURCE,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Browser-side remote adapter for `closedTradeStore`. */
export const supabaseTradeRemote: TradeRemote = {
  async pull(scope: string) {
    const userId = await currentUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("chart_closed_trades")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", scope)
      .order("closed_at", { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return (data as Row[]).map(fromRow);
  },

  async upsert(trade: ClosedTrade) {
    const userId = await currentUserId();
    if (!userId) return;
    await supabase
      .from("chart_closed_trades")
      .upsert(toRow(trade, userId) as never, { onConflict: "user_id,position_id", ignoreDuplicates: true });
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
