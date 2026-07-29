/**
 * MarketDataEngine — the ONLY interface every module uses to reach a provider.
 *
 * Selection is driven by DB-backed assignments (Admin Panel → Market Data).
 * At boot the engine calls `listMarketAssignments` and caches the result;
 * `pickProvider(market)` then resolves to `primary` (with automatic failover
 * to `fallback` when primary is unavailable). Silent mock fallback is never
 * used — if no provider is configured, a `MarketProviderUnavailableError` is
 * thrown so the UI can surface an actionable message.
 */

import { CANDLE_CACHE_MS, QUOTE_CACHE_MS } from "./constants";
import { TTLCache } from "./cache";
import { bootstrapProviders, getProvider, listProviders } from "./providers/registry";
import { getActiveSessions, getNextSession } from "./sessions";
import { MarketProviderUnavailableError } from "./errors";
import { listMarketAssignments } from "./admin.functions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderStatus, Quote, QuoteHandler, SearchQuery, SessionWindow,
  SubscriptionHandle, SymbolMeta,
} from "./types";

// Sensible defaults used only until DB assignments load, so first-render
// components on public routes don't crash the engine.
const DEFAULT_ASSIGNMENTS: Partial<Record<MarketKind, { primary: string; fallback: string | null }>> = {
  crypto:      { primary: "binance",    fallback: null },
  // Twelve Data is the single non-crypto provider — set TWELVE_DATA_API_KEY.
  forex:       { primary: "twelvedata", fallback: null },
  metals:      { primary: "twelvedata", fallback: null },
  indices:     { primary: "twelvedata", fallback: null },
  commodities: { primary: "twelvedata", fallback: null },
  stocks:      { primary: "twelvedata", fallback: null },
  futures:     { primary: "twelvedata", fallback: null },
};

type Assignment = { primary: string; fallback: string | null };

class MarketDataEngine {
  private quoteCache = new TTLCache<Quote>(QUOTE_CACHE_MS);
  private candleCache = new TTLCache<Candle[]>(CANDLE_CACHE_MS);
  private fanout = new Map<string, { upstream: SubscriptionHandle; handlers: Set<QuoteHandler> }>();
  private assignments = new Map<MarketKind, Assignment>();
  private initialized = false;
  private loadPromise: Promise<void> | null = null;

  init() {
    bootstrapProviders();
    if (this.initialized) return;
    this.initialized = true;
    // Seed defaults so consumers work while DB assignments load.
    for (const [k, v] of Object.entries(DEFAULT_ASSIGNMENTS)) {
      if (v) this.assignments.set(k as MarketKind, v);
    }
    // Warm every registered provider (non-blocking).
    for (const p of listProviders()) {
      if (p.status() === "disabled") continue;
      void p.connect().catch((e) => console.warn(`[market-data] ${p.code} connect failed:`, e));
    }
    void this.loadAssignments();
  }

  /** Re-load provider→market assignments from the database. */
  async loadAssignments(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const rows = await listMarketAssignments();
        for (const r of rows) {
          if (!r.primary_code) continue;
          this.assignments.set(r.market_kind as MarketKind, {
            primary: r.primary_code,
            fallback: r.fallback_code ?? null,
          });
        }
      } catch (e) {
        console.warn("[market-data] failed to load assignments:", e);
      } finally {
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  listProviders(): MarketDataProvider[] { return listProviders(); }

  pickProvider(market?: MarketKind, symbol?: string): MarketDataProvider {
    return this.resolveProvider(market, symbol, /*live*/ false);
  }

  /** Live quote / subscribe routing. Consults VITE_LIVE_FOREX_PROVIDER
   *  to swap the forex live-data source (POC — Finnhub eval) without
   *  affecting historical candles, which always use pickProvider(). */
  pickLiveQuoteProvider(market?: MarketKind, symbol?: string): MarketDataProvider {
    return this.resolveProvider(market, symbol, /*live*/ true);
  }

  private resolveProvider(market: MarketKind | undefined, symbol: string | undefined, live: boolean): MarketDataProvider {
    const effective = market ?? inferMarketFromSymbol(symbol);
    if (!effective) {
      const any = listProviders().find((p) => p.status() !== "disabled");
      if (any) return any;
      throw new MarketProviderUnavailableError({ reason: "not_assigned" });
    }
    let a = this.assignments.get(effective);
    if (!a) throw new MarketProviderUnavailableError({ market: effective, reason: "not_assigned" });

    // POC override: live forex quotes may be routed to Finnhub via env flag.
    if (live && effective === "forex") {
      const flag = (import.meta as any).env?.VITE_LIVE_FOREX_PROVIDER as string | undefined;
      if (flag && flag !== a.primary) {
        a = { primary: flag, fallback: a.primary };
      }
    }

    const readable = (p?: MarketDataProvider): p is MarketDataProvider =>
      !!p && p.status() !== "disabled" && p.capabilities.markets.includes(effective);

    const primary = getProvider(a.primary);
    if (readable(primary)) return primary;

    const fallback = a.fallback ? getProvider(a.fallback) : undefined;
    if (readable(fallback)) {
      console.warn(`[market-data] ${effective}: primary "${a.primary}" unavailable, using fallback "${a.fallback}".`);
      return fallback;
    }
    throw new MarketProviderUnavailableError({
      market: effective, reason: primary ? "not_configured" : "not_assigned",
      providerCode: a.primary,
    });
  }


  async searchSymbols(q: SearchQuery): Promise<SymbolMeta[]> { return this.pickProvider(q.market).searchSymbols(q); }
  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> { return this.pickProvider(market).getSymbols(market); }

  async getQuote(symbol: string, market?: MarketKind): Promise<Quote> {
    const cached = this.quoteCache.get(symbol);
    if (cached) return cached;
    const q = await this.pickLiveQuoteProvider(market, symbol).getQuote(symbol);
    this.quoteCache.set(symbol, q);
    return q;
  }

  async getCandles(q: CandleQuery, market?: MarketKind): Promise<Candle[]> {
    const key = `${q.symbol}|${q.timeframe}|${q.from}|${q.to}|${q.limit ?? "*"}`;
    const cached = this.candleCache.get(key);
    if (cached) return cached;
    const out = await this.pickProvider(market, q.symbol).getCandles(q);
    if (out.length) this.candleCache.set(key, out);
    return out;
  }
  getHistoricalData(q: CandleQuery, market?: MarketKind) { return this.getCandles(q, market); }

  private warnedMarkets = new Set<string>();
  subscribe(symbol: string, handler: QuoteHandler, market?: MarketKind): SubscriptionHandle {
    let entry = this.fanout.get(symbol);
    if (!entry) {
      let p: MarketDataProvider;
      try { p = this.pickLiveQuoteProvider(market, symbol); }
      catch (e) {
        const key = market ?? inferMarketFromSymbol(symbol) ?? "unknown";
        if (!this.warnedMarkets.has(key)) {
          this.warnedMarkets.add(key);
          console.warn(`[market-data] ${key} provider unavailable — assign one in Admin → Market Data. (${(e as Error).message})`);
        }
        return { id: `noop-${symbol}`, symbol, unsubscribe: () => {} };
      }
      void p.connect();
      const upstream = p.subscribe(symbol, (q) => {
        this.quoteCache.set(symbol, q);
        const cur = this.fanout.get(symbol);
        if (!cur) return;
        for (const h of cur.handlers) { try { h(q); } catch { /* noop */ } }
      });
      entry = { upstream, handlers: new Set() };
      this.fanout.set(symbol, entry);
    }
    entry.handlers.add(handler);
    const c = this.quoteCache.get(symbol); if (c) try { handler(c); } catch { /* noop */ }
    const id = `fan-${symbol}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id, symbol,
      unsubscribe: () => {
        const cur = this.fanout.get(symbol);
        if (!cur) return;
        cur.handlers.delete(handler);
        if (cur.handlers.size === 0) {
          cur.upstream.unsubscribe();
          this.fanout.delete(symbol);
        }
      },
    };
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    try { return await this.pickProvider(market).getMarketStatus(market); }
    catch { return { market, status: "closed" }; }
  }

  async getSessions(): Promise<SessionWindow[]> {
    const p = listProviders().find((p) => p.status() !== "disabled") ?? listProviders()[0];
    return p ? p.getSessions() : [];
  }

  activeSessions() { return getActiveSessions(); }
  nextSession() { return getNextSession(); }

  cacheStats() { return { quotes: this.quoteCache.size(), candles: this.candleCache.size(), subscriptions: this.fanout.size }; }
  clearCache() { this.quoteCache.clear(); this.candleCache.clear(); }

  health(): { code: string; name: string; status: ProviderStatus }[] {
    return listProviders().map((p) => ({ code: p.code, name: p.name, status: p.status() }));
  }

  /** Legacy accessor kept for old callers — no-op. */
  setStrategy(_: unknown) { /* deprecated; use Admin Panel */ }
}

/**
 * Best-effort market inference from a symbol. Used when a caller subscribes
 * without specifying `market` (e.g. the chart engine reading a saved symbol).
 * Prevents falling into the "no market → no provider" branch for obvious
 * crypto/forex/metal tickers.
 */
function inferMarketFromSymbol(symbol?: string): MarketKind | undefined {
  if (!symbol) return undefined;
  const s = symbol.toUpperCase().replace(/[\/\-_:]/g, "");
  // Crypto quote assets
  if (/(USDT|USDC|BUSD|DAI|BTC|ETH|BNB)$/.test(s) && !/^(EUR|GBP|USD|JPY|CHF|CAD|AUD|NZD)/.test(s.slice(0, 3))) return "crypto";
  if (/^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|MATIC|LTC|LINK|DOT|AVAX|TRX|SHIB|TON|APT|ARB|OP|NEAR|ATOM|FIL|ICP|SUI)/.test(s)) return "crypto";
  // Metals
  if (/^(XAU|XAG|XPT|XPD)/.test(s)) return "metals";
  // Forex majors — 6-letter FX code
  if (/^(EUR|GBP|USD|JPY|CHF|CAD|AUD|NZD|SEK|NOK|SGD|HKD|CNH|MXN|ZAR|TRY|PLN)/.test(s.slice(0, 3)) && s.length === 6) return "forex";
  // Common index tickers
  if (/^(SPX|NAS|NDX|US30|GER|DAX|UK100|FTSE|JP225|NIKKEI|HK50)/.test(s)) return "indices";
  return undefined;
}

export const marketData = new MarketDataEngine();

export type { Candle, CandleQuery, Quote, SymbolMeta, Timeframe, MarketKind } from "./types";
