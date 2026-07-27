/**
 * Twelve Data server proxy — the browser calls these server functions so the
 * Twelve Data API key stays on the server and CORS is a non-issue.
 *
 * Only env var (server-only):
 *   TWELVE_DATA_API_KEY — Twelve Data API key (free tier is fine to start).
 *
 * Two caching layers keep the free tier (8 req/min, 800/day) usable:
 *   1. In-memory quote cache: 12s TTL, keyed by symbol. Every browser tab
 *      polling the same symbol shares one upstream request per window.
 *   2. Historical candle cache: rows are read from `public.historical_candles`
 *      first; only the missing tail is fetched from Twelve Data and written
 *      back so future replay sessions reuse the data.
 *
 * When the key is missing every function returns { error: "twelvedata_not_configured" }
 * so the client provider surfaces a clear error instead of silently degrading.
 */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://api.twelvedata.com";
const QUOTE_TTL_MS = 12_000; // 10–15s cache window per the product spec.

const TF_TO_INTERVAL: Record<string, string> = {
  "1m": "1min", "3m": "5min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1H": "1h", "2H": "2h", "4H": "4h", "1D": "1day", "1W": "1week", "1M": "1month",
};

// Minutes per timeframe — used to build/read the DB candle cache window.
const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30,
  "1H": 60, "4H": 240, "1D": 1440, "1W": 10080, "1M": 43200,
};

/** Process-wide quote cache (12s). Survives across concurrent callers on the same worker. */
type CachedQuote = {
  symbol: string; bid: number; ask: number; last: number; spread: number;
  ts: number; change: number; percent_change: number;
};
const quoteCache = new Map<string, { value: CachedQuote; expires: number }>();

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

      const now = Date.now();
      const fresh: CachedQuote[] = [];
      const stale: string[] = [];
      for (const s of symbols) {
        const hit = quoteCache.get(s);
        if (hit && hit.expires > now) fresh.push(hit.value);
        else stale.push(s);
      }

      if (stale.length) {
        const raw = await td("/quote", { symbol: stale.join(",") });
        const list: any[] = stale.length === 1
          ? [raw]
          : Object.entries(raw).map(([sym, v]) => ({ symbol: sym, ...(v as any) }));
        for (const q of list) {
          const sym = (q.symbol ?? "").toString();
          if (!sym) continue;
          const price = Number(q.close ?? q.price ?? 0);
          const bid = Number(q.bid ?? price);
          const ask = Number(q.ask ?? price);
          const spread = ask - bid;
          const value: CachedQuote = {
            symbol: sym,
            bid, ask, last: price,
            spread: Number.isFinite(spread) && spread > 0 ? spread : price * 0.0001,
            ts: q.timestamp ? Number(q.timestamp) * 1000 : Date.now(),
            change: Number(q.change ?? 0),
            percent_change: Number(q.percent_change ?? 0),
          };
          quoteCache.set(sym, { value, expires: Date.now() + QUOTE_TTL_MS });
          fresh.push(value);
        }
      }

      // Preserve request order.
      const byKey = new Map(fresh.map((q) => [q.symbol, q]));
      return { quotes: symbols.map((s) => byKey.get(s)).filter(Boolean) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/**
 * Historical candles with cache-through against `public.historical_candles`.
 *
 *  1. Look up cached rows for the requested [from, to] window.
 *  2. If the window is fully covered, return cached rows.
 *  3. Otherwise fetch from Twelve Data, backfill the cache, then merge and return.
 */
export const twelveDataCandles = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; timeframe: string; from?: number; to?: number; count?: number }) => input)
  .handler(async ({ data }) => {
    try {
      const interval = TF_TO_INTERVAL[data.timeframe];
      if (!interval) throw new Error(`bad_timeframe:${data.timeframe}`);
      const tfMin = TF_MINUTES[data.timeframe] ?? 60;
      const to = data.to ?? Date.now();
      const from = data.from ?? to - (data.count ?? 500) * tfMin * 60_000;

      // ---------- 1. Try cache ----------
      let cached: any[] = [];
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin
          .from("historical_candles")
          .select("ts, open, high, low, close, volume")
          .eq("symbol", data.symbol).eq("timeframe", data.timeframe)
          .gte("ts", new Date(from).toISOString())
          .lte("ts", new Date(to).toISOString())
          .order("ts", { ascending: true }).limit(Math.min(5000, data.count ?? 5000));
        cached = rows ?? [];
      } catch {
        // If the cache layer is unavailable we still return live data below.
      }

      const cachedCandles = cached.map((r: any) => ({
        time: new Date(r.ts as string).getTime(),
        open: Number(r.open), high: Number(r.high),
        low: Number(r.low), close: Number(r.close),
        volume: Number(r.volume ?? 0),
      }));

      // Rough completeness check: if we have (close to) the expected bar count,
      // trust the cache and skip the upstream call.
      const expected = Math.max(1, Math.floor((to - from) / (tfMin * 60_000)));
      const coverage = cachedCandles.length / expected;
      if (cachedCandles.length && coverage >= 0.9) {
        return { candles: cachedCandles, cached: true };
      }

      // ---------- 2. Fetch from Twelve Data ----------
      const params: Record<string, string> = {
        symbol: data.symbol,
        interval,
        outputsize: String(Math.min(5000, data.count ?? 500)),
        order: "ASC",
        format: "JSON",
      };
      if (from) params.start_date = new Date(from).toISOString().slice(0, 19);
      if (to)   params.end_date   = new Date(to).toISOString().slice(0, 19);
      const res = await td("/time_series", params);
      const values: any[] = res?.values ?? [];
      const fetched = values.map((v) => ({
        time: new Date(v.datetime.replace(" ", "T") + "Z").getTime(),
        open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
        volume: Number(v.volume ?? 0),
      }));

      // ---------- 3. Backfill cache (best-effort, non-blocking failure modes) ----------
      if (fetched.length) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rows = fetched.map((c) => ({
            symbol: data.symbol,
            timeframe: data.timeframe,
            ts: new Date(c.time).toISOString(),
            open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
            source_code: "twelvedata",
          }));
          // Chunk to keep payloads reasonable.
          for (let i = 0; i < rows.length; i += 500) {
            await supabaseAdmin
              .from("historical_candles")
              .upsert(rows.slice(i, i + 500) as any, { onConflict: "symbol,timeframe,ts" });
          }
        } catch (e) {
          console.warn("[twelvedata] candle cache backfill failed:", (e as Error).message);
        }
      }

      // Merge cached + fetched (fetched wins for overlapping timestamps).
      const merged = new Map<number, any>();
      for (const c of cachedCandles) merged.set(c.time, c);
      for (const c of fetched) merged.set(c.time, c);
      const out = [...merged.values()].sort((a, b) => a.time - b.time);
      return { candles: out, cached: false };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
