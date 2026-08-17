/**
 * Phase 8A · the Replay Session Engine.
 *
 * Composition, not reimplementation:
 *
 *   ReplayClock ──observations──► runObservation (CANONICAL execution engine)
 *        │                              │
 *        │                              ├─► PositionOrderStore  (orders/positions)
 *        │                              └─► ClosedTradeStore    (closed trades)
 *        ├──► ReplayEventLog  (audit)
 *        └──► AutosaveEngine  (durable, resumable)
 *
 * There is no Replay-specific order model, fill model, position manager,
 * risk engine or trade derivation here — and there must never be one.
 */

import { runObservation } from "@/lib/chart/orders/observation";
import { NO_COSTS, type ExecutionCosts } from "@/lib/chart/orders/engine";
import type { OrderStores } from "@/lib/chart/orders/service";
import type { PositionOrder } from "@/lib/chart/orders/model";
import { ReplayClock, type ClockSnapshot, type ReplayObservation } from "./clock";
import type { ReplayDataset } from "./dataset";
import { ReplayEventLog, type ReplayEventType } from "./events";
import {
  DEFAULT_VIEWPORT,
  SESSION_SNAPSHOT_VERSION,
  type ReplaySessionMeta,
  type SessionLifecycle,
  type SessionSnapshot,
  type ViewportState,
} from "./model";
import { assertTransition } from "./validation";
import { AutosaveEngine, type AutosavePolicy, type SnapshotWriter } from "./autosave";

export interface EngineOptions {
  meta: ReplaySessionMeta;
  dataset: ReplayDataset;
  stores: OrderStores;
  /** Asset class recorded on closed trades. */
  market?: string | null;
  /**
   * Simulated broker friction for THIS session, snapshotted at creation.
   *
   * Part of the session, not a live setting: the dataset is checksummed so a
   * replay is reproducible, and costs read from localStorage at tick time
   * would mean the same session fills differently for two traders, and
   * differently again for one trader who changed the setting mid-run.
   */
  costs?: ExecutionCosts;
  writer?: SnapshotWriter;
  autosavePolicy?: Partial<AutosavePolicy>;
  clock?: Partial<ClockSnapshot>;
  /**
   * Whether exhausting the dataset completes the session. Default true.
   *
   * A battle sets this false: its lifecycle is owned by `battles.end_at`, not
   * by the tape. Auto-completing would end a competitor's session early and
   * desynchronise them from everyone else. Running out of tape before `end_at`
   * is prevented at creation instead (`validateBattleReplayRange`).
   */
  completeOnExhaustion?: boolean;
  viewport?: ViewportState;
  events?: ReplayEventLog;
  revision?: number;
  now?: () => number;
}

export class ReplaySessionEngine {
  readonly clock: ReplayClock;
  readonly log: ReplayEventLog;
  readonly autosave: AutosaveEngine;
  readonly dataset: ReplayDataset;

  private metaValue: ReplaySessionMeta;
  private stores: OrderStores;
  private market: string | null;
  private costs: ExecutionCosts;
  private viewportValue: ViewportState;
  private listeners = new Set<() => void>();
  private now: () => number;
  private completeOnExhaustion: boolean;

  constructor(opts: EngineOptions) {
    this.metaValue = { ...opts.meta };
    this.dataset = opts.dataset;
    this.stores = opts.stores;
    this.market = opts.market ?? null;
    this.costs = opts.costs ?? NO_COSTS;
    this.now = opts.now ?? Date.now;
    this.completeOnExhaustion = opts.completeOnExhaustion ?? true;
    this.clock = new ReplayClock(opts.dataset, opts.clock);
    this.log = opts.events ?? new ReplayEventLog();
    this.viewportValue = opts.viewport ?? { ...DEFAULT_VIEWPORT };
    this.autosave = new AutosaveEngine({
      provider: () => this.snapshot(),
      writer: opts.writer ?? (async () => {}),
      policy: opts.autosavePolicy,
      now: this.now,
      revision: opts.revision ?? 0,
    });
    if (this.metaValue.lifecycle === "created") this.transition("ready");
  }

  // ── observation ────────────────────────────────────────────────────────
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const l of this.listeners) l(); }

  get meta(): ReplaySessionMeta { return this.metaValue; }
  get viewport(): ViewportState { return this.viewportValue; }
  get isFinished() { return this.metaValue.lifecycle === "completed" || this.clock.atEnd; }

  setViewport(patch: Partial<ViewportState>) {
    this.viewportValue = { ...this.viewportValue, ...patch };
    this.autosave.markDirty();
    this.emit();
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  transition(to: SessionLifecycle) {
    assertTransition(this.metaValue.lifecycle, to);
    if (this.metaValue.lifecycle === to) return;
    this.metaValue = { ...this.metaValue, lifecycle: to, updatedAt: this.now() };
    if (to === "running" && !this.metaValue.startedAt) this.metaValue.startedAt = this.now();
    if (to === "completed") this.metaValue.completedAt = this.now();
    this.emit();
  }

  play() {
    if (this.clock.atEnd) return;
    const firstStart = this.metaValue.startedAt === null;
    this.transition("running");
    this.clock.play();
    this.record(firstStart ? "session_started" : "playback_started");
    this.emit();
  }

  pause() {
    if (this.clock.status !== "playing") return;
    this.clock.pause();
    this.transition("paused");
    this.record("playback_paused");
    this.emit();
  }

  setSpeed(speed: number) {
    const applied = this.clock.setSpeed(speed);
    this.record("speed_changed", { speed: applied });
    this.emit();
    return applied;
  }

  complete(reason: "ended" | "manual" = "manual") {
    if (this.metaValue.lifecycle === "completed") return;
    this.clock.pause();
    this.transition("completed");
    this.record("session_completed", { reason });
    this.emit();
  }

  abandon() {
    this.clock.pause();
    this.transition("abandoned");
    this.record("session_abandoned");
    this.emit();
  }

  // ── transport (every path funnels through consume) ─────────────────────
  step() { return this.consume(this.clock.stepObservation()); }
  stepCandle() { return this.consume(this.clock.stepCandle()); }
  skipCandles(n: number) { return this.consume(this.clock.skipCandles(n)); }
  seekForwardTo(timeMs: number) { return this.consume(this.clock.seekForwardTo(timeMs)); }
  /** Advance to an absolute observation index — how a battle applies its cursor. */
  seekForwardToIndex(index: number) { return this.consume(this.clock.seekForwardToIndex(index)); }
  tick(realDeltaMs: number) { return this.consume(this.clock.advance(realDeltaMs)); }

  /**
   * Feed observations to the canonical execution engine, in order, exactly
   * once each, recording every execution consequence in the log.
   */
  private consume(observations: ReplayObservation[]): PositionOrder[] {
    if (observations.length === 0) return [];
    const touched: PositionOrder[] = [];
    for (const obs of observations) {
      const affected = runObservation(this.stores, obs, { market: this.market, costs: this.costs });
      for (const order of affected) {
        touched.push(order);
        const type: ReplayEventType =
          order.status === "closed" ? "position_closed"
            : order.status === "cancelled" ? "order_cancelled"
              : order.status === "open" || order.status === "filled" ? "order_filled"
                : "order_placed";
        this.record(type, { orderId: order.id, status: order.status, price: obs.price }, obs);
      }
      if (obs.closesCandle) this.autosave.markObservations(1);
    }
    const last = observations[observations.length - 1];
    this.record("observation_batch", { count: observations.length, to: last.index }, last);
    this.autosave.markObservations(observations.length);
    if (this.completeOnExhaustion && this.clock.atEnd && this.metaValue.lifecycle !== "completed") {
      this.complete("ended");
    }
    this.emit();
    return touched;
  }

  private record(type: ReplayEventType, payload?: Record<string, unknown>, obs?: ReplayObservation) {
    this.log.append({
      type,
      at: this.now(),
      // Cursor is "observations consumed", so a resumed session restarts at
      // the next unseen observation rather than replaying the logged one.
      cursor: obs ? obs.index + 1 : this.clock.index,
      marketTime: obs ? obs.time : this.clock.timestamp,
      payload,
    });
    this.autosave.markEvent(type);
  }

  // ── persistence ────────────────────────────────────────────────────────
  snapshot(): SessionSnapshot {
    return {
      version: SESSION_SNAPSHOT_VERSION,
      meta: { ...this.metaValue },
      clock: this.clock.snapshot(),
      viewport: { ...this.viewportValue },
      orders: this.stores.orders.list().map((o) => ({ ...o })),
      drawings: this.stores.drawings.list().map((d) => ({ ...d })),
      events: this.log.list(),
      revision: this.autosave.currentRevision,
      savedAt: this.autosave.savedAt,
    };
  }

  /** Save now — call on pause, navigation away and `visibilitychange`. */
  flush() { return this.autosave.flush(); }
  /** Call from the same rAF loop that drives `tick`. */
  maybeFlush() { return this.autosave.maybeFlush(); }
}
