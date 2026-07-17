/**
 * MarketDataEngine — the ONLY interface every module uses to reach a provider.
 *
 * Responsibilities:
 *  - Provider selection (per market / preferred / fallback)
 *  - Quote + candle caching
 *  - Subscription multiplexing (multiple consumers per symbol share one upstream)
 *  - Health tracking for the admin panel
 */

import { CANDLE_CACHE_MS, DEFAULT_PROVIDER, QUOTE_CACHE_MS } from "./constants";
import { TTLCache } from "./cache";
import { bootstrapProviders, getProvider, listProviders } from "./providers/registry";
import { getActiveSessions, getNextSession } from "./sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderStatus, Quote, QuoteHandler, SearchQuery, SessionWindow,
  SubscriptionHandle, SymbolMeta, Timeframe,
} from "./types";

export type EngineSelectionStrategy = {
  preferredProvider?: string;
  perMarket?: Partial<Record<MarketKind, string>>;
};

class MarketDataEngine {
  private quoteCache = new TTLCache<Quote>(QUOTE_CACHE_MS);
  private candleCache = new TTLCache<Candle[]>(CANDLE_CACHE_MS);
  private fanout = new Map<string, { upstream: SubscriptionHandle; handlers: Set<QuoteHandler> }>();
  private selection: EngineSelectionStrategy = { preferredProvider: DEFAULT_PROVIDER };
  private initialized = false;

  init(strategy?: EngineSelectionStrategy) {
    bootstrapProviders();
    if (strategy) this.selection = { ...this.selection, ...strategy };
    // Auto-connect the default provider so charts render immediately.
    if (!this.initialized) {
      this.initialized = true;
      const def = this.pickProvider(); if (def) void def.connect();
    }
  }

  setStrategy(strategy: EngineSelectionStrategy) {
    this.selection = { ...this.selection, ...strategy };
  }

  listProviders(): MarketDataProvider[] { return listProviders(); }

  pickProvider(market?: MarketKind): MarketDataProvider | undefined {
    // Priority: per-market override → preferred → any capable → mock
    const perMarket = market ? this.selection.perMarket?.[market] : undefined;
    const candidates: (string | undefined)[] = [perMarket, this.selection.preferredProvider];
    for (const code of candidates) {
      if (!code) continue;
      const p = getProvider(code);
      if (p && p.status() !== "disabled" && (!market || p.capabilities.markets.includes(market))) return p;
    }
    if (market) {
      const capable = listProviders().find((p) => p.capabilities.markets.includes(market) && p.status() !== "disabled");
      if (capable) return capable;
    }
    return getProvider(DEFAULT_PROVIDER);
  }

  async searchSymbols(q: SearchQuery): Promise<SymbolMeta[]> {
    const p = this.pickProvider(q.market) ?? getProvider(DEFAULT_PROVIDER)!;
    return p.searchSymbols(q);
  }
  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> {
    const p = this.pickProvider(market) ?? getProvider(DEFAULT_PROVIDER)!;
    return p.getSymbols(market);
  }

  async getQuote(symbol: string, market?: MarketKind): Promise<Quote> {
    const cached = this.quoteCache.get(symbol);
    if (cached) return cached;
    const p = this.pickProvider(market) ?? getProvider(DEFAULT_PROVIDER)!;
    try {
      const q = await p.getQuote(symbol);
      this.quoteCache.set(symbol, q);
      return q;
    } catch {
      const fallback = getProvider(DEFAULT_PROVIDER)!;
      const q = await fallback.getQuote(symbol);
      this.quoteCache.set(symbol, q);
      return q;
    }
  }

  async getCandles(q: CandleQuery, market?: MarketKind): Promise<Candle[]> {
    const key = `${q.symbol}|${q.timeframe}|${q.from}|${q.to}|${q.limit ?? "*"}`;
    const cached = this.candleCache.get(key);
    if (cached) return cached;
    const p = this.pickProvider(market) ?? getProvider(DEFAULT_PROVIDER)!;
    try {
      const out = await p.getCandles(q);
      if (out.length) { this.candleCache.set(key, out); return out; }
    } catch { /* fallthrough */ }
    const fb = getProvider(DEFAULT_PROVIDER)!;
    const out = await fb.getCandles(q);
    this.candleCache.set(key, out);
    return out;
  }
  getHistoricalData(q: CandleQuery, market?: MarketKind) { return this.getCandles(q, market); }

  subscribe(symbol: string, handler: QuoteHandler, market?: MarketKind): SubscriptionHandle {
    let entry = this.fanout.get(symbol);
    if (!entry) {
      const p = this.pickProvider(market) ?? getProvider(DEFAULT_PROVIDER)!;
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
    // Warm the new subscriber with the cached quote if available.
    const c = this.quoteCache.get(symbol); if (c) try { handler(c); } catch { /* noop */ }
    const id = `fan-${symbol}-${Math.random().toString(36).slice(2, 8)}`;
    const sub: SubscriptionHandle = {
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
    return sub;
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    const p = this.pickProvider(market) ?? getProvider(DEFAULT_PROVIDER)!;
    try { return await p.getMarketStatus(market); }
    catch { return { market, status: "closed" }; }
  }

  async getSessions(): Promise<SessionWindow[]> {
    const p = getProvider(DEFAULT_PROVIDER)!;
    return p.getSessions();
  }

  activeSessions() { return getActiveSessions(); }
  nextSession() { return getNextSession(); }

  cacheStats() { return { quotes: this.quoteCache.size(), candles: this.candleCache.size(), subscriptions: this.fanout.size }; }
  clearCache() { this.quoteCache.clear(); this.candleCache.clear(); }

  health(): { code: string; name: string; status: ProviderStatus }[] {
    return listProviders().map((p) => ({ code: p.code, name: p.name, status: p.status() }));
  }
}

export const marketData = new MarketDataEngine();

// Convenience for consumers that only need a symbol → quote hook shape.
export type { Candle, CandleQuery, Quote, SymbolMeta, Timeframe, MarketKind };
