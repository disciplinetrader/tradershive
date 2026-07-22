/**
 * Position sizing — Phase 2.
 *
 * Every method returns a quantity in LOTS, rounded to the instrument's
 * step, and clamped to min/max. Callers never compute pip values or
 * contract sizes manually — everything derives from the InstrumentSpec.
 */

import type { InstrumentSpec } from "./instruments";
import { pipsBetween, roundQuantity, ticksBetween } from "./tick-engine";

export type SizingMode =
  | { kind: "fixed_lots"; lots: number }
  | { kind: "fixed_units"; units: number }
  | { kind: "cash_risk"; cashAtRisk: number; entry: number; stop: number }
  | { kind: "percent_risk"; equity: number; percent: number; entry: number; stop: number }
  | { kind: "atr_risk"; equity: number; percent: number; entry: number; atr: number; atrMultiplier: number; side: "long" | "short" };

export type SizingResult = {
  quantity: number;
  units: number;
  notional: number;
  riskPerLot: number;
  totalRisk: number;
  reason?: string;
};

function clamp(spec: InstrumentSpec, qty: number): number {
  return Math.max(spec.minQuantity, Math.min(spec.maxQuantity, roundQuantity(qty, spec)));
}

export function calculateSize(spec: InstrumentSpec, mode: SizingMode, price?: number): SizingResult {
  const px = price ?? 0;
  const pack = (qty: number, riskPerLot = 0, totalRisk = 0, reason?: string): SizingResult => ({
    quantity: qty,
    units: qty * spec.contractSize,
    notional: px * qty * spec.contractSize,
    riskPerLot, totalRisk, reason,
  });

  switch (mode.kind) {
    case "fixed_lots": {
      return pack(clamp(spec, mode.lots));
    }
    case "fixed_units": {
      return pack(clamp(spec, mode.units / spec.contractSize));
    }
    case "cash_risk": {
      const ticks = ticksBetween(mode.entry, mode.stop, spec);
      if (ticks <= 0) return pack(spec.minQuantity, 0, 0, "invalid stop distance");
      const riskPerLot = ticks * spec.tickValue;
      const qty = clamp(spec, mode.cashAtRisk / riskPerLot);
      return pack(qty, riskPerLot, riskPerLot * qty);
    }
    case "percent_risk": {
      const cash = (mode.equity * mode.percent) / 100;
      const ticks = ticksBetween(mode.entry, mode.stop, spec);
      if (ticks <= 0) return pack(spec.minQuantity, 0, 0, "invalid stop distance");
      const riskPerLot = ticks * spec.tickValue;
      const qty = clamp(spec, cash / riskPerLot);
      return pack(qty, riskPerLot, riskPerLot * qty);
    }
    case "atr_risk": {
      const stopDistance = mode.atr * mode.atrMultiplier;
      const stop = mode.side === "long" ? mode.entry - stopDistance : mode.entry + stopDistance;
      return calculateSize(spec, { kind: "percent_risk", equity: mode.equity, percent: mode.percent, entry: mode.entry, stop });
    }
  }
}

/** Convenience: pip-based stop distance instead of absolute price. */
export function sizeFromPipStop(
  spec: InstrumentSpec,
  equity: number,
  riskPercent: number,
  stopPips: number,
): SizingResult {
  const cash = (equity * riskPercent) / 100;
  const riskPerLot = stopPips * spec.pipValuePerLot;
  if (riskPerLot <= 0) {
    return { quantity: spec.minQuantity, units: spec.minQuantity * spec.contractSize, notional: 0, riskPerLot: 0, totalRisk: 0, reason: "invalid stop" };
  }
  const qty = Math.max(spec.minQuantity, Math.min(spec.maxQuantity, roundQuantity(cash / riskPerLot, spec)));
  return { quantity: qty, units: qty * spec.contractSize, notional: 0, riskPerLot, totalRisk: riskPerLot * qty };
}
