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

/**
 * The last intent, kept briefly so a ticket that MOUNTS in response to one
 * still receives it.
 *
 * Emitting is synchronous, so an intent fired in the same tick that opens a
 * new surface reaches only the listeners that already existed. That is fine
 * while the only ticket is the permanently-mounted docked panel, and breaks
 * the moment a surface is created by the same action that fills it: the
 * floating window subscribes on mount, one tick too late, and opens blank —
 * side unselected, price empty — while the identical action on an
 * already-open ticket works. Two paths, two different tickets, from one
 * component.
 *
 * The window is deliberately short. It is long enough to cover a mount, far
 * too short to resurrect a stale intent on some later unrelated remount.
 */
const REPLAY_WINDOW_MS = 1000;
let last: { intent: TradeIntent; at: number } | null = null;

export function emitTradeIntent(i: TradeIntent) {
  // `submit` is an ACTION, not state to restore, and must never be replayed:
  // BattleStatusBar's Buy/Sell emits one, and a ticket mounting just after it
  // would place a second, unasked-for order. Only intents that describe how a
  // ticket should be filled in are latched.
  last = i.kind === "submit" ? null : { intent: i, at: Date.now() };
  listeners.forEach((l) => { try { l(i); } catch { /* noop */ } });
}

export function onTradeIntent(l: Listener) {
  listeners.add(l);
  if (last && Date.now() - last.at <= REPLAY_WINDOW_MS) {
    const pending = last.intent;
    // After the caller's effect has finished subscribing, and guarded on the
    // listener still being registered so an immediate unmount is a no-op.
    queueMicrotask(() => {
      if (listeners.has(l)) { try { l(pending); } catch { /* noop */ } }
    });
  }
  return () => listeners.delete(l);
}

/** Test seam — the latch is module state and would otherwise leak between specs. */
export function __resetTradeIntentLatch() { last = null; }
