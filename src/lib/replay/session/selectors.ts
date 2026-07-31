/**
 * Phase 8A · selectors — the only thing the UI is allowed to read.
 *
 * Pure derivations over engine state. No trading logic, no formatting
 * decisions that belong to components.
 */

import type { ReplaySessionEngine } from "./engine";
import type { ReplayEvent } from "./events";
import type { SessionLifecycle } from "./model";

export interface TransportView {
  status: "idle" | "playing" | "paused" | "ended";
  lifecycle: SessionLifecycle;
  speed: number;
  canPlay: boolean;
  canPause: boolean;
  canStep: boolean;
  progress: number;
  cursor: number;
  total: number;
  candleIndex: number;
  barCount: number;
  marketTime: number;
}

export function selectTransport(engine: ReplaySessionEngine): TransportView {
  const { clock } = engine;
  return {
    status: clock.status,
    lifecycle: engine.meta.lifecycle,
    speed: clock.speed,
    canPlay: !clock.atEnd && clock.status !== "playing" && engine.meta.lifecycle !== "completed",
    canPause: clock.status === "playing",
    canStep: !clock.atEnd,
    progress: clock.progress,
    cursor: clock.index,
    total: clock.total,
    candleIndex: clock.candleIndex,
    barCount: engine.dataset.identity.barCount,
    marketTime: clock.timestamp,
  };
}

export interface DatasetView {
  label: string;
  provider: string;
  timeframe: string;
  timezone: string;
  bars: number;
  gaps: number;
  checksum: string;
  isSynthetic: boolean;
}

export function selectDataset(engine: ReplaySessionEngine): DatasetView {
  const d = engine.dataset.identity;
  return {
    label: `${d.symbol} · ${d.timeframe}`,
    provider: d.provider,
    timeframe: d.timeframe,
    timezone: d.timezone,
    bars: d.barCount,
    gaps: d.gaps.length,
    checksum: d.checksum.slice(0, 8),
    isSynthetic: d.isSynthetic,
  };
}

export interface AutosaveView {
  state: "idle" | "dirty" | "saving" | "error";
  savedAt: number;
  revision: number;
  dirty: boolean;
}

export function selectAutosave(engine: ReplaySessionEngine): AutosaveView {
  return {
    state: engine.autosave.state,
    savedAt: engine.autosave.savedAt,
    revision: engine.autosave.currentRevision,
    dirty: engine.autosave.isDirty,
  };
}

/** Newest-first activity feed, execution events only. */
export function selectExecutionEvents(engine: ReplaySessionEngine, limit = 50): ReplayEvent[] {
  return engine.log
    .list()
    .filter((e) => e.type === "order_placed" || e.type === "order_filled" || e.type === "order_cancelled" || e.type === "position_closed")
    .slice(-limit)
    .reverse();
}
