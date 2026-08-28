import { describe, it, expect, afterEach } from "vitest";
import {
  resolveHistoricalProvider,
  nativeSymbolForProvider,
  canonicalProviderForMarket,
} from "../routing";

afterEach(() => {
  delete process.env.ENABLE_STOOQ_HISTORICAL;
});

describe("historical provider routing", () => {
  it("routes each market to its canonical provider", () => {
    // Bybit, not Binance, since 2026-08-28 — CX-1 blocks Binance from this
    // deployment's egress on both of its hostnames. See MD-10/MD-12.
    expect(canonicalProviderForMarket("crypto")).toBe("bybit");
    for (const m of ["forex", "metals", "indices", "commodities", "stocks"]) {
      expect(canonicalProviderForMarket(m)).toBe("twelvedata");
    }
  });

  it("never selects stooq implicitly", () => {
    const r = resolveHistoricalProvider("forex", "stooq");
    expect(r.code).toBe("twelvedata");
    expect(r.overrode).toBe(true);
  });

  it("allows stooq only when explicitly enabled and requested", () => {
    process.env.ENABLE_STOOQ_HISTORICAL = "true";
    expect(resolveHistoricalProvider("forex", "stooq").code).toBe("stooq");
    expect(resolveHistoricalProvider("forex", null).code).toBe("twelvedata");
  });

  it("overrides a non-canonical stored provider", () => {
    expect(resolveHistoricalProvider("crypto", "twelvedata").code).toBe("bybit");
    // A row still storing the OLD crypto provider is overridden too, which is
    // what lets the cutover deploy before the `historical_symbols` update runs.
    const legacy = resolveHistoricalProvider("crypto", "binance");
    expect(legacy.code).toBe("bybit");
    expect(legacy.overrode).toBe(true);
  });

  it("maps native tickers per provider", () => {
    expect(nativeSymbolForProvider("binance", "BTC/USDT")).toBe("BTCUSDT");
    // Bybit lists the identical ticker, so no `native_symbol` migration was
    // needed for the eight enrolled crypto rows.
    expect(nativeSymbolForProvider("bybit", "BTC/USDT")).toBe("BTCUSDT");
    expect(nativeSymbolForProvider("bybit", "ETH/USDT")).toBe("ETHUSDT");
    expect(nativeSymbolForProvider("twelvedata", "EURUSD")).toBe("EUR/USD");
    expect(nativeSymbolForProvider("twelvedata", "XAU/USD")).toBe("XAU/USD");
    // Index ETFs are their own Twelve Data ticker — nothing to translate.
    expect(nativeSymbolForProvider("twelvedata", "QQQ")).toBe("QQQ");
    // The licensed index names are deliberately unmapped: they are reserved
    // for a future feed, and mapping them sent imports at symbols Twelve Data
    // either refuses (SPX/DJI) or does not have (IXIC).
    expect(nativeSymbolForProvider("twelvedata", "US30")).toBe("US30");
    // stooq-era native symbols are ignored when the provider differs
    expect(nativeSymbolForProvider("twelvedata", "EUR/USD", "eurusd", "stooq")).toBe("EUR/USD");
  });
});
