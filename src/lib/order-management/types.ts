/**
 * Order Management — Phase 4.
 *
 * Types for the order lifecycle, audit trail, bracket plans, trailing
 * stops, and break-even automation. This layer sits on top of the
 * TradingEngine and never modifies engine internals.
 */

import type { OrderKind, Side } from "@/lib/trading-engine";

export type ManagedOrderState =
  | "created"
  | "validated"
  | "accepted"
  | "pending"
  | "triggered"
  | "filled"
  | "modified"
  | "partially_closed"
  | "closed"
  | "cancelled"
  | "rejected"
  | "expired";

export type AuditKind =
  | "created" | "validated" | "submitted" | "accepted" | "modified"
  | "triggered" | "filled" | "partial_fill" | "partial_close"
  | "closed" | "cancelled" | "rejected" | "expired"
  | "increased" | "reduced" | "reversed"
  | "break_even_activated" | "trailing_stop_updated";

export type AuditEntry = {
  id: string;
  at: number;
  kind: AuditKind;
  message: string;
  detail?: Record<string, unknown>;
};

export type SizingModeId =
  | "fixed_lots"
  | "fixed_units"
  | "cash_risk"
  | "percent_risk"
  | "atr_risk"
  | "max_size";

export type SizingConfig =
  | { mode: "fixed_lots"; lots: number }
  | { mode: "fixed_units"; units: number }
  | { mode: "cash_risk"; cashRisk: number }
  | { mode: "percent_risk"; percent: number }
  | { mode: "atr_risk"; percent: number; atr: number; atrMultiplier: number }
  | { mode: "max_size" };

export type TrailingMethod = "distance" | "percent" | "atr";

export type TrailingConfig = {
  method: TrailingMethod;
  distance: number;          // price units, percent, or ATR multiple
  activationPrice?: number;  // trailing arms once this level is reached
  atr?: number;              // ATR value when method === "atr"
  active?: boolean;
  bestPrice?: number;        // best price seen since activation
};

export type BreakEvenConfig = {
  trigger: "manual" | "rr" | "pips" | "price";
  rr?: number;
  pips?: number;
  price?: number;
  offsetPips?: number;
  fired?: boolean;
};

export type BracketTarget = {
  id: string;
  fraction: number;   // 0..1 share of the original quantity
  price: number;
  filled?: boolean;
  filledAt?: number;
  realizedPnl?: number;
};

export type BracketPlan = {
  targets: BracketTarget[];   // ordered TP1..TPn
  runner?: number;            // remaining fraction left open
};

export type TicketInput = {
  symbol: string;
  side: Side;
  kind: OrderKind;
  sizing: SizingConfig;
  entryPrice?: number | null;      // used for limit / stop / stop_limit
  limitPrice?: number | null;      // for stop_limit
  stopPrice?: number | null;       // for stop / stop_limit
  stopLoss?: number | null;
  takeProfit?: number | null;
  atr?: number | null;
  brackets?: BracketPlan | null;
  trailing?: TrailingConfig | null;
  breakEven?: BreakEvenConfig | null;
  reduceOnly?: boolean;
  clientId?: string;
};

export type TicketMetrics = {
  entryPrice: number;
  currentPrice: number;
  quantity: number;               // lots
  units: number;                  // contract units
  leverage: number;
  riskAmount: number;
  riskPct: number;
  potentialProfit: number;
  rr: number;
  marginRequired: number;
  freeMarginAfter: number;
  spreadCost: number;
  commission: number;
  slippage: number;
  totalCost: number;
  liquidationPrice: number | null;
  fillPrice: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
};
