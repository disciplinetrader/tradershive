/**
 * Order Management — Phase 4 public entry point.
 *
 * Sits on top of the TradingEngine to provide professional order
 * placement, modification, execution, and management. The engine remains
 * the single source of truth.
 */

export { OrderManager } from "./manager";
export type { ManagedOrder, PlaceResult, PositionAdjustment } from "./manager";

export { computeMetrics, buildIntentFromTicket, notionalFor, marginFor } from "./ticket";
export { preflight } from "./preflight";
export type { PreflightReport } from "./preflight";

export { resolveSizing, derivedStopFromAtr, pipStopDistance } from "./sizing-modes";
export type { SizingContext, SizingOutcome } from "./sizing-modes";

export { createBracket, findFiringTargets, markTargetFilled, bracketSummary } from "./brackets";
export { computeTrailingStop, shouldTightenStop } from "./trailing";
export type { TrailingResult } from "./trailing";
export { evaluateBreakEven, moveToBreakEven } from "./breakeven";
export type { BreakEvenResult } from "./breakeven";

export { AuditLog, createRecord, transition, canTransition } from "./lifecycle";
export type { ManagedOrderRecord } from "./lifecycle";

export type {
  ManagedOrderState, AuditEntry, AuditKind,
  SizingConfig, SizingModeId,
  TrailingConfig, TrailingMethod,
  BreakEvenConfig,
  BracketPlan, BracketTarget,
  TicketInput, TicketMetrics,
} from "./types";

export { runPhase4Scenarios, summarizePhase4 } from "./scenarios";
export type { Phase4Scenario } from "./scenarios";
