/**
 * Ticket calculator — pure. Given the ticket input and the current engine
 * snapshot, returns all live-derived metrics displayed in the Order Ticket
 * component: entry price, fill price, quantity, margin, spread cost,
 * commission, risk %, R:R, liquidation price, etc.
 */

import { findSymbol } from "@/lib/paper-trading/symbols";
import {
  pnl as computePnl, notionalValue, marginRequired,
} from "@/lib/paper-trading/calculations";
import {
  COST_PROFILES, effectiveLeverage, validateIntent,
} from "@/lib/trading-engine";
import type {
  AccountConfig, AccountSnapshot, OrderIntent,
} from "@/lib/trading-engine";
import { resolveSizing } from "./sizing-modes";
import type { TicketInput, TicketMetrics } from "./types";

function referencePrice(input: TicketInput, live: number): number {
  if (input.kind === "market") return live;
  if (input.kind === "limit") return input.limitPrice ?? input.entryPrice ?? live;
  if (input.kind === "stop") return input.stopPrice ?? input.entryPrice ?? live;
  if (input.kind === "stop_limit") return input.limitPrice ?? input.stopPrice ?? live;
  return live;
}

export function toIntent(
  input: TicketInput, quantity: number,
): OrderIntent {
  return {
    symbol: input.symbol,
    side: input.side,
    kind: input.kind,
    quantity,
    limit_price: input.limitPrice ?? null,
    stop_price: input.stopPrice ?? null,
    stop_loss: input.stopLoss ?? null,
    take_profit: input.takeProfit ?? null,
    reduce_only: input.reduceOnly ?? false,
    client_id: input.clientId,
  };
}

export function computeMetrics(
  input: TicketInput,
  config: AccountConfig,
  snapshot: AccountSnapshot,
  livePrice: number,
): TicketMetrics {
  const meta = findSymbol(input.symbol);
  const empty: TicketMetrics = {
    entryPrice: 0, currentPrice: livePrice, quantity: 0, units: 0,
    leverage: 0, riskAmount: 0, riskPct: 0, potentialProfit: 0, rr: 0,
    marginRequired: 0, freeMarginAfter: snapshot.free_margin,
    spreadCost: 0, commission: 0, slippage: 0, totalCost: 0,
    liquidationPrice: null, fillPrice: 0,
    ok: false, errors: ["Unknown symbol"], warnings: [],
  };
  if (!meta) return empty;

  const entryReference = referencePrice(input, livePrice);
  const lev = effectiveLeverage(config.leverage, config.leverage_profile, meta.market);
  const sizing = resolveSizing(input.sizing, {
    symbol: input.symbol,
    side: input.side,
    entry: entryReference,
    stopLoss: input.stopLoss ?? null,
    equity: snapshot.equity,
    freeMargin: snapshot.free_margin,
    leverage: lev,
  });
  const qty = sizing.lots;

  const intent = toIntent(input, qty);
  const validation = validateIntent(config, snapshot, intent, livePrice);

  // Cost breakdown — spread cost vs commission vs slippage.
  const profile = COST_PROFILES[config.cost_profile] ?? COST_PROFILES.zero;
  const rule = profile.by_market[meta.market];
  const spreadPips = rule?.spread_pips ?? 0;
  const spreadCost = qty > 0
    ? spreadPips * (meta.pipValuePerLot || 0) * qty
    : 0;
  const commission = validation.cost_estimate;
  const slippage = Math.abs(validation.fill_price - entryReference) * meta.contractSize * qty;

  const potentialProfit = input.takeProfit
    ? Math.abs(computePnl(meta, input.side, validation.fill_price, input.takeProfit, qty))
    : 0;
  const rr = validation.risk_amount > 0 ? potentialProfit / validation.risk_amount : 0;

  const warnings = [...validation.warnings];
  if (sizing.reason) warnings.push(sizing.reason);

  return {
    entryPrice: entryReference,
    currentPrice: livePrice,
    quantity: qty,
    units: qty * (meta.contractSize || 1),
    leverage: lev,
    riskAmount: validation.risk_amount,
    riskPct: validation.risk_pct,
    potentialProfit,
    rr,
    marginRequired: validation.required_margin,
    freeMarginAfter: validation.free_margin_after,
    spreadCost,
    commission,
    slippage,
    totalCost: spreadCost + commission + slippage,
    liquidationPrice: validation.liquidation_price,
    fillPrice: validation.fill_price,
    ok: validation.ok && qty > 0,
    errors: qty > 0 ? validation.errors : [sizing.reason ?? "Quantity is zero", ...validation.errors],
    warnings,
  };
}

/** Recompute a live intent (used by preview overlays and confirm modals). */
export function buildIntentFromTicket(
  input: TicketInput,
  metrics: TicketMetrics,
): OrderIntent {
  return toIntent(input, metrics.quantity);
}

/** Notional exposure helper for badges. */
export function notionalFor(symbol: string, qty: number, price: number): number {
  const meta = findSymbol(symbol);
  if (!meta) return 0;
  return notionalValue(meta, qty, price);
}

/** Margin helper for standalone consumers (chart overlays, hover tooltips). */
export function marginFor(symbol: string, qty: number, price: number, leverage: number): number {
  const meta = findSymbol(symbol);
  if (!meta) return 0;
  return marginRequired(meta, qty, price, leverage);
}
