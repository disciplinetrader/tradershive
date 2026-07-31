/**
 * Phase 8A · canonical Replay Session model.
 *
 * The session owns identity, lifecycle and the clock. It owns NO trading
 * behaviour: orders, fills, positions, closed trades and journal derivation
 * all belong to the canonical execution engine in `@/lib/chart/orders`.
 */

import type { PositionOrder } from "@/lib/chart/orders/model";
import type { Drawing } from "@/lib/chart/drawings/types";
import type { ClockSnapshot } from "./clock";
import type { DatasetIdentity } from "./dataset";
import type { ReplayEvent } from "./events";

export const SESSION_SNAPSHOT_VERSION = 1;
/** Key under `replay_sessions.settings` holding the engine snapshot. */
export const SNAPSHOT_SETTINGS_KEY = "engine_v1";

export type SessionLifecycle =
  | "created"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "abandoned";

export type SessionPurpose = "practice" | "backtest" | "review" | "challenge";

export interface ReplaySessionMeta {
  id: string;
  userId: string;
  title: string;
  purpose: SessionPurpose;
  lifecycle: SessionLifecycle;
  dataset: DatasetIdentity;
  /** Starting balance of the simulated account, in account currency. */
  startingBalance: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  /** Origin trade/journal entry when the session was launched from Journal X. */
  sourceTradeId: string | null;
  sourceJournalId: string | null;
}

export interface ViewportState {
  /** "follow" keeps the newest bar pinned; "manual" respects trader panning. */
  mode: "follow" | "manual";
  barsVisible: number;
  rightOffset: number;
}

export const DEFAULT_VIEWPORT: ViewportState = { mode: "follow", barsVisible: 180, rightOffset: 12 };

/**
 * Everything needed to reconstruct a session byte-for-byte on another
 * device: identity, clock position, full execution state and the tail of
 * the event log.
 */
export interface SessionSnapshot {
  version: number;
  meta: ReplaySessionMeta;
  clock: ClockSnapshot;
  viewport: ViewportState;
  orders: PositionOrder[];
  drawings: Drawing[];
  /** Append-only log tail; older entries live server-side in replay_events. */
  events: ReplayEvent[];
  /** Monotonic save counter — the conflict resolver's tie-break. */
  revision: number;
  savedAt: number;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  title: string;
  dataset: DatasetIdentity;
  purpose?: SessionPurpose;
  startingBalance?: number;
  sourceTradeId?: string | null;
  sourceJournalId?: string | null;
  now?: number;
}

export function createSessionMeta(input: CreateSessionInput): ReplaySessionMeta {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    userId: input.userId,
    title: input.title,
    purpose: input.purpose ?? "practice",
    lifecycle: "created",
    dataset: input.dataset,
    startingBalance: input.startingBalance ?? 10_000,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    sourceTradeId: input.sourceTradeId ?? null,
    sourceJournalId: input.sourceJournalId ?? null,
  };
}
