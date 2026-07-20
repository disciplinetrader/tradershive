/**
 * Tiny event bus so chart-side actions (right-click order, planner "Send",
 * keyboard shortcuts) can pre-fill and submit against the existing Order
 * Panel without prop drilling through the whole workspace.
 */
export type TradeIntent =
  | { kind: "prefill"; side: "long" | "short"; orderType: "market" | "limit" | "stop"; price?: number; sl?: number; tp?: number; lot?: number }
  | { kind: "submit"; side: "long" | "short"; orderType: "market" | "limit" | "stop"; price?: number; sl?: number; tp?: number; lot?: number }
  | { kind: "focus_side"; side: "long" | "short" };

type Listener = (i: TradeIntent) => void;
const listeners = new Set<Listener>();

export function emitTradeIntent(i: TradeIntent) {
  listeners.forEach((l) => { try { l(i); } catch { /* noop */ } });
}
export function onTradeIntent(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
