/**
 * Historical Data Providers (server-only).
 *
 * Each provider fetches raw OHLCV from an external source and returns
 * normalized HistoricalCandle[] in UTC. Fully server-side to avoid
 * exposing endpoints to the browser and to enable node-fetch use.
 */

import type { HistoricalCandle, HistoricalTimeframe } from "./types";
import { HISTORICAL_TF_SECONDS } from "./types";

export interface HistoricalDataProvider {
  readonly code: string;
  readonly label: string;
  readonly supports: HistoricalTimeframe[];
  fetchCandles(opts: {
    nativeSymbol: string;
    timeframe: HistoricalTimeframe;
    from: number; // epoch ms
    to: number;   // epoch ms
  }): Promise<HistoricalCandle[]>;
  earliest(nativeSymbol: string): Promise<number | null>;
}

/* ------------------------------ Binance ------------------------------ */

const BINANCE_REST = "https://api.binance.com";

const BINANCE_TF: Partial<Record<HistoricalTimeframe, string>> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w", "1M": "1M",
};

export class BinanceHistoricalProvider implements HistoricalDataProvider {
  readonly code = "binance";
  readonly label = "Binance";
  readonly supports: HistoricalTimeframe[] = ["1m","5m","15m","30m","1H","4H","1D","1W","1M"];

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<HistoricalCandle[]> {
    const interval = BINANCE_TF[timeframe];
    if (!interval) throw new Error(`Binance: unsupported timeframe ${timeframe}`);
    const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;
    const out: HistoricalCandle[] = [];
    let cursor = from;
    // Binance max limit 1000 per call.
    while (cursor < to) {
      const url = new URL(`${BINANCE_REST}/api/v3/klines`);
      url.searchParams.set("symbol", nativeSymbol.toUpperCase());
      url.searchParams.set("interval", interval);
      url.searchParams.set("startTime", String(cursor));
      url.searchParams.set("endTime", String(to));
      url.searchParams.set("limit", "1000");
      const res = await fetch(url.toString());
      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        throw new Error(`Binance HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const rows = (await res.json()) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const r of rows) {
        const a = r as [number, string, string, string, string, string];
        const ts = Number(a[0]);
        const o = Number(a[1]);
        const h = Number(a[2]);
        const l = Number(a[3]);
        const c = Number(a[4]);
        const v = Number(a[5]);
        if (!Number.isFinite(o + h + l + c)) continue;
        out.push({ ts, open: o, high: h, low: l, close: c, volume: v });
      }
      const last = out[out.length - 1];
      if (!last) break;
      const next = last.ts + stepMs;
      if (next <= cursor) break;
      cursor = next;
      if (rows.length < 1000) break;
      // Gentle throttle to respect weight limits.
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    // Binance klines with startTime=0 returns the first available candle.
    const url = new URL(`${BINANCE_REST}/api/v3/klines`);
    url.searchParams.set("symbol", nativeSymbol.toUpperCase());
    url.searchParams.set("interval", "1M");
    url.searchParams.set("startTime", "0");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const rows = (await res.json()) as [number, ...unknown[]][];
    return rows?.[0]?.[0] ?? null;
  }
}

/* ------------------------------ Stooq ------------------------------
 *
 * Free, no-key daily OHLC feed for FX / metals / indices / commodities.
 * Daily resolution only — intraday for these symbols must come from a
 * different provider (Twelve Data today).
 *
 * NOTE: this provider was historically mis-registered under the code
 * "dukascopy". No Dukascopy code has ever run. `LEGACY_PROVIDER_CODES`
 * keeps old rows resolvable while the DB is migrated to "stooq".
 */

const STOOQ_BASE = "https://stooq.com/q/d/l/";

export class StooqHistoricalProvider implements HistoricalDataProvider {
  readonly code = "stooq";
  readonly label = "Stooq (daily)";
  readonly supports: HistoricalTimeframe[] = ["1D", "1W", "1M"];

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<HistoricalCandle[]> {
    if (!this.supports.includes(timeframe)) {
      throw new Error(`Stooq: intraday not supported (${timeframe}). Daily (1D) and above only.`);
    }
    const interval = timeframe === "1D" ? "d" : timeframe === "1W" ? "w" : "m";

    const url = new URL(STOOQ_BASE);
    url.searchParams.set("s", nativeSymbol.toLowerCase());
    url.searchParams.set("i", interval);
    const res = await fetch(url.toString(), { headers: { "User-Agent": "TradersHIVE/1.0" } });
    if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
    const csv = await res.text();
    if (!csv || csv.toLowerCase().startsWith("no data")) return [];
    // Stooq now serves a JavaScript proof-of-work interstitial to non-browser
    // clients. Never treat that HTML as "no candles" — fail loudly so the
    // import job records a real error instead of silently importing nothing.
    const head = csv.trimStart().slice(0, 200).toLowerCase();
    if (head.startsWith("<") || head.includes("<!doctype") || head.includes("requires javascript")) {
      throw new Error(
        "Stooq returned a browser-verification page instead of CSV. This provider is currently blocked for server-side download; no data was imported.",
      );
    }
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    if (!/^date,/i.test(lines[0])) {
      throw new Error(`Stooq returned an unexpected response format: ${lines[0].slice(0, 80)}`);
    }
    const out: HistoricalCandle[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [date, o, h, l, c, v] = lines[i].split(",");
      if (!date || !o) continue;
      const ts = new Date(`${date}T00:00:00Z`).getTime();
      if (!Number.isFinite(ts) || ts < from || ts > to) continue;
      const op = Number(o), hi = Number(h), lo = Number(l), cl = Number(c);
      if (!Number.isFinite(op + hi + lo + cl)) continue;
      out.push({ ts, open: op, high: hi, low: lo, close: cl, volume: Number(v || 0) });
    }
    return out;
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    const candles = await this.fetchCandles({
      nativeSymbol, timeframe: "1D",
      from: 0, to: Date.now(),
    });
    return candles[0]?.ts ?? null;
  }
}

/* --------------------------- Twelve Data ---------------------------
 *
 * Canonical historical source for forex, metals, indices, commodities and
 * stocks. Intraday + daily. Key lives on the server only.
 */

const TD_BASE = "https://api.twelvedata.com";

const TD_INTERVAL: Partial<Record<HistoricalTimeframe, string>> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1H": "1h", "4H": "4h", "1D": "1day", "1W": "1week", "1M": "1month",
};

/** Structured provider failure — always actionable, never silent. */
export class HistoricalProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
    readonly detail: {
      httpStatus?: number;
      responseType?: string;
      apiCode?: string;
      symbol?: string;
      timeframe?: string;
      body?: string;
    } = {},
  ) {
    super(
      `[${provider}] ${reason}` +
        (detail.httpStatus ? ` (HTTP ${detail.httpStatus})` : "") +
        (detail.responseType ? ` [${detail.responseType}]` : "") +
        (detail.body ? `: ${detail.body.slice(0, 200)}` : ""),
    );
    this.name = "HistoricalProviderError";
  }
}

export class TwelveDataHistoricalProvider implements HistoricalDataProvider {
  readonly code = "twelvedata";
  readonly label = "Twelve Data";
  readonly supports: HistoricalTimeframe[] = ["1m","5m","15m","30m","1H","4H","1D","1W","1M"];

  private key(): string {
    const k = process.env.TWELVE_DATA_API_KEY;
    if (!k) {
      throw new HistoricalProviderError("twelvedata", "API key not configured (TWELVE_DATA_API_KEY missing)", {
        reason: "not_configured",
      } as any);
    }
    return k;
  }

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<HistoricalCandle[]> {
    const interval = TD_INTERVAL[timeframe];
    if (!interval) {
      throw new HistoricalProviderError("twelvedata", `unsupported timeframe ${timeframe}`, { symbol: nativeSymbol });
    }
    const apikey = this.key();
    const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;
    const PAGE = 5000;
    const out: HistoricalCandle[] = [];
    let cursor = from;
    let guard = 0;

    while (cursor < to && guard++ < 50) {
      const pageTo = Math.min(to, cursor + PAGE * stepMs);
      const qs = new URLSearchParams({
        symbol: nativeSymbol,
        interval,
        order: "ASC",
        format: "JSON",
        outputsize: String(PAGE),
        start_date: new Date(cursor).toISOString().slice(0, 19),
        end_date: new Date(pageTo).toISOString().slice(0, 19),
        apikey,
      });
      const res = await fetch(`${TD_BASE}/time_series?${qs.toString()}`);
      const contentType = res.headers.get("content-type") ?? "unknown";

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new HistoricalProviderError(
          "twelvedata",
          res.status === 429 ? "rate limit exceeded" : "upstream request failed",
          { httpStatus: res.status, responseType: contentType, symbol: nativeSymbol, timeframe, body },
        );
      }
      if (!contentType.includes("json")) {
        const body = await res.text().catch(() => "");
        throw new HistoricalProviderError("twelvedata", "non-JSON response (possible interstitial or proxy page)", {
          httpStatus: res.status, responseType: contentType, symbol: nativeSymbol, timeframe, body,
        });
      }

      const json = (await res.json()) as any;
      if (json?.status === "error") {
        throw new HistoricalProviderError("twelvedata", String(json.message ?? "API error"), {
          httpStatus: res.status, responseType: contentType, apiCode: String(json.code ?? ""),
          symbol: nativeSymbol, timeframe,
        });
      }
      const values: any[] = Array.isArray(json?.values) ? json.values : [];
      if (!values.length) break;

      let lastTs = cursor;
      for (const v of values) {
        const ts = new Date(String(v.datetime).replace(" ", "T") + (String(v.datetime).length <= 10 ? "T00:00:00Z" : "Z")).getTime();
        if (!Number.isFinite(ts) || ts < from || ts > to) continue;
        const o = Number(v.open), h = Number(v.high), l = Number(v.low), c = Number(v.close);
        if (!Number.isFinite(o + h + l + c)) continue;
        out.push({ ts, open: o, high: h, low: l, close: c, volume: Number(v.volume ?? 0) });
        if (ts > lastTs) lastTs = ts;
      }

      const next = lastTs + stepMs;
      if (next <= cursor) break;
      cursor = next;
      if (values.length < PAGE) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    out.sort((a, b) => a.ts - b.ts);
    return out;
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    try {
      const qs = new URLSearchParams({
        symbol: nativeSymbol, interval: "1month", order: "ASC",
        outputsize: "1", format: "JSON", apikey: this.key(),
      });
      const res = await fetch(`${TD_BASE}/time_series?${qs.toString()}`);
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const first = json?.values?.[0]?.datetime;
      if (!first) return null;
      const ts = new Date(String(first).replace(" ", "T") + "Z").getTime();
      return Number.isFinite(ts) ? ts : null;
    } catch {
      return null;
    }
  }
}

/* ------------------------------ Registry ------------------------------ */

const REGISTRY: Record<string, HistoricalDataProvider> = {
  binance: new BinanceHistoricalProvider(),
  twelvedata: new TwelveDataHistoricalProvider(),
  // Optional, disabled by default — only reachable when a caller explicitly
  // requests it AND ENABLE_STOOQ_HISTORICAL=true (see historical/routing.ts).
  stooq: new StooqHistoricalProvider(),
};

/**
 * Codes that exist in older DB rows and must keep resolving until the
 * data migration has propagated everywhere.
 */
export const LEGACY_PROVIDER_CODES: Record<string, string> = {
  dukascopy: "stooq",
};

export function canonicalProviderCode(code: string): string {
  return LEGACY_PROVIDER_CODES[code] ?? code;
}

export function getHistoricalProvider(code: string): HistoricalDataProvider {
  const p = REGISTRY[canonicalProviderCode(code)];
  if (!p) throw new Error(`Unknown historical provider: ${code}`);
  return p;
}

export function listHistoricalProviders(): HistoricalDataProvider[] {
  return Object.values(REGISTRY);
}


