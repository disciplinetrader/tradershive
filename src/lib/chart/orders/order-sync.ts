/**
 * Active-position persistence (Phase 8 · infrastructure gap 1).
 *
 * Closed trades already survive a new device through `trade-sync`. Open
 * positions did not: the execution tape (`executions[]`, TP ladder, trailing
 * config, break-even state) lived only in `localStorage`, so switching device
 * mid-trade lost the entire history of a position that was still exposed to
 * the market.
 *
 * This module mirrors pending orders and live positions into
 * `chart_position_orders`. Contract:
 *
 *   · the local store stays the synchronous source of truth for rendering
 *   · conflicts resolve last-write-wins on the client `updatedAt` stamp —
 *     the tape is append-only, so the newer stamp always has the superset
 *   · terminal orders (closed / cancelled / archived) are dropped remotely;
 *     `chart_closed_trades` owns the permanent record
 *   · every call is best-effort — a network failure must never break trading
 */

import { supabase } from "@/integrations/supabase/client";
import type { PositionOrder } from "./model";
import { isLive } from "./lifecycle";

type Row = Record<string, unknown>;

/** Statuses worth keeping on the server: still actionable. */
export function isSyncable(order: PositionOrder): boolean {
  return order.status === "pending" || isLive(order.status);
}

export interface OrderRemote {
  pull(scope: string): Promise<PositionOrder[]>;
  upsert(order: PositionOrder): Promise<void>;
  remove(orderId: string): Promise<void>;
}

function toRow(order: PositionOrder, userId: string): Row {
  return {
    user_id: userId,
    order_id: order.id,
    position_id: order.positionId ?? null,
    drawing_id: order.drawingId ?? null,
    symbol: order.symbol,
    status: order.status,
    client_updated_at: order.updatedAt ?? order.createdAt ?? 0,
    payload: order as unknown as Row,
  };
}

/** Row → canonical order. The payload is authoritative; columns are indexes. */
export function orderFromRow(row: Record<string, unknown>): PositionOrder {
  const payload = (row.payload ?? {}) as PositionOrder;
  return {
    ...payload,
    id: String(row.order_id),
    symbol: String(row.symbol),
    status: row.status as PositionOrder["status"],
    updatedAt: Number(row.client_updated_at) || payload.updatedAt || 0,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export const supabaseOrderRemote: OrderRemote = {
  async pull(scope: string) {
    const userId = await currentUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("chart_position_orders")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", scope)
      .limit(500);
    if (error || !data) return [];
    return (data as Row[]).map(orderFromRow);
  },

  async upsert(order: PositionOrder) {
    const userId = await currentUserId();
    if (!userId) return;
    await supabase
      .from("chart_position_orders")
      .upsert(toRow(order, userId) as never, { onConflict: "user_id,order_id" });
  },

  async remove(orderId: string) {
    const userId = await currentUserId();
    if (!userId) return;
    await supabase
      .from("chart_position_orders")
      .delete()
      .eq("user_id", userId)
      .eq("order_id", orderId);
  },
};
