/**
 * Phase 8A · autosave policy.
 *
 * Requirements this encodes:
 *  · Execution state is saved continuously, not only at the end.
 *  · Saves are incremental and coalesced — playback must never stutter.
 *  · Certain events force an immediate save (a fill or a close is money).
 *  · A failed save is retried with backoff and never loses newer state:
 *    the flusher always writes the LATEST snapshot, not a queued stale one.
 */

import type { ReplayEventType } from "./events";
import type { SessionSnapshot } from "./model";

export interface AutosavePolicy {
  /** Save at most this often, in ms of real time. */
  intervalMs: number;
  /** Force a save after this many observations, whatever the interval. */
  everyObservations: number;
  /** Event types that flush immediately. */
  criticalEvents: ReplayEventType[];
  maxRetries: number;
  retryBackoffMs: number;
}

export const DEFAULT_AUTOSAVE_POLICY: AutosavePolicy = {
  intervalMs: 5_000,
  everyObservations: 400,
  criticalEvents: [
    "order_placed",
    "order_filled",
    "order_cancelled",
    "position_closed",
    "session_started",
    "session_completed",
    "session_abandoned",
  ],
  maxRetries: 4,
  retryBackoffMs: 1_000,
};

export type AutosaveState = "idle" | "dirty" | "saving" | "error";

export type SnapshotProvider = () => SessionSnapshot;
export type SnapshotWriter = (snapshot: SessionSnapshot) => Promise<void>;

export class AutosaveEngine {
  private policy: AutosavePolicy;
  private provider: SnapshotProvider;
  private writer: SnapshotWriter;
  private now: () => number;

  private dirty = false;
  private forced = false;
  private saving = false;
  private lastSavedAt = 0;
  private observationsSinceSave = 0;
  private failures = 0;
  private revision = 0;
  private stateValue: AutosaveState = "idle";
  private listeners = new Set<() => void>();

  constructor(opts: {
    provider: SnapshotProvider;
    writer: SnapshotWriter;
    policy?: Partial<AutosavePolicy>;
    now?: () => number;
    revision?: number;
  }) {
    this.policy = { ...DEFAULT_AUTOSAVE_POLICY, ...opts.policy };
    this.provider = opts.provider;
    this.writer = opts.writer;
    this.now = opts.now ?? Date.now;
    this.revision = opts.revision ?? 0;
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const l of this.listeners) l(); }

  get state(): AutosaveState { return this.stateValue; }
  get savedAt() { return this.lastSavedAt; }
  get currentRevision() { return this.revision; }
  get isDirty() { return this.dirty; }

  /** Called after each processed batch. */
  markObservations(count: number) {
    if (count <= 0) return;
    this.observationsSinceSave += count;
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
    if (this.stateValue === "idle") this.stateValue = "dirty";
    this.emit();
  }

  markEvent(type: ReplayEventType) {
    this.markDirty();
    if (this.policy.criticalEvents.includes(type)) this.forced = true;
  }

  private due(): boolean {
    if (!this.dirty || this.saving) return false;
    if (this.forced) return true;
    if (this.observationsSinceSave >= this.policy.everyObservations) return true;
    const wait = this.failures ? this.policy.retryBackoffMs * 2 ** (this.failures - 1) : this.policy.intervalMs;
    return this.now() - this.lastSavedAt >= wait;
  }

  /** Drive from the same loop as the clock. Safe to call every frame. */
  async maybeFlush(): Promise<boolean> {
    if (!this.due()) return false;
    return this.flush();
  }

  /** Write the latest snapshot now (pause, unload, manual save). */
  async flush(): Promise<boolean> {
    if (this.saving) return false;
    this.saving = true;
    this.stateValue = "saving";
    this.emit();

    // Snapshot is taken AFTER we decide to save, so a save always carries the
    // newest state rather than whatever was current when it was scheduled.
    const snapshot = { ...this.provider(), revision: this.revision + 1, savedAt: this.now() };
    try {
      await this.writer(snapshot);
      this.revision = snapshot.revision;
      this.lastSavedAt = snapshot.savedAt;
      this.dirty = false;
      this.forced = false;
      this.observationsSinceSave = 0;
      this.failures = 0;
      this.stateValue = "idle";
      return true;
    } catch {
      this.failures++;
      this.stateValue = this.failures >= this.policy.maxRetries ? "error" : "dirty";
      this.lastSavedAt = this.now();
      return false;
    } finally {
      this.saving = false;
      this.emit();
    }
  }
}
