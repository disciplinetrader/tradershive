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
import { breakers, type BreakerSnapshot, type BreakerState } from "./circuit-breaker";
import { bootstrapProviders, getProvider, listProviders } from "./providers/registry";
import { getActiveSessions, getNextSession } from "./sessions";
import { MarketProviderUnavailableError } from "./errors";
import { listMarketAssignments } from "./admin.functions";

/** How old a cached value may be before we refuse to serve it at all. */
const STALE_QUOTE_MAX_MS = 5 * 60_000;
const STALE_CANDLE_MAX_MS = 30 * 60_000;

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

/**
 * LIVE-quote provider preferences (historical routing is NOT affected).
 *
 * Finnhub's plan entitles US equities and ETFs via `/quote` at 60 req/min;
 * forex, metals and licensed index values return 403, so those stay on Twelve
 * Data for live too. `indices` is here because we serve indices as US-listed
 * ETFs (SPY/QQQ/DIA/IWM), which Finnhub covers — routing them here keeps the
 * chart's candle budget on Twelve Data from being spent on quotes, which is
 * what was blanking stock and index charts.
 */
const LIVE_PROVIDER_OVERRIDES: Partial<Record<MarketKind, string>> = {
  stocks: "finnhub",
  indices: "finnhub",
};


class MarketDataEngine {
  private quoteCache = new TTLCache<Quote>(QUOTE_CACHE_MS);
  private candleCache = new TTLCache<Candle[]>(CANDLE_CACHE_MS);
  private fanout = new Map<string, {
    upstream: SubscriptionHandle; handlers: Set<QuoteHandler>;
    watchdog?: ReturnType<typeof setTimeout>; recovery?: ReturnType<typeof setTimeout>;
  }>();

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
    return this.resolveChain(market, symbol, /*live*/ false)[0];
  }

  /** Live quote / subscribe routing. Non-crypto markets that Finnhub can
   *  actually serve on our plan (US equities) go to Finnhub first, with the
   *  DB-assigned provider (Twelve Data) kept as automatic fallback.
   *  Historical routing is untouched — see pickProvider(). */
  pickLiveQuoteProvider(market?: MarketKind, symbol?: string): MarketDataProvider {
    return this.resolveChain(market, symbol, /*live*/ true)[0];
  }

  /**
   * Ordered list of providers to try for a market: primary first, then the
   * configured fallback. Providers whose circuit breaker is open are pushed
   * to the back rather than dropped, so a fully-tripped market still gets
   * one real attempt instead of a silent substitution.
   */
  private resolveChain(market: MarketKind | undefined, symbol: string | undefined, live: boolean): MarketDataProvider[] {
    const effective = market ?? inferMarketFromSymbol(symbol);
    if (!effective) {
      const any = listProviders().filter((p) => p.status() !== "disabled");
      if (any.length) return any;
      throw new MarketProviderUnavailableError({ reason: "not_assigned" });
    }
    let a = this.assignments.get(effective);
    if (!a) throw new MarketProviderUnavailableError({ market: effective, reason: "not_assigned" });

    // LIVE-only override: US equities prefer Finnhub, keeping the
    // historical/DB-assigned provider (Twelve Data) as automatic fallback.
    // Forex/metals/indices/commodities stay on Twelve Data for live quotes.
    if (live) {
      const preferred = LIVE_PROVIDER_OVERRIDES[effective];
      if (preferred && preferred !== a.primary) {
        const p = getProvider(preferred);
        // Only take the override when the provider is registered, enabled,
        // covers the market and (if it declares symbol entitlements) the
        // symbol itself. Otherwise silently keep the assigned provider.
        const entitled = !symbol
          || typeof (p as any)?.supportsSymbol !== "function"
          || (p as any).supportsSymbol(symbol);
        if (p && p.status() !== "disabled" && p.capabilities.markets.includes(effective) && entitled) {
          a = { primary: preferred, fallback: a.primary };
        }
      }
    }


    const usable = (code: string | null): MarketDataProvider | undefined => {
      if (!code) return undefined;
      const p = getProvider(code);
      if (!p || p.status() === "disabled") return undefined;
      if (!p.capabilities.markets.includes(effective)) return undefined;
      return p;
    };

    const ordered: MarketDataProvider[] = [];
    for (const code of [a.primary, a.fallback]) {
      const p = usable(code);
      if (p && !ordered.includes(p)) ordered.push(p);
    }
    if (!ordered.length) {
      throw new MarketProviderUnavailableError({
        market: effective,
        reason: getProvider(a.primary) ? "not_configured" : "not_assigned",
        providerCode: a.primary,
      });
    }
    // Healthy providers first; tripped ones remain as a last resort.
    const healthy = ordered.filter((p) => breakers.canRequest(p.code));
    const tripped = ordered.filter((p) => !breakers.canRequest(p.code));
    return [...healthy, ...tripped];
  }

  /** Run `fn` down the provider chain, recording breaker outcomes. */
  private async withChain<T>(
    chain: MarketDataProvider[],
    fn: (p: MarketDataProvider) => Promise<T>,
    label: string,
  ): Promise<{ value: T; provider: string; degraded: boolean }> {
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      const p = chain[i];
      try {
        const value = await fn(p);
        breakers.recordSuccess(p.code);
        return { value, provider: p.code, degraded: i > 0 };
      } catch (e) {
        lastError = e;
        breakers.recordFailure(p.code, e);
        if (i < chain.length - 1) {
          console.warn(`[market-data] ${label}: "${p.code}" failed (${(e as Error).message}) — trying "${chain[i + 1].code}".`);
        }
      }
    }
    throw lastError ?? new Error(`${label}: all providers failed`);
  }

  async searchSymbols(q: SearchQuery): Promise<SymbolMeta[]> { return this.pickProvider(q.market).searchSymbols(q); }
  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> { return this.pickProvider(market).getSymbols(market); }

  /** Last known quote age when the live feed is degraded, per symbol. */
  private staleQuotes = new Map<string, number>();

  async getQuote(symbol: string, market?: MarketKind): Promise<Quote> {
    const cached = this.quoteCache.get(symbol);
    if (cached) { this.staleQuotes.delete(symbol); return cached; }
    const chain = this.resolveChain(market, symbol, /*live*/ true);
    try {
      const { value } = await this.withChain(chain, (p) => p.getQuote(symbol), `quote ${symbol}`);
      this.quoteCache.set(symbol, value);
      this.staleQuotes.delete(symbol);
      return value;
    } catch (e) {
      // Degraded path: serve the last real quote, clearly marked stale.
      const stale = this.quoteCache.getStale(symbol, STALE_QUOTE_MAX_MS);
      if (stale) {
        this.staleQuotes.set(symbol, stale.ageMs);
        return { ...stale.value, stale: true, ageMs: stale.ageMs } as Quote;
      }
      throw e;
    }
  }

  /** Age (ms) of the last served quote when it came from the stale path. */
  quoteStaleness(symbol: string): number | null { return this.staleQuotes.get(symbol) ?? null; }

  async getCandles(q: CandleQuery, market?: MarketKind): Promise<Candle[]> {
    const key = `${q.symbol}|${q.timeframe}|${q.from}|${q.to}|${q.limit ?? "*"}`;
    const cached = this.candleCache.get(key);
    if (cached) return cached;
    const chain = this.resolveChain(market, q.symbol, /*live*/ false);
    try {
      const { value } = await this.withChain(chain, (p) => p.getCandles(q), `candles ${q.symbol}`);
      if (value.length) this.candleCache.set(key, value);
      return value;
    } catch (e) {
      const stale = this.candleCache.getStale(key, STALE_CANDLE_MAX_MS);
      if (stale) {
        console.warn(`[market-data] serving stale candles for ${q.symbol} (${Math.round(stale.ageMs / 1000)}s old).`);
        return stale.value;
      }
      throw e;
    }
  }
  getHistoricalData(q: CandleQuery, market?: MarketKind) { return this.getCandles(q, market); }


  private warnedMarkets = new Set<string>();

  /** No tick within this window ⇒ fail over to the next live provider. */
  private static readonly LIVE_WATCHDOG_MS = 20_000;
  /** How often a degraded symbol retries its preferred live provider. */
  private static readonly LIVE_RECOVERY_MS = 5 * 60_000;

  subscribe(symbol: string, handler: QuoteHandler, market?: MarketKind): SubscriptionHandle {
    let entry = this.fanout.get(symbol);
    if (!entry) {
      let chain: MarketDataProvider[];
      try { chain = this.resolveChain(market, symbol, /*live*/ true); }
      catch (e) {
        const key = market ?? inferMarketFromSymbol(symbol) ?? "unknown";
        if (!this.warnedMarkets.has(key)) {
          this.warnedMarkets.add(key);
          console.warn(`[market-data] ${key} provider unavailable — assign one in Admin → Market Data. (${(e as Error).message})`);
        }
        return { id: `noop-${symbol}`, symbol, unsubscribe: () => {} };
      }

      const state: {
        upstream: SubscriptionHandle; handlers: Set<QuoteHandler>;
        watchdog?: ReturnType<typeof setTimeout>; recovery?: ReturnType<typeof setTimeout>;
      } = { upstream: { id: "pending", symbol, unsubscribe: () => {} }, handlers: new Set() };

      const attach = (index: number) => {
        const p = chain[Math.min(index, chain.length - 1)];
        void p.connect();
        let gotTick = false;
        state.upstream = p.subscribe(symbol, (q) => {
          gotTick = true;
          breakers.recordSuccess(p.code);
          this.quoteCache.set(symbol, q);
          const cur = this.fanout.get(symbol);
          if (!cur) return;
          for (const h of cur.handlers) { try { h(q); } catch { /* noop */ } }
        });

        // Fail over when the chosen provider produces nothing in time.
        if (index < chain.length - 1) {
          state.watchdog = setTimeout(() => {
            if (gotTick || !this.fanout.get(symbol)) return;
            const next = chain[index + 1];
            console.warn(`[market-data] live "${p.code}" produced no ticks for ${symbol} — failing over to "${next.code}".`);
            breakers.recordFailure(p.code, new Error("live_no_ticks"));
            try { state.upstream.unsubscribe(); } catch { /* noop */ }
            attach(index + 1);
          }, MarketDataEngine.LIVE_WATCHDOG_MS);
        }

        // Degraded ⇒ periodically try the preferred provider again.
        if (index > 0) {
          state.recovery = setTimeout(() => {
            if (!this.fanout.get(symbol)) return;
            console.info(`[market-data] retrying preferred live provider "${chain[0].code}" for ${symbol}.`);
            try { state.upstream.unsubscribe(); } catch { /* noop */ }
            clearTimeout(state.watchdog);
            attach(0);
          }, MarketDataEngine.LIVE_RECOVERY_MS);
        }
      };

      attach(0);
      entry = state;
      this.fanout.set(symbol, entry);
    }
    entry.handlers.add(handler);
    const c = this.quoteCache.get(symbol);
    if (c) {
      try { handler(c); } catch { /* noop */ }
    } else {
      // Warm start. Providers deliver on their own poll cadence, and Twelve
      // Data's is stretched to fit the credit budget — measured at ~30s for the
      // first metals/forex tick. Until it lands there is no quote at all, which
      // used to be papered over by the catalog seed: the header and BUY/SELL
      // showed gold at 2432 while the market was 4355. With the seed gone the
      // honest state is a dash and a disabled button, so the fix is to make the
      // first quote arrive quickly rather than to invent one.
      //
      // One un-batched request per newly-subscribed symbol. The server proxy
      // caches quotes for 12s, so a second consumer of the same symbol costs
      // nothing, and `getQuote` populates `quoteCache` for everyone.
      void this.getQuote(symbol, market)
        .then((q) => {
          const cur = this.fanout.get(symbol);
          if (!cur) return;
          for (const h of cur.handlers) { try { h(q); } catch { /* noop */ } }
        })
        .catch(() => { /* the poller is still coming; consumers show "no price" */ });
    }
    const id = `fan-${symbol}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id, symbol,
      unsubscribe: () => {
        const cur = this.fanout.get(symbol);
        if (!cur) return;
        cur.handlers.delete(handler);
        if (cur.handlers.size === 0) {
          cur.upstream.unsubscribe();
          if (cur.watchdog) clearTimeout(cur.watchdog);
          if (cur.recovery) clearTimeout(cur.recovery);
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

  health(): { code: string; name: string; status: ProviderStatus; breaker: BreakerState; lastError: string | null }[] {
    return listProviders().map((p) => {
      const b = breakers.snapshot(p.code);
      return { code: p.code, name: p.name, status: p.status(), breaker: b.state, lastError: b.lastError };
    });
  }

  /** Circuit-breaker snapshots for the admin market-data health view. */
  breakerStates(): BreakerSnapshot[] { return breakers.all(); }
  resetBreaker(code?: string) { breakers.reset(code); }


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
  // Index ETFs — how this app serves indices. Matched exactly, not by prefix,
  // so a real equity like SPYD or DIAL is not swept in.
  if (/^(SPY|QQQ|DIA|IWM)$/.test(s)) return "indices";
  // Licensed index tickers. Nothing serves these today, but inference should
  // still name the market correctly so the caller gets an honest
  // "provider unavailable for indices" rather than a random provider.
  if (/^(SPX|NAS|NDX|US30|GER|DAX|UK100|FTSE|JP225|NIKKEI|HK50)/.test(s)) return "indices";
  return undefined;
}

export const marketData = new MarketDataEngine();

export type { Candle, CandleQuery, Quote, SymbolMeta, Timeframe, MarketKind } from "./types";
