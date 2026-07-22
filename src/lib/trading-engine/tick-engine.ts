/**
 * Tick / Pip Engine — Phase 2.
 *
 * Centralized calculations for price rounding, tick math, pip conversion,
 * and cash value per price move. Every function is instrument-driven so we
 * never hardcode "0.0001 = one pip" or "0.01 = one tick".
 */

import type { InstrumentSpec } from "./instruments";

export function roundToTick(price: number, spec: InstrumentSpec): number {
  const t = spec.minTickSize;
  return Math.round(price / t) * t;
}

export function roundQuantity(qty: number, spec: InstrumentSpec): number {
  const s = spec.quantityStep;
  const rounded = Math.round(qty / s) * s;
  return Number(rounded.toFixed(spec.quantityPrecision));
}

export function priceToTicks(price: number, spec: InstrumentSpec): number {
  return price / spec.minTickSize;
}

export function ticksBetween(a: number, b: number, spec: InstrumentSpec): number {
  return Math.abs(a - b) / spec.minTickSize;
}

/** Pips between two prices (positive). */
export function pipsBetween(a: number, b: number, spec: InstrumentSpec): number {
  return Math.abs(a - b) / spec.pipSize;
}

/** Convert price move into cash P&L for given quantity (lots). */
export function moveToCash(priceMove: number, quantity: number, spec: InstrumentSpec): number {
  const ticks = priceMove / spec.minTickSize;
  return ticks * spec.tickValue * quantity;
}

/** Convert pip move into cash P&L (lots). */
export function pipsToCash(pips: number, quantity: number, spec: InstrumentSpec): number {
  return pips * spec.pipValuePerLot * quantity;
}

/** Notional value in quote currency. */
export function notional(price: number, quantity: number, spec: InstrumentSpec): number {
  return price * quantity * spec.contractSize;
}

export function formatPrice(price: number, spec: InstrumentSpec): string {
  return price.toFixed(spec.pricePrecision);
}

export function formatQuantity(qty: number, spec: InstrumentSpec): string {
  return qty.toFixed(spec.quantityPrecision);
}

/** Enforce that a stop or limit sits at least `minStopDistanceTicks` away. */
export function stopDistanceOk(reference: number, stop: number, spec: InstrumentSpec): boolean {
  return ticksBetween(reference, stop, spec) >= spec.minStopDistanceTicks;
}
