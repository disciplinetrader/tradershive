/**
 * Trading Engine — shared types.
 *
 * The engine is a pure, deterministic calculation layer built on top of the
 * existing paper-trading catalog and risk math. It does NOT fetch market
 * data. Callers push quotes into it via `AccountEngine.onPrice()`.
 *
 * Every state-changing method returns the resulting snapshot AND emits a
 * typed event so downstream modules (Analytics, Journal, AI Coach,
 * Notifications) can subscribe without re-implementing math.
 */

import type { SymbolMeta, PaperMarket } from "@/lib/paper-trading/symbols";

export type Side = "long" | "short";

export type OrderKind =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit";

export type OrderStatus =
  | "pending"     // client-side, not submitted
  | "submitted"   // sent to engine, awaiting acceptance
  | "working"    // resting order in the book (limit/stop)
  | "filled"     // completely filled → tied to Position
  | "cancelled"
  | "rejected";

export type PositionStatus =
  | "open"
  | "partially_closed"
  | "closed"
  | "liquidated";

export type AccountStatus = "safe" | "warning" | "margin_call" | "stop_out";

export type OrderIntent = {
  symbol: string;
  side: Side;
  kind: OrderKind;
  quantity: number;               // lots
  limit_price?: number | null;
  stop_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  reduce_only?: boolean;
  client_id?: string;
  // Risk-based sizing hints (engine may ignore if quantity is set)
  risk_amount?: number | null;
  risk_pct?: number | null;
};

export type Order = OrderIntent & {
  id: string;
  status: OrderStatus;
  created_at: number;
  filled_price?: number | null;
  filled_at?: number | null;
  reject_reason?: string | null;
  position_id?: string | null;
};

export type Position = {
  id: string;
  symbol: string;
  side: Side;
  entry_price: number;
  quantity: number;               // remaining lots
  original_quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  commission: number;
  swap: number;
  realized_pnl: number;
  status: PositionStatus;
  opened_at: number;
  closed_at?: number | null;
  liquidation_price: number | null;
};

export type AccountConfig = {
  starting_balance: number;
  currency: string;
  leverage: number;               // account-level default; per-symbol overrides via leverage profile
  margin_call_level: number;      // percent
  stop_out_level: number;         // percent
  negative_balance_protection: boolean;
  max_trade_risk_pct: number;     // soft cap
  max_daily_risk_pct: number;
  max_open_positions: number;
  cost_profile: CostProfileId;
  leverage_profile: LeverageProfileId;
};

export type CostProfileId = "retail_forex" | "prop_firm" | "crypto_spot" | "crypto_futures" | "zero";
export type LeverageProfileId = "retail" | "prop" | "crypto" | "institutional";

export type PositionSnapshot = {
  position: Position;
  meta: SymbolMeta;
  current_price: number;
  floating_pnl: number;
  notional: number;
  margin: number;
  distance_to_liq: number | null; // % of price
};

export type AccountSnapshot = {
  balance: number;                 // realized-only cash
  equity: number;                  // balance + Σ floating
  floating_pnl: number;
  realized_pnl: number;
  net_pnl: number;                 // balance - starting_balance
  used_margin: number;
  free_margin: number;
  margin_level: number | null;     // %
  margin_ratio: number;            // used / equity, 0..1+
  buying_power: number;
  available_funds: number;         // alias of free_margin exposed for clarity
  status: AccountStatus;
  positions: PositionSnapshot[];
  orders: Order[];
  updated_at: number;
};

export type TradingEvent =
  | { type: "account_updated"; snapshot: AccountSnapshot }
  | { type: "order_submitted"; order: Order }
  | { type: "order_filled"; order: Order; position: Position }
  | { type: "order_cancelled"; order: Order }
  | { type: "order_rejected"; order: Order; reason: string }
  | { type: "position_opened"; position: Position }
  | { type: "position_modified"; position: Position; change: PositionChange }
  | { type: "position_closed"; position: Position; realized_pnl: number; reason: CloseReason }
  | { type: "margin_call"; snapshot: AccountSnapshot }
  | { type: "stop_out"; snapshot: AccountSnapshot; liquidated: Position[] }
  | { type: "liquidation"; position: Position; price: number }
  | { type: "balance_updated"; balance: number; delta: number };

export type PositionChange =
  | { kind: "increase"; added: number; new_avg_price: number }
  | { kind: "reduce"; removed: number; realized_pnl: number }
  | { kind: "reverse"; from_side: Side; new_position_id: string }
  | { kind: "modify_stops"; stop_loss: number | null; take_profit: number | null }
  | { kind: "partial_close"; fraction: number; realized_pnl: number }
  | { kind: "swap_charged"; amount: number }
  | { kind: "commission_charged"; amount: number };

export type CloseReason =
  | "manual"
  | "stop_loss"
  | "take_profit"
  | "stop_out"
  | "liquidation"
  | "margin_call"
  | "reverse"
  | "expired";

export type QuoteMap = Map<string, number>;

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  required_margin: number;
  free_margin_after: number;
  risk_amount: number;
  risk_pct: number;
  liquidation_price: number | null;
  buying_power_after: number;
  fill_price: number;
  cost_estimate: number;
};

export type { SymbolMeta, PaperMarket };
