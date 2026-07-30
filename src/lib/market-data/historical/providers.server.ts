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
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
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

/* ------------------------------ Registry ------------------------------ */

const REGISTRY: Record<string, HistoricalDataProvider> = {
  binance: new BinanceHistoricalProvider(),
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

