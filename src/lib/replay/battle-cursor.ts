/**
 * Battle replay cursor — the single authority on "where is this battle's market".
 *
 * In Replay Studio the trader owns the clock: they play, pause, seek and change
 * speed, and the cursor is whatever their own session has consumed. In a battle
 * that model is unusable — a player who pauses to think trades a different
 * market from one who didn't, and a player who seeks forward sees the future.
 *
 * So a battle's cursor is not stored or streamed. It is DERIVED, from three
 * values every participant already has:
 *
 *     cursor = f(now - battle.start_at, battle.replay_speed, dataset)
 *
 * Everyone computes the same number from the same inputs, and `ReplayClock` is
 * deterministic in observations, so identical cursor ⇒ identical market. No
 * per-tick realtime traffic, no drift, and nothing to disagree about.
 *
 * Pausing therefore cannot stop the market. It can only stop a player LOOKING
 * at it — which is the intended cost of pausing, not a bug.
 *
 * This module is pure and dependency-free on purpose: the same function has to
 * run in the browser today and on the server in step 5, where it becomes the
 * authority that validates submitted fills.
 */

import { CANDLES_PER_SECOND_AT_1X } from "./session/clock";
import { candleIndexForObservation, type ReplayDataset } from "./session/dataset";

/**
 * Speed is narrower than the Studio's 0.25–100. A battle's speed is fixed at
 * creation and shared by everyone, so the only thing a high multiplier buys is
 * a market that outruns human reaction — and 100x would exhaust any realistic
 * dataset within seconds of the start.
 */
export const BATTLE_MIN_SPEED = 0.5;
export const BATTLE_MAX_SPEED = 8;

export function clampBattleSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(BATTLE_MAX_SPEED, Math.max(BATTLE_MIN_SPEED, speed));
}

/**
 * Whole candles the battle has consumed since it went live.
 *
 * Floor, never round: the cursor must be monotonic and must never report a
 * candle as consumed before it is. Negative elapsed (a clock skewed behind
 * `start_at`) reads as zero rather than going backwards.
 */
export function candlesConsumedAt(elapsedMs: number, speed: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const consumed = (elapsedMs / 1000) * CANDLES_PER_SECOND_AT_1X * clampBattleSpeed(speed);
  return Math.max(0, Math.floor(consumed));
}

export interface BattleCursorInput {
  /** `now - start_at`, in ms. Negative before the battle starts. */
  elapsedMs: number;
  speed: number;
  /** Observation index the battle's market opens on. Bars before it are visible history. */
  startCursor?: number;
}

/**
 * The authoritative observation index for a battle at a given elapsed time.
 *
 * Clamped to the dataset: once exhausted the cursor pins at the end rather than
 * running past it. A battle whose dataset runs out before `end_at` is a
 * creation-time validation failure (see `validateBattleReplayRange`), not
 * something to resolve at runtime.
 */
export function battleCursorAt(dataset: ReplayDataset, input: BattleCursorInput): number {
  const total = dataset.identity.observationCount;
  const startCursor = Math.min(Math.max(0, Math.floor(input.startCursor ?? 0)), Math.max(0, total - 1));

  const startCandle = total === 0 ? 0 : candleIndexForObservation(dataset, startCursor);
  const targetCandle = startCandle + candlesConsumedAt(input.elapsedMs, input.speed);

  // Past the last candle: the whole tape is consumed.
  if (targetCandle >= dataset.candles.length) return total;

  // `observationOffsets[i]` is the first observation of candle i, so this is
  // "every observation up to but not including the candle now forming".
  return Math.max(startCursor, dataset.observationOffsets[targetCandle]);
}

export interface ReplayRangeValidation {
  ok: boolean;
  /** Candles the battle will consume over its full duration at its speed. */
  required: number;
  /** Candles actually available after `startCursor`. */
  available: number;
  reason?: string;
}

/**
 * Can this dataset cover this battle at this speed?
 *
 * Checked at creation, never at runtime. A battle that exhausts its tape
 * mid-flight leaves every participant staring at a frozen market with open
 * positions nothing can move — there is no good runtime answer to that, so it
 * must be impossible to create.
 */
export function validateBattleReplayRange(opts: {
  barCount: number;
  startCursorCandles?: number;
  durationMs: number;
  speed: number;
}): ReplayRangeValidation {
  const speed = clampBattleSpeed(opts.speed);
  const required = candlesConsumedAt(opts.durationMs, speed);
  const available = Math.max(0, opts.barCount - Math.max(0, opts.startCursorCandles ?? 0));

  if (required <= 0) {
    return { ok: false, required, available, reason: "Battle duration must be greater than zero." };
  }
  if (available < required) {
    return {
      ok: false,
      required,
      available,
      reason:
        `This range holds ${available} candles but the battle needs ${required} ` +
        `(${Math.round(opts.durationMs / 60000)} minutes at ${speed}x). ` +
        `Widen the date range, lower the speed, or shorten the battle.`,
    };
  }
  return { ok: true, required, available };
}
