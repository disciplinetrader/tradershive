/**
 * Instrument-level trade validation — Phase 2.
 *
 * This layer sits IN FRONT of the core Trading Engine's `validateIntent`.
 * It catches configuration-driven rejections before we ever touch account
 * math: bad symbol, closed session, invalid tick size, unsupported asset
 * class for the broker profile, quantity out of range, etc.
 */

import { getInstrument, type InstrumentSpec } from "./instruments";
import { brokerSupports, resolveClassSettings, type BrokerProfile } from "./broker-profiles";
import { isMarketOpen } from "./sessions";
import { roundQuantity, stopDistanceOk } from "./tick-engine";

export type InstrumentValidationInput = {
  symbol: string;
  quantity: number;
  price?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  side: "long" | "short";
  broker: BrokerProfile;
  requestedLeverage?: number;
  at?: Date;
};

export type InstrumentValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  spec?: InstrumentSpec;
  normalizedQuantity?: number;
  effectiveLeverage?: number;
};

export function validateInstrumentIntent(input: InstrumentValidationInput): InstrumentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const spec = getInstrument(input.symbol);
  if (!spec) return { ok: false, errors: [`Unknown instrument: ${input.symbol}`], warnings };

  if (spec.status !== "active") errors.push(`Instrument ${spec.symbol} is ${spec.status}`);
  if (!brokerSupports(input.broker, spec.assetClass)) {
    errors.push(`Broker profile "${input.broker.label}" does not support ${spec.assetClass}`);
  }
  if (input.side === "short" && !spec.supportsShort) {
    errors.push(`${spec.symbol} cannot be sold short`);
  }

  // Trading session / holiday
  if (!input.broker.allowExtendedHours && !isMarketOpen(spec.sessions, spec.exchange, input.at ?? new Date())) {
    errors.push(`${spec.symbol} market is closed`);
  }

  // Quantity checks
  if (!(input.quantity > 0)) errors.push("Quantity must be positive");
  if (input.quantity < spec.minQuantity) errors.push(`Below min quantity ${spec.minQuantity}`);
  if (input.quantity > spec.maxQuantity) errors.push(`Above max quantity ${spec.maxQuantity}`);
  const normalized = roundQuantity(input.quantity, spec);
  if (Math.abs(normalized - input.quantity) > 1e-9) {
    warnings.push(`Quantity rounded to ${normalized} to match step ${spec.quantityStep}`);
  }
  if (!spec.supportsFractional && Math.floor(normalized) !== normalized) {
    errors.push(`${spec.symbol} does not support fractional quantities`);
  }

  // Price precision / tick size
  if (input.price != null && input.price > 0) {
    const remainder = Math.abs((input.price / spec.minTickSize) - Math.round(input.price / spec.minTickSize));
    if (remainder > 1e-6) warnings.push(`Price not aligned to tick size ${spec.minTickSize}`);
  }

  // Stop/limit distance
  if (input.price && input.stopLoss != null) {
    if (!stopDistanceOk(input.price, input.stopLoss, spec)) {
      errors.push(`Stop-loss must be at least ${spec.minStopDistanceTicks} ticks from price`);
    }
    if (input.side === "long" && input.stopLoss >= input.price) errors.push("Long SL must be below entry");
    if (input.side === "short" && input.stopLoss <= input.price) errors.push("Short SL must be above entry");
  }
  if (input.price && input.takeProfit != null) {
    if (!stopDistanceOk(input.price, input.takeProfit, spec)) {
      errors.push(`Take-profit must be at least ${spec.minStopDistanceTicks} ticks from price`);
    }
    if (input.side === "long" && input.takeProfit <= input.price) errors.push("Long TP must be above entry");
    if (input.side === "short" && input.takeProfit >= input.price) errors.push("Short TP must be below entry");
  }

  // Leverage
  const classSettings = resolveClassSettings(input.broker, spec.assetClass);
  const cap = classSettings.leverage;
  const requested = input.requestedLeverage ?? input.broker.defaultLeverage;
  const effectiveLeverage = spec.supportsLeverage ? Math.min(requested, cap) : 1;
  if (spec.supportsLeverage && requested > cap) {
    warnings.push(`Leverage capped at ${cap}:1 for ${spec.assetClass}`);
  }

  return {
    ok: errors.length === 0,
    errors, warnings, spec,
    normalizedQuantity: normalized,
    effectiveLeverage,
  };
}
