import { describe, it, expect, vi, afterEach } from "vitest";
import { BybitHistoricalProvider } from "../providers.server";

/**
 * The two behaviours that separate Bybit from the Binance client it replaces,
 * pinned because getting either wrong fails SILENTLY rather than loudly.
 *
 * 1. NEWEST-FIRST pagination. Binance returns oldest-first and advances a
 *    cursor off the last bar received. That shape, applied here, walks the
 *    wrong direction and stops after one page — returning a plausible 1,000
 *    bars for a range that should hold far more, which no type and no HTTP
 *    status can catch.
 *
 * 2. `confirmedEmpty`. `retCode: 0` with `list: []` is Bybit vouching for the
 *    window; `retCode: 10001` is an unlisted symbol. Conflating them is HD-4
 *    exactly — "the market was shut" read as a fault, three retries burned per
 *    cycle for ever — and the whole reason for choosing a provider that can
 *    tell them apart is thrown away if this layer flattens it.
 *
 * Both assertions were mutation-checked: reversing the cursor step and
 * dropping the `out.length === 0` guard each turn a test red.
 */

const MIN = 60_000;
const T0 = Date.UTC(2026, 6, 15, 0, 0, 0);

/** Bybit row shape: [startMs, open, high, low, close, volume, turnover]. */
const bar = (ts: number, close: number): string[] => [
  String(ts), String(close), String(close + 1), String(close - 1), String(close), "1", "1",
];

/** A page of `n` bars ending at `endMs`, NEWEST FIRST, as Bybit sends them. */
function page(endMs: number, n: number, floor: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < n; i++) {
    const ts = endMs - i * MIN;
    if (ts < floor) break;
    rows.push(bar(ts, 100 + i));
  }
  return rows;
}

function mockFetch(handler: (url: URL) => unknown) {
  const spy = vi.fn(async (input: unknown) => ({
    ok: true,
    status: 200,
    json: async () => handler(new URL(String(input))),
    text: async () => "",
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("BybitHistoricalProvider · pagination direction", () => {
  it("pages BACKWARDS and collects every bar across multiple pages", async () => {
    // 2,500 one-minute bars => three pages at the 1000 cap.
    const from = T0;
    const to = T0 + 2499 * MIN;
    const ends: number[] = [];

    mockFetch((url) => {
      const end = Number(url.searchParams.get("end"));
      ends.push(end);
      return { retCode: 0, retMsg: "OK", result: { list: page(end, 1000, from) } };
    });

    const res = await new BybitHistoricalProvider().fetchCandles({
      nativeSymbol: "BTCUSDT", timeframe: "1m", from, to,
    });

    // EXACT cursor positions, not merely "descending".
    //
    // A monotonicity check is too weak to be worth writing: mutating the step
    // to `oldest + stepMs` still descends, still terminates, and still returns
    // all 2,500 bars — it just refetches two bars per page. It passed a
    // strictly-decreasing assertion, which is how this test came to be
    // strengthened. Pinning the exact `end` of every page is what actually
    // distinguishes a correct backward walk from a nearly-correct one:
    // each page must resume one step below the oldest bar of the last.
    expect(ends).toEqual([to, to - 1000 * MIN, to - 2000 * MIN]);

    expect(res.candles).toHaveLength(2500);
    // Returned ASCENDING regardless of the wire order.
    expect(res.candles[0].ts).toBe(from);
    expect(res.candles[res.candles.length - 1].ts).toBe(to);
    for (let i = 1; i < res.candles.length; i++) {
      expect(res.candles[i].ts).toBeGreaterThan(res.candles[i - 1].ts);
    }
    expect(res.confirmedEmpty).toBe(false);
  });

  it("stops on a short page instead of spinning", async () => {
    const spy = mockFetch((url) => ({
      retCode: 0, retMsg: "OK",
      result: { list: page(Number(url.searchParams.get("end")), 10, T0) },
    }));
    const res = await new BybitHistoricalProvider().fetchCandles({
      nativeSymbol: "BTCUSDT", timeframe: "1m", from: T0, to: T0 + 9 * MIN,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.candles).toHaveLength(10);
  });

  it("drops bars outside the requested window and never duplicates a ts", async () => {
    mockFetch(() => ({
      retCode: 0, retMsg: "OK",
      result: { list: [
        bar(T0 + 5 * MIN, 100),
        bar(T0 + 5 * MIN, 999),   // duplicate ts, second must be ignored
        bar(T0 - 99 * MIN, 100),  // before `from`
        bar(T0 + 99 * MIN, 100),  // after `to`
      ] },
    }));
    const res = await new BybitHistoricalProvider().fetchCandles({
      nativeSymbol: "BTCUSDT", timeframe: "1m", from: T0, to: T0 + 10 * MIN,
    });
    expect(res.candles).toHaveLength(1);
    expect(res.candles[0].ts).toBe(T0 + 5 * MIN);
    expect(res.candles[0].close).toBe(100);
  });
});

describe("BybitHistoricalProvider · confirmedEmpty", () => {
  it("sets confirmedEmpty when Bybit vouches for an empty window", async () => {
    mockFetch(() => ({ retCode: 0, retMsg: "OK", result: { list: [] } }));
    const res = await new BybitHistoricalProvider().fetchCandles({
      nativeSymbol: "BTCUSDT", timeframe: "1m", from: T0, to: T0 + 60 * MIN,
    });
    expect(res.candles).toHaveLength(0);
    expect(res.confirmedEmpty).toBe(true);
  });

  it("does NOT set confirmedEmpty when the walk merely ran past the listing", async () => {
    // Real bars first, then an empty page. That is a COMPLETE result, and
    // reporting it empty would tell the caller the window held nothing.
    let call = 0;
    mockFetch((url) => {
      const end = Number(url.searchParams.get("end"));
      return call++ === 0
        ? { retCode: 0, retMsg: "OK", result: { list: page(end, 1000, T0 - 5000 * MIN) } }
        : { retCode: 0, retMsg: "OK", result: { list: [] } };
    });
    const res = await new BybitHistoricalProvider().fetchCandles({
      nativeSymbol: "BTCUSDT", timeframe: "1m", from: T0 - 5000 * MIN, to: T0,
    });
    expect(res.candles.length).toBeGreaterThan(0);
    expect(res.confirmedEmpty).toBe(false);
  });

  it("THROWS on an unlisted symbol rather than calling it empty", async () => {
    // retCode 10001 can never fill. Reported as empty it would stay retryable
    // for ever — the exact leak the excursion queue was fixed for.
    mockFetch(() => ({ retCode: 10001, retMsg: "Not supported symbols", result: {} }));
    await expect(
      new BybitHistoricalProvider().fetchCandles({
        nativeSymbol: "NOPE", timeframe: "1m", from: T0, to: T0 + 60 * MIN,
      }),
    ).rejects.toThrow(/unknown symbol/i);
  });

  it("throws on any other non-zero retCode", async () => {
    mockFetch(() => ({ retCode: 10006, retMsg: "Too many visits", result: {} }));
    await expect(
      new BybitHistoricalProvider().fetchCandles({
        nativeSymbol: "BTCUSDT", timeframe: "1m", from: T0, to: T0 + 60 * MIN,
      }),
    ).rejects.toThrow(/10006/);
  });
});

describe("BybitHistoricalProvider · earliest", () => {
  it("takes the LAST element, because Bybit sends newest first", async () => {
    const oldest = Date.UTC(2021, 7, 1);
    mockFetch(() => ({
      retCode: 0, retMsg: "OK",
      result: { list: [bar(Date.UTC(2026, 7, 1), 1), bar(Date.UTC(2024, 0, 1), 1), bar(oldest, 1)] },
    }));
    expect(await new BybitHistoricalProvider().earliest("BTCUSDT")).toBe(oldest);
  });
});
