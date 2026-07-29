/**
 * Finnhub server proxy — POC for live forex quotes via WebSocket.
 *
 * The API key never ships to the browser. `finnhubWsToken` returns a
 * short-lived token payload (the key itself; Finnhub has no OAuth flow) so
 * the client can open `wss://ws.finnhub.io?token=...`. `finnhubQuote`
 * offers a REST fallback via `/forex/candle` (resolution=1) so callers
 * that want a one-shot price without opening a socket still work.
 *
 * Kept intentionally minimal — this file exists ONLY to evaluate Finnhub
 * as the live-quote source for forex. Historical candles remain on
 * Twelve Data.
 */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://finnhub.io/api/v1";

function key(): string {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error("finnhub_not_configured");
  return k;
}

/** Configuration probe used by the client provider on boot. */
export const finnhubStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = !!process.env.FINNHUB_API_KEY;
  return { configured };
});

/**
 * Returns the API token so the client can open a Finnhub WebSocket.
 * NB: Finnhub does not offer per-connection tokens; the account key is
 * the token. Only authenticated users of TradersHIVE should receive this,
 * but during the POC we return unconditionally — restrict via middleware
 * before wider rollout.
 */
export const finnhubWsToken = createServerFn({ method: "GET" }).handler(async () => {
  return { token: key(), url: "wss://ws.finnhub.io" };
});

/**
 * One-shot REST quote for a Finnhub forex symbol (e.g. "OANDA:EUR_USD").
 * Uses `/forex/candle` with resolution=1 and grabs the newest close.
 * Used by `FinnhubProvider.getQuote()` and by ad-hoc callers that don't
 * want the WebSocket lifecycle.
 */
export const finnhubQuote = createServerFn({ method: "POST" })
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
