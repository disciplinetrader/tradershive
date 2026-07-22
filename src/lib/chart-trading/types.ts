/**
 * Types for the Chart Trading overlay (Phase 5).
 *
 * The overlay speaks in these shapes; every persistence call converts them
 * back into paper_trades / paper_orders rows via `persist.ts`.
 */

export type ChartSide = "long" | "short";

export type ChartLineKind =
  | "position-entry"
  | "position-sl"
  | "position-tp"
  | "position-trailing"
  | "pending-trigger"
  | "pending-limit"
  | "pending-sl"
  | "pending-tp"
  | "draft-entry"
  | "draft-sl"
  | "draft-tp";

export interface ChartLine {
  id: string;                 // stable per line (e.g. `${tradeId}-sl`)
  kind: ChartLineKind;
  price: number;
  label: string;
  color: string;
  editable: boolean;
  dashed?: boolean;
}

export type DraftOrderType =
  | "buy_market"
  | "sell_market"
  | "buy_limit"
  | "sell_limit"
  | "buy_stop"
  | "sell_stop";

export interface ChartDraft {
  side: ChartSide;
  orderType: DraftOrderType;
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
}
