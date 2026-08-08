/**
 * Phase 8A · Replay Clock — the single authority on "when" in a session.
 *
 * Rules the rest of the engine relies on:
 *  · The clock owns time. Nothing else advances a session.
 *  · Advancement is deterministic in OBSERVATIONS, not in frames. Two devices
 *    with different frame rates that consume the same total elapsed replay
 *    time observe the same prices in the same order.
 *  · The clock never places, fills or closes a trade. It only produces the
 *    observation stream; the canonical execution engine reacts to it.
 *  · An observation index is never emitted twice, and never skipped — even at
 *    100x, where a single frame yields a large batch.
 */

import type { Candle } from "../types";
import type { MarketObservation } from "@/lib/chart/orders/observation";
import { observationsFromCandle } from "@/lib/chart/orders/observation";
import {
  candleIndexForObservation,
  observationIndexForTime,
  type ReplayDataset,
} from "./dataset";

export type ClockStatus = "idle" | "playing" | "paused" | "ended" | "exhausted";

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 100;

/** At 1x one candle of the dataset is consumed per real second. */
export const CANDLES_PER_SECOND_AT_1X = 1;

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

export interface ReplayObservation extends MarketObservation {
  /** Global observation index — monotonic, unique, resumable. */
  index: number;
  candleIndex: number;
  /** Last observation of its candle: the bar is now closed. */
  closesCandle: boolean;
}

export interface ClockSnapshot {
  /** Number of observations already CONSUMED. Also the next index to emit. */
  cursor: number;
  speed: number;
  status: ClockStatus;
  /** Sub-observation remainder, kept so speed changes don't drop time. */
  carry: number;
  /** Total replay time consumed, ms of real playback at 1x. */
  elapsedMs: number;
}

export class ReplayClock {
  private dataset: ReplayDataset;
  private cursor = 0;
  private speedValue = 1;
  private state: ClockStatus = "idle";
  private carry = 0;
  private elapsed = 0;

  constructor(dataset: ReplayDataset, snapshot?: Partial<ClockSnapshot>) {
    this.dataset = dataset;
    if (snapshot) this.restore(snapshot);
  }

  // ── introspection ──────────────────────────────────────────────────────
  get total() { return this.dataset.identity.observationCount; }
  get index() { return this.cursor; }
  get speed() { return this.speedValue; }
  get status() { return this.state; }
  get elapsedMs() { return this.elapsed; }
  get atEnd() { return this.cursor >= this.total; }

  /** Candle currently under the cursor (the forming bar). */
  get candleIndex(): number {
    return candleIndexForObservation(this.dataset, Math.min(this.cursor, this.total - 1));
  }

  /** Wall-clock timestamp of the cursor inside the dataset. */
  get timestamp(): number {
    return this.dataset.candles[this.candleIndex].time;
  }

  get progress(): number {
    return this.total === 0 ? 0 : Math.min(1, this.cursor / this.total);
  }

  /** Bars the chart may render: everything fully consumed, plus the forming bar. */
  visibleCandles(): Candle[] {
    const upto = this.atEnd ? this.dataset.candles.length : this.candleIndex + 1;
    return this.dataset.candles.slice(0, upto) as Candle[];
  }

  snapshot(): ClockSnapshot {
    return { cursor: this.cursor, speed: this.speedValue, status: this.state, carry: this.carry, elapsedMs: this.elapsed };
  }

  restore(s: Partial<ClockSnapshot>) {
    if (Number.isFinite(s.cursor)) this.cursor = Math.min(this.total, Math.max(0, Math.floor(s.cursor as number)));
    if (Number.isFinite(s.speed)) this.speedValue = clampSpeed(s.speed as number);
    if (Number.isFinite(s.carry)) this.carry = Math.max(0, s.carry as number);
    if (Number.isFinite(s.elapsedMs)) this.elapsed = Math.max(0, s.elapsedMs as number);
    if (s.status) this.state = s.status;
    // A resumed session never auto-resumes motion: the trader presses play.
    if (this.state === "playing") this.state = "paused";
    if (this.atEnd) this.state = "ended";
  }

  // ── transport ──────────────────────────────────────────────────────────
  play() { if (!this.atEnd) this.state = "playing"; return this.state; }
  pause() { if (this.state === "playing") this.state = "paused"; return this.state; }
  setSpeed(speed: number) { this.speedValue = clampSpeed(speed); return this.speedValue; }

  restart() {
    this.cursor = 0;
    this.carry = 0;
    this.elapsed = 0;
    this.state = "paused";
  }

  /** Emit exactly one observation. The atomic unit of determinism. */
  stepObservation(): ReplayObservation[] {
    return this.take(1);
  }

  /** Emit whatever is left of the forming bar, then close it. */
  stepCandle(): ReplayObservation[] {
    if (this.atEnd) return [];
    const ci = this.candleIndex;
    const end = this.dataset.observationOffsets[ci + 1];
    return this.take(end - this.cursor);
  }

  /** Fast-forward n whole candles, running EVERY observation in between. */
  skipCandles(n: number): ReplayObservation[] {
    const out: ReplayObservation[] = [];
    for (let i = 0; i < n && !this.atEnd; i++) out.push(...this.stepCandle());
    return out;
  }

  /**
   * Seek forward to a timestamp, replaying every observation on the way so
   * pending orders, stops and targets in the skipped region still resolve.
   * Backwards seeks are refused here — rewinding is a session-level operation
   * (rebuild from the event log) because trades cannot be un-executed.
   */
  seekForwardTo(timeMs: number): ReplayObservation[] {
    return this.seekForwardToIndex(observationIndexForTime(this.dataset, timeMs));
  }

  /**
   * Seek forward to an absolute observation index, replaying everything in
   * between exactly as `seekForwardTo` does.
   *
   * This is how a battle advances. A battle's position is a cursor derived from
   * wall-clock time (`replay/battle-cursor.ts`), not an accumulation of local
   * frame deltas — so it must be applied as "be at index N", not "advance by
   * N ms". Driving a battle through `advance()` would let two participants
   * diverge by their own carry remainders and dropped frames.
   *
   * Backwards seeks return nothing, same as the timestamp form: trades cannot
   * be un-executed.
   */
  seekForwardToIndex(index: number): ReplayObservation[] {
    if (!Number.isFinite(index)) return [];
    const target = Math.min(this.total, Math.max(0, Math.floor(index)));
    if (target <= this.cursor) return [];
    return this.take(target - this.cursor);
  }

  /**
   * Advance by real elapsed milliseconds at the current speed.
   * Fractional progress is carried, so 60 frames of 16.7ms consume exactly
   * the same observations as one frame of 1000ms.
   */
  advance(realDeltaMs: number): ReplayObservation[] {
    if (this.state !== "playing" || !Number.isFinite(realDeltaMs) || realDeltaMs <= 0) return [];
    const perSecond = CANDLES_PER_SECOND_AT_1X * this.speedValue;
    const budget = this.carry + (realDeltaMs / 1000) * perSecond;
    const wholeCandles = Math.floor(budget);
    this.carry = budget - wholeCandles;
    this.elapsed += realDeltaMs * this.speedValue;
    if (wholeCandles <= 0) return [];
    return this.skipCandles(wholeCandles);
  }

  // ── internals ──────────────────────────────────────────────────────────
  private take(count: number): ReplayObservation[] {
    const out: ReplayObservation[] = [];
    const limit = Math.min(this.total, this.cursor + Math.max(0, count));
    while (this.cursor < limit) {
      out.push(this.observationAt(this.cursor));
      this.cursor++;
    }
    if (this.atEnd) {
      this.state = "exhausted";
      this.carry = 0;
    }

    return out;
  }

  private observationAt(index: number): ReplayObservation {
    const ci = candleIndexForObservation(this.dataset, index);
    const candle = this.dataset.candles[ci];
    const prev = ci > 0 ? this.dataset.candles[ci - 1] : null;
    const local = index - this.dataset.observationOffsets[ci];
    const expanded = observationsFromCandle(candle, {
      policy: this.dataset.policy,
      context: prev ? { prevHigh: prev.high, prevLow: prev.low } : undefined,
    });
    const obs = expanded[Math.min(local, expanded.length - 1)];
    return {
      ...obs,
      index,
      candleIndex: ci,
      closesCandle: local === expanded.length - 1,
    };
  }
}
