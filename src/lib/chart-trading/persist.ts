/**
 * Thin wrappers over the existing paper-trading server functions.
 * The chart overlay never writes directly to Supabase — every mutation
 * goes through these helpers so the risk / stats / journal pipelines
 * downstream of `openTrade`, `modifyTrade`, `closeTrade`, `placeOrder`,
 * `cancelOrder`, `partialCloseTrade`, `moveToBreakEven` still fire.
 */

import {
  openTrade,
  modifyTrade,
  closeTrade,
  placeOrder,
  cancelOrder,
  modifyOrder,
  partialCloseTrade,
  moveToBreakEven,
} from "@/lib/paper-trading.functions";

export const chartPersist = {
  openTrade,
  modifyTrade,
  closeTrade,
  placeOrder,
  cancelOrder,
  modifyOrder,
  partialCloseTrade,
  moveToBreakEven,
};
