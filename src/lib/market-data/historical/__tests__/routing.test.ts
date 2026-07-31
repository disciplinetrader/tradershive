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
    expect(canonicalProviderForMarket("crypto")).toBe("binance");
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
    expect(resolveHistoricalProvider("crypto", "twelvedata").code).toBe("binance");
  });

  it("maps native tickers per provider", () => {
    expect(nativeSymbolForProvider("binance", "BTC/USDT")).toBe("BTCUSDT");
    expect(nativeSymbolForProvider("twelvedata", "EURUSD")).toBe("EUR/USD");
    expect(nativeSymbolForProvider("twelvedata", "XAU/USD")).toBe("XAU/USD");
    expect(nativeSymbolForProvider("twelvedata", "US30")).toBe("DJI");
    // stooq-era native symbols are ignored when the provider differs
    expect(nativeSymbolForProvider("twelvedata", "EUR/USD", "eurusd", "stooq")).toBe("EUR/USD");
  });
});
