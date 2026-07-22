/**
 * Pre-flight validation — layered over engine validation.
 *
 * Adds instrument-status checks, session checks, and stop-distance checks
 * before delegating to the pure engine validator. Callers get a single
 * report combining both layers.
 */

import { findSymbol } from "@/lib/paper-trading/symbols";
import {
  validateIntent, getInstrument, isMarketOpen,
} from "@/lib/trading-engine";
import type {
  AccountConfig, AccountSnapshot, OrderIntent, ValidationResult,
} from "@/lib/trading-engine";

export type PreflightReport = ValidationResult & {
  session_open: boolean;
  instrument_status: "active" | "disabled" | "unknown";
};

const DEFAULT_MIN_STOP_TICKS = 5;

export function preflight(
  config: AccountConfig,
  snapshot: AccountSnapshot,
  intent: OrderIntent,
  currentPrice: number,
  now: Date = new Date(),
): PreflightReport {
  const base = validateIntent(config, snapshot, intent, currentPrice);
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  const meta = findSymbol(intent.symbol);
  const spec = getInstrument(intent.symbol);

  const sessionOpen = spec ? isMarketOpen(spec.sessions, spec.exchange, now) : true;
  if (!sessionOpen) errors.push(`Market for ${intent.symbol} is currently closed`);

  const status: PreflightReport["instrument_status"] = spec
    ? spec.status === "active" ? "active" : "disabled"
    : "unknown";
  if (spec && spec.status !== "active") {
    errors.push(`Instrument ${intent.symbol} is ${spec.status}`);
  }

  // Minimum stop distance in price points.
  if (meta && meta.pipSize > 0) {
    const minDist = meta.pipSize * DEFAULT_MIN_STOP_TICKS;
    const refPx = base.fill_price;
    if (intent.stop_loss != null) {
      const dist = Math.abs(refPx - intent.stop_loss);
      if (dist < minDist) errors.push(`Stop loss too close to market (min ${minDist.toFixed(meta.decimals)})`);
    }
    if (intent.take_profit != null) {
      const dist = Math.abs(refPx - intent.take_profit);
      if (dist < minDist) errors.push(`Take profit too close to market (min ${minDist.toFixed(meta.decimals)})`);
    }
    if ((intent.kind === "limit" || intent.kind === "stop_limit") && intent.limit_price != null) {
      const dist = Math.abs(refPx - intent.limit_price);
      if (dist < minDist) warnings.push("Limit price is very close to market");
    }
  }

  return {
    ...base,
    ok: errors.length === 0,
    errors,
    warnings,
    session_open: sessionOpen,
    instrument_status: status,
  };
}
