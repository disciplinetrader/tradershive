/**
 * Twelve Data server proxy — the browser calls these server functions so the
 * Twelve Data API key stays on the server and CORS is a non-issue.
 *
 * Reliability layers (Free Twelve Data plan: ~8 req/min, ~800 req/day):
 *   1. In-memory quote cache: 12s TTL, keyed by symbol.
 *   2. In-flight request coalescing: concurrent callers for the same
 *      symbol share ONE upstream request instead of firing in parallel.
 *   3. Usage tracker: per-minute and per-day counters. Once we cross
 *      the daily 80% threshold the client is told to slow down; once
 *      we're at 100% we hard-stop upstream calls until the next
 *      calendar day.
 *   4. Historical candle cache in `public.historical_candles`. We only
 *      fetch what's missing and always download a small buffer around
 *      the requested window so subsequent replay sessions hit cache.
 */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://api.twelvedata.com";
const QUOTE_TTL_MS = 12_000;

// Free-tier ceilings. Conservative — the real plan limits are slightly higher.
const DAILY_LIMIT = 800;
const MINUTE_LIMIT = 8;
const DAILY_SOFT = Math.floor(DAILY_LIMIT * 0.8); // 640 → begin cooldown

const TF_TO_INTERVAL: Record<string, string> = {
  "1m": "1min", "3m": "5min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1H": "1h", "2H": "2h", "4H": "4h", "1D": "1day", "1W": "1week", "1M": "1month",
};

const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30,
  "1H": 60, "4H": 240, "1D": 1440, "1W": 10080, "1M": 43200,
};

/** Process-wide quote cache (12s). */
type CachedQuote = {
  symbol: string; bid: number; ask: number; last: number; spread: number;
  ts: number; change: number; percent_change: number;
};
const quoteCache = new Map<string, { value: CachedQuote; expires: number }>();

/* --------------- usage tracker --------------- */

type Usage = {
  day: string;            // yyyy-mm-dd (UTC)
  daily: number;
  minuteStart: number;    // epoch ms of current minute window
  minute: number;
  lastRequestTs: number;
  lastErrorAt: number;
  lastError: string | null;
  cooldownUntil: number;  // epoch ms — refuse upstream until this
};
const usage: Usage = {
  day: utcDay(),
  daily: 0,
  minuteStart: Date.now(),
  minute: 0,
  lastRequestTs: 0,
  lastErrorAt: 0,
  lastError: null,
  cooldownUntil: 0,
};

function utcDay(): string { return new Date().toISOString().slice(0, 10); }

function rollWindows() {
  const now = Date.now();
  const today = utcDay();
  if (today !== usage.day) { usage.day = today; usage.daily = 0; }
  if (now - usage.minuteStart >= 60_000) {
    usage.minuteStart = now;
    usage.minute = 0;
  }
}

function canCall(): { ok: true } | { ok: false; reason: "quota_exhausted" | "cooldown" | "minute_limit" } {
  rollWindows();
  const now = Date.now();
  if (now < usage.cooldownUntil) return { ok: false, reason: "cooldown" };
  if (usage.daily >= DAILY_LIMIT) return { ok: false, reason: "quota_exhausted" };
  if (usage.minute >= MINUTE_LIMIT) return { ok: false, reason: "minute_limit" };
  return { ok: true };
}

function recordCall() { rollWindows(); usage.daily += 1; usage.minute += 1; usage.lastRequestTs = Date.now(); }
function recordError(msg: string, backoffMs: number) {
  usage.lastErrorAt = Date.now();
  usage.lastError = msg.slice(0, 200);
  usage.cooldownUntil = Math.max(usage.cooldownUntil, Date.now() + backoffMs);
}

/* --------------- in-flight coalescing --------------- */

const inflight = new Map<string, Promise<any>>();
function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/* --------------- request helper --------------- */

function key(): string {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error("twelvedata_not_configured");
  return k;
}

async function td(path: string, params: Record<string, string>): Promise<any> {
  const gate = canCall();
  if (!gate.ok) throw new Error(gate.reason);
  const qs = new URLSearchParams({ ...params, apikey: key() }).toString();
  recordCall();
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (res.status === 429) {
    recordError("rate_limited", 60_000);
    throw new Error("twelvedata_429");
  }
  if (!res.ok) { recordError(`http_${res.status}`, 15_000); throw new Error(`twelvedata_${res.status}`); }
  const json = await res.json();
  if (json && typeof json === "object" && json.status === "error") {
    const code = String(json.code ?? "");
    const message = (json.message ?? "").toString();
    // 429 sometimes surfaces as JSON error with code 429.
    if (code === "429" || /rate/i.test(message)) recordError("rate_limited", 60_000);
    else recordError(`api_${code}`, 5_000);
    throw new Error(`twelvedata_api:${code}:${message.slice(0, 200)}`);
  }
  return json;
}

/* --------------- server functions --------------- */

/** Configuration probe used by the client provider on boot. */
export const twelveDataStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = !!process.env.TWELVE_DATA_API_KEY;
  if (!configured) return { configured: false };
  // Do NOT call /api_usage on every boot — it consumes a request. Assume "free"
  // and let the runtime usage tracker do the accounting.
  return { configured: true, plan: "free" };
});

/** Live usage snapshot for the diagnostics panel. Cheap — no upstream call. */
export const twelveDataUsage = createServerFn({ method: "GET" }).handler(async () => {
  rollWindows();
  const now = Date.now();
  return {
    configured: !!process.env.TWELVE_DATA_API_KEY,
    day: usage.day,
    daily: usage.daily,
    dailyLimit: DAILY_LIMIT,
    dailySoft: DAILY_SOFT,
    dailyRemaining: Math.max(0, DAILY_LIMIT - usage.daily),
    minute: usage.minute,
    minuteLimit: MINUTE_LIMIT,
    lastRequestTs: usage.lastRequestTs,
    lastError: usage.lastError,
    lastErrorAt: usage.lastErrorAt,
    cooldownUntil: usage.cooldownUntil,
    cooldownRemainingMs: Math.max(0, usage.cooldownUntil - now),
    quoteCacheSize: quoteCache.size,
    // Thresholds the client uses to tune cadence.
    softThrottle: usage.daily >= DAILY_SOFT,
    exhausted: usage.daily >= DAILY_LIMIT || now < usage.cooldownUntil,
  };
});

/** Latest quote for one or more Twelve Data symbols. */
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
        // Coalesce concurrent identical requests. Sort so callers with the
        // same symbol set share one upstream call.
        const coalesceKey = "q:" + stale.slice().sort().join(",");
        try {
          const raw = await coalesce(coalesceKey, () => td("/quote", { symbol: stale.join(",") }));
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
              symbol: sym, bid, ask, last: price,
              spread: Number.isFinite(spread) && spread > 0 ? spread : price * 0.0001,
              ts: q.timestamp ? Number(q.timestamp) * 1000 : Date.now(),
              change: Number(q.change ?? 0),
              percent_change: Number(q.percent_change ?? 0),
            };
            quoteCache.set(sym, { value, expires: Date.now() + QUOTE_TTL_MS });
            fresh.push(value);
          }
        } catch (e) {
          // Serve stale cache if we have anything at all rather than a hard failure.
          const msg = (e as Error).message;
          if (fresh.length) return { quotes: fresh, degraded: true, error: msg };
          return { error: msg };
        }
      }

      const byKey = new Map(fresh.map((q) => [q.symbol, q]));
      return { quotes: symbols.map((s) => byKey.get(s)).filter(Boolean) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/**
 * Historical candles with cache-through against `public.historical_candles`.
 *
 *  1. Read cached rows for the requested [from, to] window.
 *  2. If cache covers >=90% of expected bars, return cache only.
 *  3. Otherwise fetch a slightly WIDER window (25% buffer on each side, capped
 *     at 5000 bars) from Twelve Data so future queries around the same date
 *     also hit cache, then backfill and merge.
 */
export const twelveDataCandles = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; timeframe: string; from?: number; to?: number; count?: number; buffer?: boolean }) => input)
  .handler(async ({ data }) => {
    try {
      const interval = TF_TO_INTERVAL[data.timeframe];
      if (!interval) throw new Error(`bad_timeframe:${data.timeframe}`);
      const tfMin = TF_MINUTES[data.timeframe] ?? 60;
      const to = data.to ?? Date.now();
      const from = data.from ?? to - (data.count ?? 500) * tfMin * 60_000;
      const wantBuffer = data.buffer !== false;

      // ---------- 1. Try cache ----------
      let cached: any[] = [];
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin
          .from("historical_candles")
          .select("ts, open, high, low, close, volume")
          .eq("symbol", data.symbol).eq("timeframe", data.timeframe as any)
          .gte("ts", new Date(from).toISOString())
          .lte("ts", new Date(to).toISOString())
          .order("ts", { ascending: true }).limit(Math.min(5000, data.count ?? 5000));
        cached = rows ?? [];
      } catch { /* cache down — still serve live */ }

      const cachedCandles = cached.map((r: any) => ({
        time: new Date(r.ts as string).getTime(),
        open: Number(r.open), high: Number(r.high),
        low: Number(r.low), close: Number(r.close),
        volume: Number(r.volume ?? 0),
      }));

      const expected = Math.max(1, Math.floor((to - from) / (tfMin * 60_000)));
      const coverage = cachedCandles.length / expected;
      if (cachedCandles.length && coverage >= 0.9) {
        return { candles: cachedCandles, cached: true };
      }

      // ---------- 2. Coalesced fetch from Twelve Data with buffer window ----------
      const bufferMs = wantBuffer ? (to - from) * 0.25 : 0;
      const fetchFrom = Math.max(0, Math.floor(from - bufferMs));
      const fetchTo = Math.floor(to + bufferMs);
      const cacheKey = `c:${data.symbol}:${data.timeframe}:${fetchFrom}:${fetchTo}`;

      const values = await coalesce(cacheKey, async () => {
        const params: Record<string, string> = {
          symbol: data.symbol, interval,
          outputsize: String(Math.min(5000, Math.max(data.count ?? 500, Math.floor(expected * 1.5)))),
          order: "ASC", format: "JSON",
        };
        params.start_date = new Date(fetchFrom).toISOString().slice(0, 19);
        params.end_date   = new Date(fetchTo).toISOString().slice(0, 19);
        const res = await td("/time_series", params);
        return (res?.values ?? []) as any[];
      });

      const fetched = values.map((v) => ({
        time: new Date(v.datetime.replace(" ", "T") + "Z").getTime(),
        open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
        volume: Number(v.volume ?? 0),
      }));

      // ---------- 3. Backfill cache (best-effort) ----------
      if (fetched.length) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rows = fetched.map((c) => ({
            symbol: data.symbol, timeframe: data.timeframe as any,
            ts: new Date(c.time).toISOString(),
            open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
            source_code: "twelvedata",
          }));
          for (let i = 0; i < rows.length; i += 500) {
            await supabaseAdmin
              .from("historical_candles")
              .upsert(rows.slice(i, i + 500) as any, { onConflict: "symbol,timeframe,ts" });
          }
        } catch (e) {
          console.warn("[twelvedata] candle cache backfill failed:", (e as Error).message);
        }
      }

      // Merge and clip back to the originally requested window.
      const merged = new Map<number, any>();
      for (const c of cachedCandles) merged.set(c.time, c);
      for (const c of fetched) merged.set(c.time, c);
      const out = [...merged.values()]
        .filter((c) => c.time >= from && c.time <= to)
        .sort((a, b) => a.time - b.time);
      return { candles: out, cached: false };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
