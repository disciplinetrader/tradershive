/**
 * Phase 3 validation scenarios — Simulation Profiles & multi-account
 * consistency. Every scenario is deterministic and independent from
 * market-data providers; prices are pushed manually via `onPrice`.
 *
 * Prop-firm RULE coverage is not here. Two scenarios used to exercise a second
 * rules implementation that lived beside this harness; both the implementation
 * and the scenarios are gone, and their assertions now run against the
 * canonical evaluator in `src/lib/prop-challenges/__tests__/evaluator.test.ts`.
 * That matters because nothing calls `runPhase3Scenarios` — coverage parked
 * here does not execute. `scenarioPropFirmChallenge` below stays: it exercises
 * the TradingEngine under a prop profile, not the rule evaluator.
 */

import { TradingEngine } from "./engine";
import { accountConfigFromProfile, SIMULATION_PROFILES } from "./simulation-profiles";
import { SimulationAccountRegistry } from "./simulation-accounts";
import type { ScenarioResult } from "./scenarios-phase2";

function ok(name: string, details: string): ScenarioResult {
  return { name, ok: true, details };
}
function fail(name: string, details: string): ScenarioResult {
  return { name, ok: false, details };
}

function scenarioRetailForex(): ScenarioResult {
  const config = accountConfigFromProfile("retail_forex");
  const engine = new TradingEngine(config);
  engine.onPrice("EURUSD", 1.1);
  const { validation } = engine.submitOrder({
    symbol: "EURUSD", side: "long", kind: "market", quantity: 0.1,
    stop_loss: 1.095, take_profit: 1.11,
  });
  if (!validation.ok) return fail("retail_forex_open", validation.errors.join(", "));
  const snap = engine.snapshot();
  if (snap.positions.length !== 1) return fail("retail_forex_open", "position not opened");
  return ok("retail_forex_open", `margin=${validation.required_margin.toFixed(2)} risk=${validation.risk_pct.toFixed(2)}%`);
}

function scenarioPropFirmChallenge(): ScenarioResult {
  const config = accountConfigFromProfile("prop_firm_challenge");
  if (config.starting_balance !== 100_000) return fail("prop_challenge_balance", "expected 100k");
  if (config.stop_out_level !== 30) return fail("prop_challenge_stopout", "expected 30% stop-out");
  return ok("prop_challenge_defaults", "100k @ 100:1, 30% stop-out");
}

function scenarioCryptoFuturesNoNBP(): ScenarioResult {
  const config = accountConfigFromProfile("crypto_futures");
  if (config.negative_balance_protection) return fail("crypto_no_nbp", "NBP should be off");
  return ok("crypto_no_nbp", "crypto futures runs without NBP");
}

function scenarioOverrides(): ScenarioResult {
  const config = accountConfigFromProfile("scalping", {
    startingBalance: 50_000, leverage: 200, riskPerTradePct: 0.25,
  });
  if (config.starting_balance !== 50_000) return fail("scalping_override_balance", "override ignored");
  if (config.leverage !== 200) return fail("scalping_override_lev", "override ignored");
  if (config.max_trade_risk_pct !== 0.25) return fail("scalping_override_risk", "override ignored");
  return ok("scalping_override", "user overrides applied");
}

function scenarioMultiAccount(): ScenarioResult {
  const reg = new SimulationAccountRegistry();
  const a = reg.create({ label: "Retail",   profileId: "retail_forex" });
  const b = reg.create({ label: "Crypto",   profileId: "crypto_futures" });
  const c = reg.create({ label: "Champion", profileId: "championship" });
  reg.broadcastPrice("EURUSD", 1.1);
  reg.broadcastPrice("BTCUSD", 60_000);
  const snaps = reg.snapshotAll();
  if (snaps.length !== 3) return fail("multi_account_snap", "expected 3 snapshots");
  const startings = snaps.map((s) => s.snapshot.balance);
  const uniqueBalances = new Set(startings).size;
  if (uniqueBalances < 2) return fail("multi_account_independent", "accounts share state");
  reg.submit(a.meta.id, { symbol: "EURUSD", side: "long", kind: "market", quantity: 0.1 });
  const snap = reg.get(a.meta.id)!.engine.snapshot();
  const other = reg.get(b.meta.id)!.engine.snapshot();
  if (snap.positions.length !== 1 || other.positions.length !== 0) {
    return fail("multi_account_isolation", "trade leaked between accounts");
  }
  reg.remove(c.meta.id);
  if (reg.list().length !== 2) return fail("multi_account_remove", "account not removed");
  return ok("multi_account_isolation", "3 accounts, isolated state, price fan-out works");
}

function scenarioProfileCount(): ScenarioResult {
  const count = Object.keys(SIMULATION_PROFILES).length;
  if (count < 8) return fail("profile_registry", `only ${count} profiles registered`);
  return ok("profile_registry", `${count} simulation profiles available`);
}

export const PHASE3_SCENARIOS = [
  scenarioRetailForex,
  scenarioPropFirmChallenge,
  scenarioCryptoFuturesNoNBP,
  scenarioOverrides,
  scenarioMultiAccount,
  scenarioProfileCount,
];

export function runPhase3Scenarios(): ScenarioResult[] {
  return PHASE3_SCENARIOS.map((s) => {
    try { return s(); }
    catch (err) { return { name: s.name, ok: false, details: (err as Error).message }; }
  });
}

export function summarizePhase3(results: ScenarioResult[]): string {
  const pass = results.filter((r) => r.ok).length;
  return `${pass}/${results.length} Phase 3 scenarios passed`;
}
