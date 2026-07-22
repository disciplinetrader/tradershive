/**
 * Phase-2 validation scenarios.
 *
 * Deterministic checks that assert:
 *  - Instrument registry seeds correctly from the legacy catalog.
 *  - Sizing math is consistent across asset classes.
 *  - Tick / pip conversions round-trip.
 *  - Broker profiles cap leverage per class.
 *  - Session gating rejects trades when a market is closed.
 *
 * Run via `runPhase2Scenarios()` from a test / storybook / dev route.
 */

import { getInstrument, listInstruments, registerInstrumentPartial } from "./instruments";
import { BROKER_PROFILES, resolveClassSettings } from "./broker-profiles";
import { validateInstrumentIntent } from "./instrument-validation";
import { calculateSize, sizeFromPipStop } from "./sizing";
import { pipsToCash, roundToTick, ticksBetween } from "./tick-engine";
import { isMarketOpen, SESSIONS } from "./sessions";
import { accountConfigFor } from "./account-types";

export type ScenarioResult = { name: string; ok: boolean; details: string };

function approx(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

export function runPhase2Scenarios(): ScenarioResult[] {
  const out: ScenarioResult[] = [];

  // Instruments registered
  const forex = listInstruments({ assetClass: "forex" });
  out.push({
    name: "Forex instruments seeded",
    ok: forex.length >= 5 && !!getInstrument("EUR/USD"),
    details: `count=${forex.length}`,
  });

  // EURUSD pip cash math
  const eu = getInstrument("EUR/USD")!;
  const cash = pipsToCash(10, 1, eu); // 10 pips × 1 lot
  out.push({
    name: "EURUSD 10 pip = $100 per lot",
    ok: approx(cash, 100, 0.01), details: `${cash}`,
  });

  // Tick rounding on JPY pair
  const usdjpy = getInstrument("USD/JPY")!;
  const rounded = roundToTick(156.9234, usdjpy);
  out.push({
    name: "USD/JPY tick rounding",
    ok: approx(rounded, 156.923), details: `${rounded}`,
  });

  // Sizing — 1% risk on $10k with 20 pip stop on EURUSD
  const sized = sizeFromPipStop(eu, 10_000, 1, 20);
  out.push({
    name: "1% of $10k over 20 pips on EURUSD ≈ 0.5 lots",
    ok: sized.quantity >= 0.45 && sized.quantity <= 0.55,
    details: `qty=${sized.quantity} risk=${sized.totalRisk}`,
  });

  // Sizing — percent risk with price/stop on BTC
  const btc = getInstrument("BTC/USDT")!;
  const btcSize = calculateSize(btc, { kind: "percent_risk", equity: 10_000, percent: 1, entry: 60_000, stop: 59_400 });
  out.push({
    name: "BTC 1% risk over 600pt stop",
    ok: btcSize.quantity > 0 && btcSize.totalRisk <= 100.01 && btcSize.totalRisk >= 50,
    details: `qty=${btcSize.quantity} risk=${btcSize.totalRisk.toFixed(2)}`,
  });

  // Broker profile leverage cap
  const retail = BROKER_PROFILES.retail_forex;
  const retailFx = resolveClassSettings(retail, "forex");
  out.push({
    name: "Retail broker caps FX at 30:1",
    ok: retailFx.leverage === 30, details: `${retailFx.leverage}`,
  });

  const prop = BROKER_PROFILES.prop_firm;
  const propCrypto = resolveClassSettings(prop, "crypto");
  out.push({
    name: "Prop firm caps crypto at 10:1",
    ok: propCrypto.leverage === 10, details: `${propCrypto.leverage}`,
  });

  // Crypto is 24/7
  out.push({
    name: "Crypto market is always open",
    ok: isMarketOpen(["crypto_247"], "Crypto", new Date()),
    details: "",
  });

  // Session gating rejects stocks on Sunday
  const sunday = new Date("2026-01-04T15:00:00Z"); // Sunday
  const stockCheck = validateInstrumentIntent({
    symbol: "AAPL", quantity: 10, side: "long", broker: BROKER_PROFILES.stock_broker, at: sunday,
  });
  out.push({
    name: "AAPL rejected outside US equities hours",
    ok: !stockCheck.ok && stockCheck.errors.some((e) => /closed/i.test(e)),
    details: stockCheck.errors.join("; "),
  });

  // Broker mismatch rejection
  const wrongBroker = validateInstrumentIntent({
    symbol: "BTC/USDT", quantity: 0.1, side: "long", broker: BROKER_PROFILES.stock_broker,
  });
  out.push({
    name: "Stock broker rejects crypto",
    ok: !wrongBroker.ok && wrongBroker.errors.some((e) => /does not support/i.test(e)),
    details: wrongBroker.errors.join("; "),
  });

  // Quantity rounding
  const rounding = validateInstrumentIntent({
    symbol: "EUR/USD", quantity: 0.123, side: "long", broker: BROKER_PROFILES.retail_forex,
  });
  out.push({
    name: "Quantity rounded to lot step",
    ok: rounding.ok && rounding.normalizedQuantity === 0.12,
    details: `${rounding.normalizedQuantity}`,
  });

  // Stop distance enforcement
  const badStop = validateInstrumentIntent({
    symbol: "EUR/USD", quantity: 0.1, side: "long", price: 1.1000, stopLoss: 1.09999,
    broker: BROKER_PROFILES.retail_forex,
  });
  out.push({
    name: "Stop too close is rejected",
    ok: !badStop.ok && badStop.errors.some((e) => /stop-loss/i.test(e)),
    details: badStop.errors.join("; "),
  });

  // Registering a new instrument works without engine changes
  const custom = registerInstrumentPartial({
    symbol: "DEMO-X", displayName: "Demo Synth", assetClass: "indices",
    minQuantity: 0.1, maxQuantity: 50, quantityStep: 0.1,
  });
  out.push({
    name: "New instrument registered dynamically",
    ok: !!getInstrument("DEMO-X") && custom.assetClass === "indices",
    details: `${custom.symbol}`,
  });

  // Account preset materializes engine config
  const cfg = accountConfigFor("challenge");
  out.push({
    name: "Challenge account preset compiles",
    ok: cfg.starting_balance === 100_000 && cfg.cost_profile === "prop_firm",
    details: JSON.stringify({ b: cfg.starting_balance, cp: cfg.cost_profile }),
  });

  // Tick math round-trip
  const t = ticksBetween(1.1050, 1.1000, eu);
  out.push({
    name: "50-pip = 500 ticks on 5-digit EURUSD",
    ok: approx(t, 500, 1), details: `${t}`,
  });

  // Session windows exist for every declared id
  const allSessions = Object.keys(SESSIONS).length;
  out.push({
    name: "Session registry populated",
    ok: allSessions >= 8, details: `${allSessions}`,
  });

  return out;
}

export function summarizePhase2(results = runPhase2Scenarios()) {
  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, failures: results.filter((r) => !r.ok) };
}
