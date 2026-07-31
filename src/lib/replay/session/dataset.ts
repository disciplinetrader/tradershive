/**
 * Phase 8A · Replay Dataset Identity.
 *
 * A Replay session is only reproducible if the bars it walked can be proven
 * identical on another device, another day, another provider outage. That
 * proof is a *dataset identity*: an immutable descriptor carrying the
 * provider, normalized symbol, timeframe, timezone, bounds, bar count and a
 * content checksum of every OHLC value in order.
 *
 * The dataset is IMMUTABLE. Nothing in the session engine may mutate candles
 * once a dataset is built — resuming a session recomputes the checksum and
 * refuses to continue when the bytes moved underneath it.
 */

import { TIMEFRAME_SECONDS } from "../constants";
import type { Candle, Timeframe } from "../types";
import { observationsFromCandle, type IntrabarPolicy } from "@/lib/chart/orders/observation";

export const DATASET_VERSION = 1;

export interface DatasetGap {
  /** Last bar time before the hole. */
  from: number;
  /** First bar time after the hole. */
  to: number;
  /** Number of bars the timeframe says should have been there. */
  missingBars: number;
}

export interface DatasetIdentity {
  datasetId: string;
  provider: string;
  symbol: string;
  timeframe: Timeframe;
  timezone: string;
  startTime: number;
  endTime: number;
  barCount: number;
  observationCount: number;
  checksum: string;
  gaps: DatasetGap[];
  /** Bumped when the import/normalisation pipeline itself changes. */
  importVersion: number;
  isSynthetic: boolean;
}

export interface ReplayDataset {
  identity: DatasetIdentity;
  /** Frozen, ascending, de-duplicated candles. */
  candles: readonly Candle[];
  /** Observations produced by candle i (2…4 after collapsing duplicates). */
  observationCounts: Uint8Array;
  /** Prefix sums — observation index of the first observation of candle i. */
  observationOffsets: Uint32Array;
  policy: IntrabarPolicy;
}

/** FNV-1a 64-bit (as two 32-bit halves) over the full OHLC tape. */
export function checksumCandles(candles: readonly Candle[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const push = (n: number) => {
    // Encode through a stable decimal string so 1.1 hashes the same
    // everywhere, independent of float printing in other runtimes.
    const s = Number.isFinite(n) ? n.toFixed(10) : "x";
    for (let i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i);
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (h2 + Math.imul(h1 ^ i, 2654435761)) >>> 0;
    }
  };
  for (const c of candles) {
    push(c.time);
    push(c.open);
    push(c.high);
    push(c.low);
    push(c.close);
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** Ascending, de-duplicated by time, finite-priced. */
export function normalizeCandles(candles: readonly Candle[]): Candle[] {
  const seen = new Map<number, Candle>();
  for (const c of candles) {
    if (!Number.isFinite(c.time)) continue;
    if (![c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)) continue;
    seen.set(c.time, c);
  }
  return [...seen.values()].sort((a, b) => a.time - b.time);
}

export function detectGaps(candles: readonly Candle[], timeframe: Timeframe): DatasetGap[] {
  const step = TIMEFRAME_SECONDS[timeframe] * 1000;
  const gaps: DatasetGap[] = [];
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].time - candles[i - 1].time;
    if (delta > step) {
      const missing = Math.round(delta / step) - 1;
      if (missing > 0) gaps.push({ from: candles[i - 1].time, to: candles[i].time, missingBars: missing });
    }
  }
  return gaps;
}

export interface BuildDatasetInput {
  provider: string;
  symbol: string;
  timeframe: Timeframe;
  timezone?: string;
  candles: readonly Candle[];
  importVersion?: number;
  isSynthetic?: boolean;
  policy?: IntrabarPolicy;
}

export function buildDataset(input: BuildDatasetInput): ReplayDataset {
  const candles = normalizeCandles(input.candles);
  if (candles.length === 0) throw new Error("Replay dataset requires at least one candle");
  const policy = input.policy ?? "conservative";

  const counts = new Uint8Array(candles.length);
  const offsets = new Uint32Array(candles.length + 1);
  let total = 0;
  for (let i = 0; i < candles.length; i++) {
    offsets[i] = total;
    const n = observationsFromCandle(candles[i], { policy }).length;
    counts[i] = n;
    total += n;
  }
  offsets[candles.length] = total;

  const checksum = checksumCandles(candles);
  const identity: DatasetIdentity = {
    provider: input.provider,
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe,
    timezone: input.timezone ?? "UTC",
    startTime: candles[0].time,
    endTime: candles[candles.length - 1].time,
    barCount: candles.length,
    observationCount: total,
    checksum,
    gaps: detectGaps(candles, input.timeframe),
    importVersion: input.importVersion ?? DATASET_VERSION,
    isSynthetic: input.isSynthetic ?? false,
    datasetId: [
      input.provider,
      input.symbol.toUpperCase(),
      input.timeframe,
      candles[0].time,
      candles[candles.length - 1].time,
      checksum,
    ].join(":"),
  };

  return {
    identity,
    candles: Object.freeze(candles.slice()),
    observationCounts: counts,
    observationOffsets: offsets,
    policy,
  };
}

/** Candle index owning a given observation index. Binary search over offsets. */
export function candleIndexForObservation(dataset: ReplayDataset, observationIndex: number): number {
  const { observationOffsets: off } = dataset;
  let lo = 0;
  let hi = dataset.candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (off[mid] <= observationIndex) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** First observation index at-or-after a wall-clock timestamp. */
export function observationIndexForTime(dataset: ReplayDataset, timeMs: number): number {
  const candles = dataset.candles;
  if (timeMs <= candles[0].time) return 0;
  if (timeMs >= candles[candles.length - 1].time) return dataset.observationOffsets[candles.length - 1];
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return dataset.observationOffsets[lo];
}

/** True when a persisted identity still describes the freshly loaded bars. */
export function datasetMatches(a: DatasetIdentity, b: DatasetIdentity): boolean {
  return (
    a.datasetId === b.datasetId &&
    a.checksum === b.checksum &&
    a.barCount === b.barCount &&
    a.importVersion === b.importVersion
  );
}
