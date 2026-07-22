/**
 * Position-sizing modes for the Order Ticket.
 *
 * Delegates to the paper-trading lot calculators so the ticket, engine,
 * and legacy trade panel all agree on the resulting quantity.
 */

import { findSymbol } from "@/lib/paper-trading/symbols";
import { lotForRisk, pipsBetween } from "@/lib/paper-trading/calculations";
import type { Side } from "@/lib/trading-engine";
import type { SizingConfig } from "./types";

export type SizingContext = {
  symbol: string;
  side: Side;
  entry: number;
  stopLoss: number | null;
  equity: number;
  freeMargin: number;
  leverage: number;
};

export type SizingOutcome = {
  lots: number;
  units: number;
  reason?: string;
};

function clampToMeta(symbol: string, lots: number): number {
  const meta = findSymbol(symbol);
  if (!meta) return Math.max(0, lots);
  const step = meta.lotStep || 0.01;
  const stepped = Math.max(meta.minLot, Math.round(lots / step) * step);
  return Math.min(meta.maxLot, Number(stepped.toFixed(4)));
}

export function resolveSizing(config: SizingConfig, ctx: SizingContext): SizingOutcome {
  const meta = findSymbol(ctx.symbol);
  if (!meta) return { lots: 0, units: 0, reason: `Unknown symbol ${ctx.symbol}` };
  const contract = meta.contractSize || 1;

  switch (config.mode) {
    case "fixed_lots": {
      const lots = clampToMeta(ctx.symbol, config.lots);
      return { lots, units: lots * contract };
    }
    case "fixed_units": {
      const lots = clampToMeta(ctx.symbol, config.units / contract);
      return { lots, units: lots * contract };
    }
    case "cash_risk": {
      if (!ctx.stopLoss) return { lots: 0, units: 0, reason: "Cash risk requires a stop loss" };
      const lots = lotForRisk(meta, ctx.entry, ctx.stopLoss, config.cashRisk);
      return { lots, units: lots * contract };
    }
    case "percent_risk": {
      if (!ctx.stopLoss) return { lots: 0, units: 0, reason: "Percent risk requires a stop loss" };
      const cash = ctx.equity * (config.percent / 100);
      const lots = lotForRisk(meta, ctx.entry, ctx.stopLoss, cash);
      return { lots, units: lots * contract };
    }
    case "atr_risk": {
      if (!(config.atr > 0) || !(config.atrMultiplier > 0)) {
        return { lots: 0, units: 0, reason: "ATR risk requires ATR and multiplier" };
      }
      const stopDist = config.atr * config.atrMultiplier;
      const stop = ctx.side === "long" ? ctx.entry - stopDist : ctx.entry + stopDist;
      const cash = ctx.equity * (config.percent / 100);
      const lots = lotForRisk(meta, ctx.entry, stop, cash);
      return { lots, units: lots * contract };
    }
    case "max_size": {
      if (!(ctx.entry > 0)) return { lots: 0, units: 0, reason: "Missing price" };
      const notionalCap = Math.max(0, ctx.freeMargin) * Math.max(1, ctx.leverage);
      const rawLots = notionalCap / (contract * ctx.entry);
      const lots = clampToMeta(ctx.symbol, rawLots);
      return { lots, units: lots * contract, reason: "Max size uses full available margin" };
    }
  }
}

export function derivedStopFromAtr(
  entry: number, side: Side, atr: number, multiplier: number,
): number {
  const dist = atr * multiplier;
  return side === "long" ? entry - dist : entry + dist;
}

/** Convenience helper: pip risk distance for a computed lot. */
export function pipStopDistance(symbol: string, a: number, b: number): number {
  const meta = findSymbol(symbol);
  if (!meta) return 0;
  return pipsBetween(meta, a, b);
}
