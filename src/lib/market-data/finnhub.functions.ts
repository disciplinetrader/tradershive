/**
 * Finnhub server proxy — LIVE quotes only.
 *
 * The API key never ships to the browser: every call is proxied through
 * these authenticated server functions.
 *
 * Endpoint: `GET /quote` — the only real-time endpoint available on our
 * current subscription. It covers US equities and ETFs (and crypto via
 * `BINANCE:` symbols, which we don't use since Binance WS is direct).
 *
 * NOT available on our plan (verified — HTTP 403 / subscription error):
 *   • /forex/candle, /forex/rates, /quote?symbol=OANDA:*  → forex + metals
 *   • /quote?symbol=^DJI, ^GSPC                            → CFD indices
 *   • /stock/candle, /crypto/candle                        → historical
 *
 * Historical candles always stay on Twelve Data / Binance.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://finnhub.io/api/v1";

function key(): string {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error("finnhub_not_configured");
  return k;
}

/** Configuration probe used by the client provider on boot. */
export const finnhubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const configured = !!process.env.FINNHUB_API_KEY;
    return {
      configured,
      // Markets the current subscription can actually serve live.
      liveMarkets: ["stocks"] as const,
      endpoint: "/quote",
    };
  });

/**
 * One-shot real-time quote for a Finnhub-native symbol (e.g. "AAPL").
 * Returns `{ error }` — never throws — so the engine can fail over to
 * Twelve Data without interrupting chart updates.
 */
export const finnhubQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { symbol: string }) => {
    const symbol = String(input?.symbol ?? "").trim().toUpperCase();
    if (!symbol || symbol.length > 24 || !/^[A-Z0-9._:^-]+$/.test(symbol)) {
      throw new Error("invalid_symbol");
    }
    return { symbol };
  })
  .handler(async ({ data }) => {
    const t0 = Date.now();
    const qs = new URLSearchParams({ symbol: data.symbol, token: key() }).toString();
    try {
      const res = await fetch(`${BASE}/quote?${qs}`);
      const durationMs = Date.now() - t0;
      if (res.status === 401) return { error: "finnhub_unauthorized", durationMs };
      if (res.status === 403) return { error: "finnhub_not_entitled", durationMs };
      if (res.status === 429) return { error: "finnhub_rate_limited", durationMs };
      if (!res.ok) return { error: `finnhub_${res.status}`, durationMs };

      const json = (await res.json()) as {
        c?: number; h?: number; l?: number; o?: number; pc?: number; t?: number; error?: string;
      };
      // Finnhub returns 200 + { error } for symbols outside the plan
      // (e.g. "Market data subscription required for CFD indices.").
      if (json.error) return { error: "finnhub_not_entitled", detail: json.error, durationMs };
      if (!Number.isFinite(json.c) || !json.c) return { error: "finnhub_no_data", durationMs };

      const price = json.c as number;
      const high = json.h ?? price;
      const low = json.l ?? price;
      // /quote has no bid/ask — synthesize a tight spread from the day range.
      const halfSpread = Math.max((high - low) * 0.0005, price * 0.00005);
      const providerTs = (json.t ?? 0) * 1000;
      // Providers report the last *trade* time, which freezes outside RTH.
      // Serving a frozen timestamp makes chart bucketing discard ticks, so
      // clamp anything older than a minute to now.
      const ts = providerTs && Date.now() - providerTs < 60_000 ? providerTs : Date.now();

      return {
        symbol: data.symbol,
        last: price,
        bid: price - halfSpread,
        ask: price + halfSpread,
        spread: halfSpread * 2,
        open: json.o ?? null,
        high, low,
        prevClose: json.pc ?? null,
        ts,
        providerTs: providerTs || null,
        durationMs,
      };
    } catch (e) {
      return { error: (e as Error).message, durationMs: Date.now() - t0 };
    }
  });
