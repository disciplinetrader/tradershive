/**
 * Battle replay session — one participant's view of a shared, server-timed market.
 *
 * The difference from a Replay Studio session is entirely about who owns time:
 *
 *   Studio   the trader owns the clock. Play, pause, seek, change speed.
 *   Battle   `battles.start_at` owns the clock. Nobody may move it.
 *
 * So this deliberately does NOT use `ReplaySessionController`, whose whole job
 * is converting local frame deltas into engine ticks. A battle instead computes
 * an authoritative cursor from wall-clock time and tells the engine "be at index
 * N" (`seekForwardToIndex`). Two participants with different frame rates, or one
 * with a throttled background tab, therefore converge on the same market rather
 * than drifting apart by their own accumulated carry.
 *
 * Execution stores are per-participant instances. They must never be the
 * process-wide singletons — see `components/trading/execution-stores.tsx`.
 */

import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "@/lib/chart/orders/store";
import { ClosedTradeStore } from "@/lib/chart/orders/trade-store";
import type { OrderStores } from "@/lib/chart/orders/service";

import { battleCursorAt, clampBattleSpeed } from "./battle-cursor";
import { buildDataset, type ReplayDataset } from "./session/dataset";
import { ReplaySessionEngine } from "./session/engine";
import { createSessionMeta } from "./session/model";
import type { Candle, Timeframe } from "./types";

/** The replay half of a `battles` row. */
export interface BattleReplayConfig {
  battleId: string;
  /** The participant this engine belongs to. Stores are per-participant. */
  userId?: string;
  datasetId: string;
  symbol: string;
  timeframe: Timeframe;
  market?: string | null;
  /** ISO string or epoch ms. */
  startAt: string | number;
  speed: number;
  startCursor: number;
  startingBalance?: number | null;
}

export type BattleSessionFailure =
  | { ok: false; reason: "no-candles"; message: string }
  | { ok: false; reason: "dataset-mismatch"; message: string };

export interface BattleSession {
  ok: true;
  engine: ReplaySessionEngine;
  stores: OrderStores;
  dataset: ReplayDataset;
  config: BattleReplayConfig;
}

export type BattleSessionResult = BattleSession | BattleSessionFailure;

function startMs(config: BattleReplayConfig): number {
  return typeof config.startAt === "number" ? config.startAt : new Date(config.startAt).getTime();
}

/**
 * Build the engine for one participant.
 *
 * `config.datasetId` is checked rather than trusted. The battle row records the
 * dataset the host created it against, including a checksum of every OHLC value;
 * if the bars this client loaded hash differently, the two competitors are not
 * trading the same market and the session must refuse to start rather than
 * silently produce an unfair result.
 */
export function createBattleSession(
  config: BattleReplayConfig,
  candles: Candle[],
  opts: { provider?: string; timezone?: string | null } = {},
): BattleSessionResult {
  if (!candles.length) {
    return {
      ok: false,
      reason: "no-candles",
      message: `No historical candles for ${config.symbol} ${config.timeframe}.`,
    };
  }

  const dataset = buildDataset({
    provider: opts.provider ?? "unknown",
    symbol: config.symbol,
    timeframe: config.timeframe,
    timezone: opts.timezone ?? "UTC",
    candles,
  });

  // `datasetId` is `provider:SYMBOL:timeframe:start:end:checksum`, so a string
  // comparison already covers the content checksum of every OHLC value — no
  // need to compare fields separately.
  if (config.datasetId && dataset.identity.datasetId !== config.datasetId) {
    return {
      ok: false,
      reason: "dataset-mismatch",
      message:
        "The market data for this battle does not match what it was created " +
        "against. Refusing to start rather than compete on different candles.",
    };
  }

  // Fresh instances, never the singletons: the live feed and this replay clock
  // both drive `runObservation`, and sharing a book would let a live tick fill
  // an order placed against historical candles.
  const stores: OrderStores = {
    drawings: new DrawingStore(),
    orders: new PositionOrderStore(),
    trades: new ClosedTradeStore(),
  };

  const engine = new ReplaySessionEngine({
    meta: createSessionMeta({
      id: `battle-${config.battleId}`,
      userId: config.userId ?? "",
      title: `Battle ${config.battleId}`,
      dataset: dataset.identity,
      purpose: "practice",
      startingBalance: config.startingBalance ?? undefined,
    }),
    dataset,
    stores,
    market: config.market ?? null,
    clock: { cursor: Math.max(0, Math.floor(config.startCursor)), speed: clampBattleSpeed(config.speed) },
    // The battle's lifecycle is `battles.end_at`. Exhausting the tape must not
    // end one participant's session while the battle continues for everyone
    // else; `validateBattleReplayRange` makes that unreachable at creation.
    completeOnExhaustion: false,
    // No autosave writer. A battle's durable record is `paper_trades` (step 4),
    // not a resumable session snapshot — and a snapshot would be a second,
    // divergent source of truth for a position the cursor already determines.
    writer: async () => {},
  });

  return { ok: true, engine, stores, dataset, config };
}

/**
 * Advance the engine to where the battle should be right now.
 *
 * Idempotent and safe to call at any cadence: `seekForwardToIndex` refuses
 * backwards movement, so an early call is a no-op and a late one catches up by
 * replaying every observation in between — which is what resolves stops and
 * targets that would otherwise have been skipped over.
 *
 * Returns the authoritative cursor, whether or not anything was consumed.
 */
export function advanceBattleSession(
  session: BattleSession,
  now: number = Date.now(),
): { cursor: number; consumed: number; atEnd: boolean } {
  const target = battleCursorAt(session.dataset, {
    elapsedMs: now - startMs(session.config),
    speed: session.config.speed,
    startCursor: session.config.startCursor,
  });

  const consumed = session.engine.seekForwardToIndex(target).length;
  return { cursor: session.engine.clock.index, consumed, atEnd: session.engine.clock.atEnd };
}

/**
 * How far through the battle's tape we are, 0..1 — for the scrubber readout.
 * Progress across the *battle's* slice, not the whole dataset, so a battle
 * starting at cursor 500 of 2000 still reads 0% at the bell.
 */
export function battleProgress(session: BattleSession): number {
  const total = session.dataset.identity.observationCount;
  const start = Math.min(session.config.startCursor, total);
  const span = total - start;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (session.engine.clock.index - start) / span));
}
