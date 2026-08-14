import { describe, expect, it } from "vitest";
import { findSymbol, priceDecimals } from "@/lib/paper-trading/symbols";
import { formatPrice } from "@/lib/paper-trading/calculations";
import { fmtPrice } from "@/lib/trading/plan-math";

/**
 * Prices render at the instrument's own precision.
 *
 * Forex was showing 4 decimals everywhere, which hides the fractional pip: at
 * 1.1520 a pip is the smallest visible increment, so sub-pip movement, the real
 * spread and any fractional-pip stop are invisible. The catalog always held the
 * right numbers — the renderers were hardcoding their own.
 */
describe("price precision", () => {
  it("gives forex majors 5 decimals and JPY pairs 3", () => {
    expect(priceDecimals("EUR/USD")).toBe(5);
    expect(priceDecimals("GBP/USD")).toBe(5);
    expect(priceDecimals("USD/JPY")).toBe(3);
    expect(priceDecimals("GBP/JPY")).toBe(3);
  });

  it("keeps every other asset class on its own scale", () => {
    expect(priceDecimals("XAU/USD")).toBe(2);   // gold
    expect(priceDecimals("XAG/USD")).toBe(3);   // silver
    expect(priceDecimals("AAPL")).toBe(2);      // equity
    expect(priceDecimals("QQQ")).toBe(2);       // index ETF
    expect(priceDecimals("BTC/USDT")).toBe(1);
    expect(priceDecimals("XRP/USDT")).toBe(4);
  });

  // The bug that made the same price render differently on different surfaces:
  // providers and stored rows spell pairs without the slash, and the exact-key
  // lookup missed, so callers silently fell back to 2 decimals.
  it("resolves a symbol however it is spelled", () => {
    for (const spelling of ["EUR/USD", "EURUSD", "eurusd", "eur-usd", "EUR_USD"]) {
      expect(findSymbol(spelling)?.symbol, spelling).toBe("EUR/USD");
      expect(priceDecimals(spelling), spelling).toBe(5);
    }
  });

  it("falls back on the shape of an unknown symbol, never to a flat 2", () => {
    expect(priceDecimals("EURNOK")).toBe(5);   // unlisted FX pair
    expect(priceDecimals("USDTRY")).toBe(5);
    expect(priceDecimals("CHFJPY")).toBe(3);   // unlisted JPY cross
  });

  it("formats at that precision, and agrees between chart and panel", () => {
    // Panel formatter groups thousands; the chart formatter does not. Both
    // must agree on the number of decimals.
    // Not a .xxxxx5 midpoint: binary rounding there is a coin-flip and would
    // pin float behaviour rather than the precision this suite is about.
    expect(formatPrice("EUR/USD", 1.1520371)).toBe("1.15204");
    expect(fmtPrice("EUR/USD", 1.1520371)).toBe("1.15204");
    expect(formatPrice("USD/JPY", 147.5234)).toBe("147.523");
    expect(fmtPrice("USD/JPY", 147.5234)).toBe("147.523");
    expect(fmtPrice("BTC/USDT", 62979.615000000005)).toBe("62979.6");
  });

  it("returns a dash rather than NaN for missing prices", () => {
    expect(formatPrice("EUR/USD", null)).toBe("—");
    expect(formatPrice("EUR/USD", undefined)).toBe("—");
    expect(fmtPrice("EUR/USD", Number.NaN)).toBe("—");
  });
});
