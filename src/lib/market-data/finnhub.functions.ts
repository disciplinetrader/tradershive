/**
 * Finnhub server proxy — POC for live forex quotes via WebSocket.
 *
 * The API key never ships to the browser: every call is proxied through
 * these authenticated server functions. `finnhubQuote` reads
 * `/forex/candle` (resolution=1) and returns a normalised quote.
 *
 * Kept intentionally minimal — this file exists ONLY to evaluate Finnhub
 * as the live-quote source for forex. Historical candles remain on
 * Twelve Data.
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
  return { configured };
});

/**
 * NOTE: there is deliberately no `finnhubWsToken` endpoint. Finnhub has no
 * per-connection tokens, so handing the browser a socket token means handing
 * it the account API key. Live quotes are therefore polled through the
 * authenticated server proxy below and the key never leaves the server.
 */

/**
 * One-shot REST quote for a Finnhub forex symbol (e.g. "OANDA:EUR_USD").
 * Uses `/forex/candle` with resolution=1 and grabs the newest close.
 * Used by `FinnhubProvider.getQuote()` and by ad-hoc callers that don't
 * want the WebSocket lifecycle.
 */
export const finnhubQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { symbol: string }) => input)
  .handler(async ({ data }) => {
    const t0 = Date.now();
    const to = Math.floor(Date.now() / 1000);
    const from = to - 300; // last 5 minutes
    const qs = new URLSearchParams({
      symbol: data.symbol,
      resolution: "1",
      from: String(from),
      to: String(to),
      token: key(),
    }).toString();
    try {
      const res = await fetch(`${BASE}/forex/candle?${qs}`);
      const durationMs = Date.now() - t0;
      if (!res.ok) {
        return { error: `finnhub_${res.status}`, durationMs };
      }
      const json = (await res.json()) as { s?: string; c?: number[]; t?: number[]; h?: number[]; l?: number[] };
      if (json.s !== "ok" || !json.c?.length) {
        return { error: `finnhub_no_data:${json.s ?? "unknown"}`, durationMs };
      }
      const i = json.c.length - 1;
      const price = json.c[i];
      const high = json.h?.[i] ?? price;
      const low = json.l?.[i] ?? price;
      // Finnhub /forex/candle doesn't give bid/ask; synthesize a tight spread.
      const halfSpread = Math.max((high - low) * 0.05, price * 0.00005);
      return {
        symbol: data.symbol,
        last: price,
        bid: price - halfSpread,
        ask: price + halfSpread,
        spread: halfSpread * 2,
        ts: (json.t?.[i] ?? Math.floor(Date.now() / 1000)) * 1000,
        durationMs,
      };
    } catch (e) {
      return { error: (e as Error).message, durationMs: Date.now() - t0 };
    }
  });
