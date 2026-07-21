/**
 * Yahoo Finance server proxy — provides key-less near-live quotes and
 * historical candles for Forex, Metals and Indices. Calls are proxied
 * server-side so the browser is not subject to Yahoo's CORS restrictions
 * and so we can set a real User-Agent (Yahoo returns 401 without one).
 *
 * No API key required. Quotes are typically delayed 10-30 seconds.
 */
import { createServerFn } from "@tanstack/react-start";

const QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (compatible; TradersHIVE/1.0; +https://tradershive.lovable.app)";

// Timeframe → Yahoo interval. Yahoo enforces a max range per interval:
// intraday <= 60d for 1m, ~7d optimum. We clamp below.
const TF_TO_INTERVAL: Record<string, string> = {
  "1m": "1m", "3m": "2m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1H": "60m", "2H": "60m", "4H": "60m",
  "1D": "1d", "1W": "1wk", "1M": "1mo",
};

async function yf(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`yahoo_${res.status}`);
  return res.json();
}

/** Boot-time probe so the provider knows it's reachable. */
export const yahooStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await yf(`${QUOTE_URL}?symbols=EURUSD=X`);
    return { configured: true };
  } catch (e) {
    return { configured: true, warning: (e as Error).message };
  }
});

/** Latest quote for one or more Yahoo symbols (e.g. "EURUSD=X", "XAUUSD=X", "^GSPC"). */
export const yahooQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[] }) => input)
  .handler(async ({ data }) => {
    try {
      const symbols = data.symbols.filter(Boolean);
      if (!symbols.length) return { quotes: [] };
      const url = `${QUOTE_URL}?symbols=${encodeURIComponent(symbols.join(","))}`;
      const j = await yf(url);
      const list: any[] = j?.quoteResponse?.result ?? [];
      return {
        quotes: list.map((q) => {
          const price = Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0);
          const bid = Number(q.bid ?? price);
          const ask = Number(q.ask ?? price);
          const spread = ask - bid;
          return {
            symbol: (q.symbol ?? "").toString(),
            bid, ask, last: price,
            spread: Number.isFinite(spread) && spread > 0 ? spread : price * 0.0001,
            ts: (q.regularMarketTime ? Number(q.regularMarketTime) * 1000 : Date.now()),
            change: Number(q.regularMarketChange ?? 0),
            percent_change: Number(q.regularMarketChangePercent ?? 0),
          };
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/** Historical candles via Yahoo's chart endpoint. */
export const yahooCandles = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; timeframe: string; from?: number; to?: number; count?: number }) => input)
  .handler(async ({ data }) => {
    try {
      const interval = TF_TO_INTERVAL[data.timeframe];
      if (!interval) throw new Error(`bad_timeframe:${data.timeframe}`);
      const params = new URLSearchParams({ interval, includePrePost: "false", events: "div,split" });
      if (data.from && data.to) {
        params.set("period1", String(Math.floor(data.from / 1000)));
        params.set("period2", String(Math.floor(data.to / 1000)));
      } else {
        // Sensible default ranges per interval.
        const range = interval === "1m" ? "5d"
          : interval === "2m" || interval === "5m" ? "1mo"
          : interval === "15m" || interval === "30m" ? "1mo"
          : interval === "60m" ? "3mo"
          : interval === "1d" ? "2y"
          : "5y";
        params.set("range", range);
      }
      const url = `${CHART_URL}/${encodeURIComponent(data.symbol)}?${params.toString()}`;
      const j = await yf(url);
      const r = j?.chart?.result?.[0];
      if (!r) return { candles: [] };
      const ts: number[] = r.timestamp ?? [];
      const q = r.indicators?.quote?.[0] ?? {};
      const opens = q.open ?? []; const highs = q.high ?? [];
      const lows = q.low ?? []; const closes = q.close ?? []; const vols = q.volume ?? [];
      const candles = ts.map((t: number, i: number) => ({
        time: t * 1000,
        open: Number(opens[i] ?? closes[i] ?? 0),
        high: Number(highs[i] ?? closes[i] ?? 0),
        low: Number(lows[i] ?? closes[i] ?? 0),
        close: Number(closes[i] ?? 0),
        volume: Number(vols[i] ?? 0),
      })).filter((c) => Number.isFinite(c.close) && c.close > 0);
      return { candles };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
