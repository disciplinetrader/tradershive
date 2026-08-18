import { describe, it, expect } from "vitest";
import { SYMBOL_CATALOG, findSymbol, MARKET_TABS } from "../symbols";

/**
 * Symbol and market are one fact, not two.
 *
 * `market` is the provider ROUTING hint — `ChartEngine` hands it to
 * `marketData.getCandles(..., settings.market)`. So a symbol paired with the
 * wrong market fetches from the wrong venue: an index asked of Binance returns
 * nothing, under a header naming the index. The bug that motivated these tests
 * wrote the symbol unconditionally and the market only when the catalog could
 * resolve it, leaving the two disagreeing silently.
 *
 * `PaperProvider.setSymbol` now refuses an unresolvable symbol outright. These
 * tests pin the invariant that makes that refusal unreachable from the UI: the
 * picker lists `SYMBOL_CATALOG`, and every entry of it must resolve.
 */

describe("every symbol the picker can offer is resolvable", () => {
  it("resolves each catalog entry back to itself", () => {
    // If this fails, the picker can hand `setSymbol` something it will refuse,
    // and a user gets a dead click with only a console line to show for it.
    const unresolvable = SYMBOL_CATALOG.filter((m) => !findSymbol(m.symbol));
    expect(unresolvable.map((m) => m.symbol)).toEqual([]);
  });

  it("round-trips to the same market the catalog declares", () => {
    for (const meta of SYMBOL_CATALOG) {
      expect(findSymbol(meta.symbol)?.market).toBe(meta.market);
    }
  });

  it("declares a market that the picker actually has a tab for", () => {
    // A symbol whose market has no tab is unreachable in the UI even though it
    // resolves — a quieter version of the same class of gap.
    const tabs = new Set(MARKET_TABS.map((t) => t.value));
    const orphaned = SYMBOL_CATALOG.filter((m) => !tabs.has(m.market));
    expect(orphaned.map((m) => `${m.symbol} (${m.market})`)).toEqual([]);
  });

  it("has no duplicate symbols, which would make resolution order matter", () => {
    const seen = new Map<string, number>();
    for (const m of SYMBOL_CATALOG) seen.set(m.symbol, (seen.get(m.symbol) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});

describe("symbols that exist for DATA but not for TRADING", () => {
  /**
   * These are registered in `historical_symbols` so replay and backtests can
   * load their candles, but they are deliberately absent from the trading
   * catalog — indices are traded through ETF proxies (SPY / QQQ / DIA / IWM),
   * which is a measured entitlement decision, not an oversight.
   *
   * The test records the asymmetry rather than asserting it should not exist.
   * If one of these is ever added to the catalog, this fails and forces the
   * question: is it actually tradeable and quotable, or does it need a proxy?
   */
  const DATA_ONLY = ["SPX500", "NAS100", "US30", "GER40", "BRENT/USD", "WTI/USD"];

  it("stays out of the trading catalog until deliberately added", () => {
    for (const symbol of DATA_ONLY) {
      expect(findSymbol(symbol), `${symbol} entered the trading catalog`).toBeUndefined();
    }
  });

  it("has an ETF proxy for each index that is traded", () => {
    // The reason the index symbols above are absent: these carry the exposure.
    for (const proxy of ["SPY", "QQQ", "DIA", "IWM"]) {
      expect(findSymbol(proxy)?.market).toBe("indices");
    }
  });
});
