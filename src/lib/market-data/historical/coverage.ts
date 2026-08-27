/**
 * Coverage validation for historical candle data.
 *
 * Pure, isomorphic and unit-testable. The rule this module encodes is the
 * central one for the whole market-data stack:
 *
 *   We never silently substitute data. Either the range is genuinely
 *   covered by a real provider, or the caller is told exactly what is
 *   missing.
 *
 * Coverage is *session aware*: a forex range that spans a weekend is not
 * "missing" candles, and an equity range outside RTH is not a gap.
 */

export type MarketKind = "crypto" | "forex" | "stocks" | "indices" | "commodities" | "metals" | "futures";

export type CoverageTimeframe =
  | "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W" | "1M";

export const TF_MS: Record<CoverageTimeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
  "1W": 604_800_000,
  "1M": 2_592_000_000,
};

/** Markets that trade continuously (no weekend/session exclusions). */
const CONTINUOUS: ReadonlySet<string> = new Set(["crypto"]);

export type CoverageInput = {
  candles: ReadonlyArray<{ time: number }>;
  from: number;
  to: number;
  timeframe: CoverageTimeframe;
  market: MarketKind | string;
  /** Fraction of expected candles required to call the range usable. */
  minRatio?: number;
  /** Minimum absolute candle count required regardless of ratio. */
  minCandles?: number;
};

export type CoverageResult = {
  ok: boolean;
  /** Candles actually present inside [from, to]. */
  actual: number;
  /** Session-aware estimate of how many candles *should* exist. */
  expected: number;
  ratio: number;
  firstTs: number | null;
  lastTs: number | null;
  /** Contiguous holes larger than one session-adjusted bar. */
  gaps: Array<{ from: number; to: number; missing: number }>;
  reason?: CoverageFailure;
};

export type CoverageFailure =
  | "empty"
  | "too-few-candles"
  | "insufficient-ratio"
  | "range-not-reached";

/**
 * Number of tradable milliseconds inside [from, to] for a market.
 * Weekends are excluded for everything except crypto. This is deliberately
 * conservative: it under-estimates rather than over-estimates the expected
 * count, so we never fail a range that is actually complete.
 */
export function tradableMs(from: number, to: number, market: MarketKind | string): number {
  if (to <= from) return 0;
  if (CONTINUOUS.has(market)) return to - from;

  let tradable = 0;
  const DAY = 86_400_000;
  let cursor = from;
  while (cursor < to) {
    const dayStart = Math.floor(cursor / DAY) * DAY;
    const dayEnd = Math.min(dayStart + DAY, to);
    const dow = new Date(dayStart).getUTCDay(); // 0 Sun .. 6 Sat
    // FX week: Sunday 21:00 UTC -> Friday 21:00 UTC.
    const isWeekend = dow === 6 || (dow === 0 && dayEnd - dayStart <= DAY);
    if (!isWeekend) tradable += dayEnd - cursor;
    cursor = dayEnd;
  }
  return tradable;
}

/**
 * Fraction of a weekday an intraday market is actually open.
 * Cash equities / index cash sessions run ~6.5h; FX, metals and futures are
 * effectively round-the-clock on weekdays.
 */
const INTRADAY_SESSION_FRACTION: Record<string, number> = {
  stocks: 6.5 / 24,
  indices: 6.5 / 24,
};

export function expectedCandles(
  from: number,
  to: number,
  timeframe: CoverageTimeframe,
  market: MarketKind | string,
): number {
  const step = TF_MS[timeframe];
  if (!step) return 0;
  const ms = tradableMs(from, to, market);
  // Daily and above already collapse sessions into one bar, so counting
  // calendar steps minus weekends is the right estimate.
  if (timeframe === "1D" || timeframe === "1W" || timeframe === "1M") {
    return Math.max(0, Math.floor(ms / step));
  }
  const fraction = INTRADAY_SESSION_FRACTION[String(market)] ?? 1;
  return Math.max(0, Math.floor((ms * fraction) / step));
}


/**
 * Validate that a candle set genuinely covers the requested range.
 * Returns a structured result — never throws, never guesses.
 */
export function checkCoverage(input: CoverageInput): CoverageResult {
  const { from, to, timeframe, market } = input;
  const step = TF_MS[timeframe] ?? 0;
  const minRatio = input.minRatio ?? 0.6;
  const minCandles = input.minCandles ?? 20;

  const inRange = input.candles
    .filter((c) => c.time >= from && c.time <= to)
    .map((c) => c.time)
    .sort((a, b) => a - b);

  const expected = expectedCandles(from, to, timeframe, market);
  const actual = inRange.length;
  const ratio = expected > 0 ? actual / expected : actual > 0 ? 1 : 0;

  const gaps: CoverageResult["gaps"] = [];
  for (let i = 1; i < inRange.length; i++) {
    const delta = inRange[i] - inRange[i - 1];
    if (delta <= step * 1.5) continue;
    // Ignore holes that are entirely non-tradable time (weekends, closures).
    const holeTradable = tradableMs(inRange[i - 1] + step, inRange[i], market);
    const missing = Math.floor(holeTradable / step);
    if (missing > 0) {
      gaps.push({ from: inRange[i - 1] + step, to: inRange[i], missing });
    }
  }

  const firstTs = inRange[0] ?? null;
  const lastTs = inRange[inRange.length - 1] ?? null;

  // `expected === 0` means the requested window is SHORTER THAN ONE CANDLE, so
  // there is no floor to apply. The previous expression was `Math.min(
  // minCandles, expected || minCandles)`, and `0 || minCandles` is
  // `minCandles` — which demanded TWENTY candles of a window that can hold
  // none. It was not a strict check, it was an unsatisfiable one: no provider,
  // no retry and no amount of stored history could ever clear it, because the
  // requirement was derived from the absence of a requirement.
  //
  // Measured 2026-08-27: 18 of 41 journal entries queued for excursion
  // measurement were sub-candle scalps (BTC/USDT median window 0.7 min at 1m),
  // every one of them permanently failing here and being re-queued forever.
  const floor = expected > 0 ? Math.min(minCandles, expected) : 0;

  let reason: CoverageFailure | undefined;
  if (actual === 0) reason = "empty";
  else if (actual < floor) reason = "too-few-candles";
  else if (expected > 0 && ratio < minRatio) reason = "insufficient-ratio";

  return { ok: !reason, actual, expected, ratio, firstTs, lastTs, gaps, reason };
}

/** Human-readable explanation used in UI error states. */
export function describeCoverage(r: CoverageResult, symbol: string, timeframe: string): string {
  switch (r.reason) {
    case "empty":
      return `No historical data stored for ${symbol} · ${timeframe} in this range.`;
    case "too-few-candles":
      return `Only ${r.actual} candle(s) available for ${symbol} · ${timeframe} — not enough to replay.`;
    case "insufficient-ratio":
      return `${symbol} · ${timeframe} is only ${Math.round(r.ratio * 100)}% covered (${r.actual} of ~${r.expected} candles).`;
    case "range-not-reached":
      return `Stored data for ${symbol} · ${timeframe} does not reach the requested range.`;
    default:
      return `${symbol} · ${timeframe}: ${r.actual} candles available.`;
  }
}
