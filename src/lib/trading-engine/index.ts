/**
 * Trading Engine public entry point.
 *
 * Consumers should import from `@/lib/trading-engine` — everything else is
 * an internal module. This keeps the boundary between Trading Engine
 * consumers (Trading Workspace, Replay, Analytics, Journal, Championships,
 * AI Coach) and its internal wiring narrow.
 */

export { TradingEngine, defaultConfig } from "./engine";
export { COST_PROFILES, computeFill, dailySwap } from "./costs";
export { LEVERAGE_PROFILES, effectiveLeverage, maintenanceMargin } from "./leverage";
export { EventBus } from "./events";
export { validateIntent } from "./validation";
export type {
  Side, OrderKind, OrderStatus, PositionStatus, AccountStatus,
  Order, OrderIntent, Position, PositionSnapshot, AccountConfig,
  AccountSnapshot, TradingEvent, PositionChange, CloseReason,
  ValidationResult, CostProfileId, LeverageProfileId, QuoteMap,
} from "./types";

// Scenario harness for QA / storybook / manual smoke.
export { runScenarios, SCENARIOS } from "./scenarios";

// Phase 2 — Instruments, brokers, sessions, sizing, validation.
export {
  getInstrument, requireInstrument, listInstruments,
  registerInstrument, registerInstrumentPartial, CLASS_DEFAULTS,
} from "./instruments";
export type {
  InstrumentSpec, AssetClass, LotType, MarginClass, InstrumentStatus, SessionId,
} from "./instruments";
export { ASSET_CLASS_DEFAULTS, assetClassDefaults } from "./asset-classes";
export type { AssetClassDefaults, ExecutionModel, LiquidationRule } from "./asset-classes";
export { BROKER_PROFILES, getBrokerProfile, brokerSupports, resolveClassSettings } from "./broker-profiles";
export type { BrokerProfile, BrokerProfileId } from "./broker-profiles";
export { SESSIONS, HOLIDAYS, isSessionOpen, isMarketOpen, nextSessionOpen } from "./sessions";
export type { SessionWindow } from "./sessions";
export {
  roundToTick, roundQuantity, priceToTicks, ticksBetween, pipsBetween,
  moveToCash, pipsToCash, notional, formatPrice, formatQuantity, stopDistanceOk,
} from "./tick-engine";
export { calculateSize, sizeFromPipStop } from "./sizing";
export type { SizingMode, SizingResult } from "./sizing";
export { validateInstrumentIntent } from "./instrument-validation";
export type { InstrumentValidationInput, InstrumentValidationResult } from "./instrument-validation";
export { ACCOUNT_TYPES, accountConfigFor } from "./account-types";
export type { AccountKind, AccountTypeSpec } from "./account-types";
export { runPhase2Scenarios, summarizePhase2 } from "./scenarios-phase2";
export type { ScenarioResult } from "./scenarios-phase2";

// Phase 3 — Simulation profiles, multi-account registry, prop-firm rules.
export {
  SIMULATION_PROFILES, getSimulationProfile, listSimulationProfiles,
  accountConfigFromProfile,
} from "./simulation-profiles";
export type { SimulationProfile, SimulationProfileId } from "./simulation-profiles";
export {
  SimulationAccountRegistry, simulationAccounts,
} from "./simulation-accounts";
export type {
  SimulationAccount, SimulationAccountId, SimulationAccountMeta, CreateAccountInput,
} from "./simulation-accounts";
export { evaluatePropFirmRules, isPropFirmCleared } from "./prop-firm-rules";
export type { PropFirmRules, RuleBreach, RuleEvaluation, DailyStat } from "./prop-firm-rules";
export { runPhase3Scenarios, summarizePhase3, PHASE3_SCENARIOS } from "./scenarios-phase3";
