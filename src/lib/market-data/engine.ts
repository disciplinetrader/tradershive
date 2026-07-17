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
  forex:       { primary: "twelvedata", fallback: null },
  metals:      { primary: "twelvedata", fallback: null },
  indices:     { primary: "twelvedata", fallback: null },
  commodities: { primary: "twelvedata", fallback: null },
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
    const effective = market ?? inferMarketFromSymbol(symbol);
    if (!effective) {
      // Best-effort: any non-disabled provider (connecting/connected/disconnected all OK).
      const any = listProviders().find((p) => p.status() !== "disabled");
      if (any) return any;
      throw new MarketProviderUnavailableError({ reason: "not_assigned" });
    }
    const a = this.assignments.get(effective);
    if (!a) throw new MarketProviderUnavailableError({ market: effective, reason: "not_assigned" });

    // A provider that is "connecting" or "error" is still routable — it will
    // deliver data as soon as its socket comes up. Only "disabled" is fatal.
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
    const q = await this.pickProvider(market, symbol).getQuote(symbol);
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

  subscribe(symbol: string, handler: QuoteHandler, market?: MarketKind): SubscriptionHandle {
    let entry = this.fanout.get(symbol);
    if (!entry) {
      let p: MarketDataProvider;
      try { p = this.pickProvider(market, symbol); }
      catch (e) {
        console.error(`[market-data] subscribe(${symbol}): ${(e as Error).message}`);
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

export const marketData = new MarketDataEngine();

export type { Candle, CandleQuery, Quote, SymbolMeta, Timeframe, MarketKind } from "./types";
