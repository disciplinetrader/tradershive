import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isScoredCryptoSupported,
  ScoredPriceUnavailableError,
  resolveScoredPrice,
} from "@/lib/market-data/scored-price.server";

// Twelve Data proxy is mocked so the FX path is deterministic and offline.
vi.mock("@/lib/market-data/twelvedata.functions", () => ({
  twelveDataQuote: vi.fn(async ({ data }: { data: { symbols: string[] } }) => {
    if (data.symbols[0] === "EUR/USD") return { quotes: [{ symbol: "EUR/USD", last: 1.091 }] };
    return { quotes: [] }; // no trusted quote
  }),
}));

function mockFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("scored price resolver (D-6)", () => {
  it("supports exactly the six mapped crypto symbols", () => {
    for (const s of ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"]) {
      expect(isScoredCryptoSupported(s)).toBe(true);
    }
    expect(isScoredCryptoSupported("DOGE/USDT")).toBe(false);
  });

  it("resolves crypto via Kraken last-trade price", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: [], result: { XBTUSDT: { c: ["77551.4", "0.1"] } } }));
    const p = await resolveScoredPrice("BTC/USDT", "crypto");
    expect(p.source).toBe("kraken");
    expect(p.price).toBeCloseTo(77551.4);
  });

  it("fails closed (unsupported) for an unmapped scored crypto symbol", async () => {
    await expect(resolveScoredPrice("DOGE/USDT", "crypto")).rejects.toMatchObject({
      code: "unsupported-scored-symbol",
    });
  });

  it("fails closed (temporary) on a Kraken error payload", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: ["EService:Unavailable"], result: {} }));
    await expect(resolveScoredPrice("ETH/USDT", "crypto")).rejects.toBeInstanceOf(ScoredPriceUnavailableError);
  });

  it("fails closed on an HTTP error / timeout", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false));
    await expect(resolveScoredPrice("ETH/USDT", "crypto")).rejects.toMatchObject({
      code: "temporary-price-unavailable",
    });
  });

  it("resolves FX via the Twelve Data proxy", async () => {
    const p = await resolveScoredPrice("EUR/USD", "forex");
    expect(p.source).toBe("twelvedata");
    expect(p.price).toBeCloseTo(1.091);
  });

  it("fails closed when Twelve Data returns no quote", async () => {
    await expect(resolveScoredPrice("USD/JPY", "forex")).rejects.toMatchObject({
      code: "temporary-price-unavailable",
    });
  });
});
