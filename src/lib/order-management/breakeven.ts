/**
 * Break-even automation.
 *
 * Given a live price, returns the SL that should be pushed to the engine
 * once the trigger is reached (RR multiple, pip advance, or absolute
 * price). One-shot: `fired` prevents repeated updates.
 */

import { findSymbol } from "@/lib/paper-trading/symbols";
import type { Side } from "@/lib/trading-engine";
import type { BreakEvenConfig } from "./types";

export type BreakEvenResult = {
  config: BreakEvenConfig;
  newStopLoss: number | null;
  activated: boolean;
};

export function evaluateBreakEven(
  config: BreakEvenConfig,
  ctx: { symbol: string; side: Side; entry: number; stop: number | null; price: number },
): BreakEvenResult {
  if (config.fired) return { config, newStopLoss: null, activated: false };
  const meta = findSymbol(ctx.symbol);
  const pip = meta?.pipSize ?? 0.0001;
  let trigger = false;

  if (config.trigger === "rr" && ctx.stop != null && config.rr != null) {
    const risk = Math.abs(ctx.entry - ctx.stop);
    const advance = ctx.side === "long" ? ctx.price - ctx.entry : ctx.entry - ctx.price;
    trigger = advance >= risk * config.rr;
  } else if (config.trigger === "pips" && config.pips != null) {
    const advance = ctx.side === "long" ? ctx.price - ctx.entry : ctx.entry - ctx.price;
    trigger = advance >= config.pips * pip;
  } else if (config.trigger === "price" && config.price != null) {
    trigger = ctx.side === "long" ? ctx.price >= config.price : ctx.price <= config.price;
  }

  if (!trigger) return { config, newStopLoss: null, activated: false };

  const offsetPx = (config.offsetPips ?? 0) * pip * (ctx.side === "long" ? 1 : -1);
  return {
    config: { ...config, fired: true },
    newStopLoss: ctx.entry + offsetPx,
    activated: true,
  };
}

/** Manual break-even (no trigger evaluation). */
export function moveToBreakEven(
  symbol: string, side: Side, entry: number, offsetPips = 0,
): number {
  const meta = findSymbol(symbol);
  const pip = meta?.pipSize ?? 0.0001;
  return entry + offsetPips * pip * (side === "long" ? 1 : -1);
}
