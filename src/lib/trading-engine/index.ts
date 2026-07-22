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
