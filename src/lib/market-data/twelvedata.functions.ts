/**
 * Twelve Data server proxy — the browser calls these server functions so the
 * Twelve Data API key stays on the server and CORS is a non-issue.
 *
 * Only env var (server-only):
 *   TWELVE_DATA_API_KEY — Twelve Data API key (free tier is fine to start).
 *
 * When the key is missing every function returns { error: "twelvedata_not_configured" }
 * so the client provider surfaces a clear error instead of silently degrading.
 */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://api.twelvedata.com";

const TF_TO_INTERVAL: Record<string, string> = {
  "1m": "1min", "3m": "5min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1H": "1h", "2H": "2h", "4H": "4h", "1D": "1day", "1W": "1week", "1M": "1month",
};

function key(): string {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error("twelvedata_not_configured");
  return k;
}

async function td(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, apikey: key() }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (!res.ok) throw new Error(`twelvedata_${res.status}`);
  const json = await res.json();
  // Twelve Data returns { status: "error", code, message } on error with HTTP 200.
  if (json && typeof json === "object" && json.status === "error") {
    throw new Error(`twelvedata_api:${json.code ?? ""}:${(json.message ?? "").toString().slice(0, 200)}`);
  }
  return json;
}

/** Configuration probe used by the client provider on boot. */
export const twelveDataStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = !!process.env.TWELVE_DATA_API_KEY;
  if (!configured) return { configured: false };
  try {
    // Cheap sanity ping — /api_usage requires the key and returns quota info.
    const j = await td("/api_usage", {});
    return { configured: true, plan: j?.plan_category ?? "unknown", credits_used: j?.api_credits_used ?? null };
  } catch (e) {
    return { configured: true, warning: (e as Error).message };
  }
});

/** Latest quote for one or more Twelve Data symbols ("EUR/USD", "XAU/USD", "SPX"). */
export const twelveDataQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[] }) => input)
  .handler(async ({ data }) => {
    try {
      const symbols = data.symbols.filter(Boolean);
      if (!symbols.length) return { quotes: [] };
      const raw = await td("/quote", { symbol: symbols.join(",") });
      // Twelve Data returns a single object when one symbol, or a keyed map when many.
      const list: any[] = symbols.length === 1
        ? [raw]
        : Object.entries(raw).map(([sym, v]) => ({ symbol: sym, ...(v as any) }));
      return {
        quotes: list.map((q) => {
          const price = Number(q.close ?? q.price ?? 0);
          // Twelve Data /quote does not always include bid/ask; synthesize a tiny spread.
          const bid = Number(q.bid ?? price);
          const ask = Number(q.ask ?? price);
          const spread = ask - bid;
          return {
            symbol: (q.symbol ?? "").toString(),
            bid, ask, last: price,
            spread: Number.isFinite(spread) && spread > 0 ? spread : price * 0.0001,
            ts: q.timestamp ? Number(q.timestamp) * 1000 : Date.now(),
            change: Number(q.change ?? 0),
            percent_change: Number(q.percent_change ?? 0),
          };
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/** Historical candles. */
export const twelveDataCandles = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; timeframe: string; from?: number; to?: number; count?: number }) => input)
  .handler(async ({ data }) => {
    try {
      const interval = TF_TO_INTERVAL[data.timeframe];
      if (!interval) throw new Error(`bad_timeframe:${data.timeframe}`);
      const params: Record<string, string> = {
        symbol: data.symbol,
        interval,
        outputsize: String(Math.min(5000, data.count ?? 500)),
        order: "ASC",
        format: "JSON",
      };
      if (data.from) params.start_date = new Date(data.from).toISOString().slice(0, 19);
      if (data.to)   params.end_date   = new Date(data.to).toISOString().slice(0, 19);
      const res = await td("/time_series", params);
      const values: any[] = res?.values ?? [];
      return {
        candles: values.map((v) => ({
          time: new Date(v.datetime.replace(" ", "T") + "Z").getTime(),
          open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
          volume: Number(v.volume ?? 0),
        })),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
