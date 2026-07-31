/**
 * Phase 8A · Replay Session Engine — public surface.
 *
 * Architecture:
 *   Historical Dataset → Replay Session → Replay Clock →
 *   Canonical Observation Pipeline → Execution Engine →
 *   Orders → Positions → Closed Trades → Autosave
 *
 * The session owns the clock and the lifecycle. The execution engine owns
 * every trading behaviour. Nothing here duplicates it.
 */

export {
  buildDataset, checksumCandles, normalizeCandles, detectGaps, datasetMatches,
  candleIndexForObservation, observationIndexForTime, DATASET_VERSION,
} from "./dataset";
export type { ReplayDataset, DatasetIdentity, DatasetGap, BuildDatasetInput } from "./dataset";

export { ReplayClock, clampSpeed, MIN_SPEED, MAX_SPEED, CANDLES_PER_SECOND_AT_1X } from "./clock";
export type { ClockSnapshot, ClockStatus, ReplayObservation } from "./clock";

export { ReplayEventLog } from "./events";
export type { ReplayEvent, ReplayEventType } from "./events";

export { createSessionMeta, DEFAULT_VIEWPORT, SESSION_SNAPSHOT_VERSION, SNAPSHOT_SETTINGS_KEY } from "./model";
export type {
  ReplaySessionMeta, SessionLifecycle, SessionPurpose, SessionSnapshot, ViewportState, CreateSessionInput,
} from "./model";

export { canTransition, assertTransition, validateDataset, validateSnapshot } from "./validation";
export type { DatasetValidation, ResumeVerdict } from "./validation";

export { AutosaveEngine, DEFAULT_AUTOSAVE_POLICY } from "./autosave";
export type { AutosavePolicy, AutosaveState } from "./autosave";

export { ReplaySessionEngine } from "./engine";
export type { EngineOptions } from "./engine";

export { resumeSession, pickFreshestSnapshot } from "./resume";
export type { ResumeResult, ResumeOptions } from "./resume";

export { selectTransport, selectDataset, selectAutosave, selectExecutionEvents } from "./selectors";
export type { TransportView, DatasetView, AutosaveView } from "./selectors";

export { loadSnapshot, persistSnapshot, readLocalSnapshot, writeLocalSnapshot, clearLocalSnapshot } from "./persistence";
