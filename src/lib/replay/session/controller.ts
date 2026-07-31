/**
 * Phase 8B · Replay Session Controller — the ONLY active replay controller.
 *
 * The controller is a thin runtime shell around the Phase 8A engine:
 *
 *   UI  ──►  ReplaySessionController  ──►  ReplaySessionEngine
 *                (loop + snapshot)            (clock + canonical execution)
 *
 * It owns exactly three things the engine deliberately does not:
 *   1. the real-time loop that converts wall-clock deltas into engine ticks
 *   2. an immutable UI snapshot for `useSyncExternalStore`
 *   3. lifecycle plumbing (visibility flush, unload flush, disposal)
 *
 * It owns NO trading behaviour. Every fill, stop, target, trailing move and
 * closed trade comes from the canonical execution engine via the engine's
 * observation pipeline.
 *
 * Determinism note: the loop advances the clock by REAL elapsed milliseconds,
 * never by frame count. A throttled background tab produces fewer, larger
 * deltas — and therefore the exact same observation sequence.
 */

import type { Candle } from "../types";
import type { ReplaySessionEngine } from "./engine";
import type { ReplayEvent } from "./events";
import type { ReplaySessionMeta, ViewportState } from "./model";
import {
  selectAutosave, selectDataset, selectExecutionEvents, selectTransport,
  type AutosaveView, type DatasetView, type TransportView,
} from "./selectors";

export interface ControllerSnapshot {
  version: number;
  meta: ReplaySessionMeta;
  transport: TransportView;
  dataset: DatasetView;
  autosave: AutosaveView;
  viewport: ViewportState;
  /** Bars the chart may draw — future data is never exposed. */
  candles: Candle[];
  /** Newest-first execution feed. */
  events: ReplayEvent[];
  /** Full log tail, oldest-first, for the audit timeline. */
  log: ReplayEvent[];
}

export interface ControllerOptions {
  now?: () => number;
  schedule?: (cb: (t: number) => void) => number;
  cancel?: (handle: number) => void;
}

const defaultSchedule = (cb: (t: number) => void): number =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(Date.now()), 16) as unknown as number);

const defaultCancel = (h: number) => {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(h);
  else clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
};

export class ReplaySessionController {
  readonly engine: ReplaySessionEngine;

  private listeners = new Set<() => void>();
  private detach: () => void;
  private handle: number | null = null;
  private lastFrame = 0;
  private version = 0;
  private cache: ControllerSnapshot | null = null;
  private disposed = false;

  private now: () => number;
  private schedule: (cb: (t: number) => void) => number;
  private cancel: (h: number) => void;

  constructor(engine: ReplaySessionEngine, opts: ControllerOptions = {}) {
    this.engine = engine;
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.schedule = opts.schedule ?? defaultSchedule;
    this.cancel = opts.cancel ?? defaultCancel;
    this.detach = engine.subscribe(() => this.invalidate());
  }

  // ── store contract ─────────────────────────────────────────────────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = (): ControllerSnapshot => {
    if (this.cache) return this.cache;
    const e = this.engine;
    this.cache = {
      version: this.version,
      meta: e.meta,
      transport: selectTransport(e),
      dataset: selectDataset(e),
      autosave: selectAutosave(e),
      viewport: e.viewport,
      candles: e.clock.visibleCandles() as Candle[],
      events: selectExecutionEvents(e),
      log: e.log.list(),
    };
    return this.cache;
  };

  private invalidate() {
    this.version++;
    this.cache = null;
    for (const l of this.listeners) l();
  }

  // ── transport (thin delegation; the engine decides everything) ─────────
  play() {
    if (this.disposed) return;
    this.engine.play();
    this.startLoop();
  }

  pause() {
    this.engine.pause();
    this.stopLoop();
    void this.engine.flush();
  }

  toggle() { this.engine.clock.status === "playing" ? this.pause() : this.play(); }

  setSpeed(speed: number) { return this.engine.setSpeed(speed); }

  step() { this.pauseForManualStep(); return this.engine.step(); }
  stepCandle() { this.pauseForManualStep(); return this.engine.stepCandle(); }
  skipCandles(n: number) { this.pauseForManualStep(); return this.engine.skipCandles(n); }
  seekForwardTo(timeMs: number) { this.pauseForManualStep(); return this.engine.seekForwardTo(timeMs); }

  setViewport(patch: Partial<ViewportState>) { this.engine.setViewport(patch); }

  complete() { this.stopLoop(); this.engine.complete("manual"); return this.engine.flush(); }
  abandon() { this.stopLoop(); this.engine.abandon(); return this.engine.flush(); }
  save() { return this.engine.flush(); }

  private pauseForManualStep() {
    if (this.engine.clock.status === "playing") this.pause();
  }

  // ── real-time loop ─────────────────────────────────────────────────────
  private startLoop() {
    if (this.handle !== null) return;
    this.lastFrame = this.now();
    const frame = () => {
      this.handle = null;
      if (this.disposed) return;
      const t = this.now();
      const delta = t - this.lastFrame;
      this.lastFrame = t;
      if (this.engine.clock.status !== "playing") {
        void this.engine.maybeFlush();
        return;
      }
      this.engine.tick(delta);
      void this.engine.maybeFlush();
      if (this.engine.clock.status === "playing") this.handle = this.schedule(frame);
    };
    this.handle = this.schedule(frame);
  }

  private stopLoop() {
    if (this.handle === null) return;
    this.cancel(this.handle);
    this.handle = null;
  }

  /** Advance manually — tests and non-rAF hosts. */
  tick(realDeltaMs: number) { return this.engine.tick(realDeltaMs); }

  get isPlaying() { return this.engine.clock.status === "playing"; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.detach();
    this.listeners.clear();
    void this.engine.flush();
  }
}
