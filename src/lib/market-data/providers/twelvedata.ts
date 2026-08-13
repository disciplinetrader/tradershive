/**
 * Twelve Data provider — REST-based feed for Forex, Metals and Indices
 * (and, in the future, Stocks). No user account required beyond a single
 * TWELVE_DATA_API_KEY server secret.
 *
 * Live quotes: polled through the server proxy at a modest cadence so the
 * free-tier request quota is respected. Historical candles use /time_series.
 */
import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { twelveDataCandles, twelveDataQuote, twelveDataStatus, twelveDataUsage } from "../twelvedata.functions";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

/** Poll cadence tiers, chosen so the busiest route (trading) is well within
 *  the free-tier 8 req/min ceiling. See product spec. */
const CADENCE: Record<string, number> = {
  workspace: 12_000,
  watchlist: 30_000,
  dashboard: 45_000,
  idle:      60_000,
  hidden:    0,
  throttled: 60_000,
};
const DEFAULT_POLL_MS = CADENCE.idle;

/** Credits/minute we allow the live poller to spend. The free plan ceiling is
 *  8; the rest is headroom for candle loads and one-off `getQuote` calls.
 *  Twelve Data bills one credit PER SYMBOL, so a 6-symbol watchlist polled
 *  every 12s is 30 credits/min — four times over the ceiling, which is why
 *  every poll came back 429 and forex quotes stopped arriving entirely. */
const CREDITS_PER_MIN = 6;

// Static catalog for the symbols we officially support out of the box.
// The engine symbol on the left is what the rest of the app uses; the
// Twelve Data symbol on the right is what we send over the wire.
type Row = { symbol: string; td: string; displayName: string; market: MarketKind; baseAsset: string; quoteAsset: string; tickSize: number; pricePrecision: number };
const CATALOG: Row[] = [
  { symbol: "EURUSD", td: "EUR/USD", displayName: "EUR / USD", market: "forex", baseAsset: "EUR", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "GBPUSD", td: "GBP/USD", displayName: "GBP / USD", market: "forex", baseAsset: "GBP", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "USDJPY", td: "USD/JPY", displayName: "USD / JPY", market: "forex", baseAsset: "USD", quoteAsset: "JPY", tickSize: 0.001,   pricePrecision: 3 },
  { symbol: "USDCHF", td: "USD/CHF", displayName: "USD / CHF", market: "forex", baseAsset: "USD", quoteAsset: "CHF", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "AUDUSD", td: "AUD/USD", displayName: "AUD / USD", market: "forex", baseAsset: "AUD", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "NZDUSD", td: "NZD/USD", displayName: "NZD / USD", market: "forex", baseAsset: "NZD", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "USDCAD", td: "USD/CAD", displayName: "USD / CAD", market: "forex", baseAsset: "USD", quoteAsset: "CAD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "EURJPY", td: "EUR/JPY", displayName: "EUR / JPY", market: "forex", baseAsset: "EUR", quoteAsset: "JPY", tickSize: 0.001,   pricePrecision: 3 },
  { symbol: "GBPJPY", td: "GBP/JPY", displayName: "GBP / JPY", market: "forex", baseAsset: "GBP", quoteAsset: "JPY", tickSize: 0.001,   pricePrecision: 3 },
  { symbol: "XAUUSD", td: "XAU/USD", displayName: "Gold / USD",   market: "metals",  baseAsset: "XAU", quoteAsset: "USD", tickSize: 0.01,  pricePrecision: 2 },
  { symbol: "XAGUSD", td: "XAG/USD", displayName: "Silver / USD", market: "metals",  baseAsset: "XAG", quoteAsset: "USD", tickSize: 0.001, pricePrecision: 3 },
  { symbol: "US30",   td: "DJI",     displayName: "Dow Jones 30", market: "indices", baseAsset: "DJI", quoteAsset: "USD", tickSize: 0.1,   pricePrecision: 1 },
  { symbol: "NAS100", td: "NDX",     displayName: "NASDAQ 100",   market: "indices", baseAsset: "NDX", quoteAsset: "USD", tickSize: 0.1,   pricePrecision: 1 },
  { symbol: "SPX500", td: "SPX",     displayName: "S&P 500",      market: "indices", baseAsset: "SPX", quoteAsset: "USD", tickSize: 0.1,   pricePrecision: 1 },
];

const BY_ENGINE = new Map(CATALOG.map((r) => [r.symbol, r]));
function toTd(engineSym: string): string {
  const hit = BY_ENGINE.get(engineSym);
  if (hit) return hit.td;
  // Best-effort fallback for FX / metals pairs not in the catalog.
  const s = engineSym.replace(/\//g, "").toUpperCase();
  if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return engineSym;
}

export class TwelveDataProvider implements MarketDataProvider {
  readonly code = "twelvedata";
  readonly descriptor = DESCRIPTORS_BY_CODE.get("twelvedata")!;
  readonly name = "Twelve Data";
  readonly capabilities: ProviderCapabilities = {
    markets: ["forex", "metals", "indices", "commodities", "stocks"],
    supportsRest: true, supportsWs: false, supportsHistorical: true, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private handlers = new Set<StatusHandler>();
  private subs = new Map<string, Set<QuoteHandler>>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private booted = false;
  private cadenceRequests = new Map<string, number>(); // consumer key → desired ms
  private currentPollMs = DEFAULT_POLL_MS;
  private failureCount = 0;
  private nextAllowedPoll = 0;
  private lastQuotaWarn = 0;
  private visibilityBound = false;
  private lastUsage: any = null;
  private lastUsageAt = 0;
  private rotation = 0;

  status() { return this._status; }
  onStatus(h: StatusHandler) { this.handlers.add(h); return () => this.handlers.delete(h); }
  private setStatus(s: ProviderStatus, meta?: Record<string, unknown>) {
    if (this._status === s) return;
    this._status = s;
    for (const h of this.handlers) { try { h(s, meta); } catch { /* noop */ } }
  }

  /** External consumers register the cadence they need. Provider polls at the
   *  MIN of all requested cadences (fastest wins), tempered by throttle/hidden.
   *  Returns an unregister function. */
  requestCadence(key: string, ms: number): () => void {
    this.cadenceRequests.set(key, ms);
    this.retunePoller();
    return () => { this.cadenceRequests.delete(key); this.retunePoller(); };
  }

  private computeCadence(): number {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return CADENCE.hidden;
    const requested = [...this.cadenceRequests.values()];
    let base = requested.length ? Math.min(...requested) : CADENCE.idle;
    if (this.lastUsage?.softThrottle) base = Math.max(base, CADENCE.throttled);
    if (this.lastUsage?.exhausted || this.lastUsage?.cooldown) return 0;
    // Every poll spends one credit per subscribed symbol. Stretch the interval
    // so the poller lives inside the credit budget rather than discovering the
    // ceiling as a wall of 429s.
    const symbols = Math.max(1, this.subs.size);
    base = Math.max(base, Math.ceil((symbols / CREDITS_PER_MIN) * 60_000));
    return Math.max(3_000, base);
  }

  private retunePoller() {
    const ms = this.computeCadence();
    if (ms === this.currentPollMs && this.pollTimer) return;
    this.currentPollMs = ms;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (ms > 0 && this._status === "connected") this.schedulePoll(ms);
  }

  private schedulePoll(delayMs: number) {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => { void this.pollOnce(); }, delayMs);
  }

  private bindVisibility() {
    if (this.visibilityBound || typeof document === "undefined") return;
    this.visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      this.retunePoller();
      if (document.visibilityState === "visible") void this.pollOnce();
    });
  }

  async connect() {
    if (this.booted) return;
    this.booted = true;
    this.setStatus("connecting");
    try {
      const probe = (await twelveDataStatus()) as { configured: boolean; plan?: string };
      if (!probe?.configured) {
        this.setStatus("disabled", { reason: "twelvedata_not_configured" });
        console.warn("[twelvedata] provider disabled — set TWELVE_DATA_API_KEY to enable.");
        return;
      }
      this.setStatus("connected", { plan: probe.plan });
      console.info(`[twelvedata] connected — plan=${probe.plan ?? "unknown"}`);
      this.bindVisibility();
      this.ensurePoller();
    } catch (e) {
      this.setStatus("error", { message: (e as Error).message });
      console.error("[twelvedata] connect failed:", e);
    }
  }

  async disconnect() {
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    this.subs.clear();
    this.setStatus("disconnected");
  }

  private ensurePoller() {
    if (this.pollTimer) return;
    if (this.subs.size === 0 && this.cadenceRequests.size === 0) return; // idle
    this.schedulePoll(this.computeCadence() || CADENCE.idle);
  }

  /** Public snapshot used by the QA diagnostics panel. */
  getUsageSnapshot() { return { usage: this.lastUsage, currentPollMs: this.currentPollMs, subs: this.subs.size, failures: this.failureCount }; }

  private async refreshUsage() {
    // Cheap server call, throttle to once every 15s.
    if (Date.now() - this.lastUsageAt < 15_000) return;

    this.lastUsageAt = Date.now();
    try {
      const u = await twelveDataUsage();
      this.lastUsage = u;
      
      // If we were error-throttled or exhausted, and now we aren't, wake up.
      if (this.currentPollMs === 0 && !(u as any)?.exhausted && !(u as any)?.cooldown) {
        this.retunePoller();
      }

      if ((u as any)?.softThrottle && Date.now() - this.lastQuotaWarn > 60_000) {
        this.lastQuotaWarn = Date.now();
        console.warn(`[twelvedata] approaching daily quota (${(u as any).daily}/${(u as any).dailyLimit}) — reducing cadence.`);
      }
    } catch { /* noop */ }

  }

  private async pollOnce() {
    this.pollTimer = null;
    if (this._status !== "connected") return;
    if (this.currentPollMs === 0) return; // paused (tab hidden / quota exhausted)
    if (Date.now() < this.nextAllowedPoll) { this.schedulePoll(this.nextAllowedPoll - Date.now()); return; }

    // No visible consumers → don't poll AND don't burn a usage probe.
    if (this.subs.size === 0) {
      // If we have a probe scheduled, clear it.
      if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
      return;
    }

    void this.refreshUsage();


    // Rotate the symbol order each poll. The server trims a batch to the
    // credits it can afford, so a fixed order would let the same tail symbols
    // starve indefinitely while the head stays fresh.
    const all = [...this.subs.keys()];
    this.rotation = all.length ? this.rotation % all.length : 0;
    const engineSyms = [...all.slice(this.rotation), ...all.slice(0, this.rotation)];
    this.rotation = (this.rotation + 1) % Math.max(1, all.length);
    const tdSyms = engineSyms.map(toTd);
    try {
      const res = (await twelveDataQuote({ data: { symbols: tdSyms } })) as any;
      if (res?.error) {
        this.failureCount += 1;
        // Exponential backoff up to 5min. Hard-stop if quota is exhausted.
        if (/quota_exhausted/.test(res.error)) {
          this.nextAllowedPoll = Date.now() + 15 * 60_000;
          console.warn("[twelvedata] daily quota exhausted — pausing polling until refresh.");
        } else {
          const backoff = Math.min(300_000, 5_000 * 2 ** Math.min(this.failureCount, 6));
          this.nextAllowedPoll = Date.now() + backoff;
        }
      } else {
        this.failureCount = 0;
        const byTd = new Map<string, any>();
        for (const q of res.quotes ?? []) byTd.set(q.symbol, q);
        for (const engineSym of engineSyms) {
          const q = byTd.get(toTd(engineSym));
          if (!q) continue;
          const quote: Quote = {
            symbol: engineSym, providerCode: this.code, ts: q.ts,
            bid: q.bid, ask: q.ask, last: q.last, spread: q.spread,
            quoteAt: q.quoteAt ?? null,
          };
          for (const h of this.subs.get(engineSym) ?? []) { try { h(quote); } catch { /* noop */ } }
        }
      }
    } catch (e) {
      this.failureCount += 1;
      const backoff = Math.min(300_000, 5_000 * 2 ** Math.min(this.failureCount, 6));
      this.nextAllowedPoll = Date.now() + backoff;
      console.warn("[twelvedata] poll failed:", (e as Error).message);
    } finally {
      const next = this.computeCadence();
      if (next > 0) this.schedulePoll(Math.max(next, this.nextAllowedPoll - Date.now()));
    }
  }


  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> {
    return CATALOG
      .filter((r) => !market || r.market === market)
      .map(({ td: _td, ...meta }) => meta);
  }
  async searchSymbols({ q, market, limit = 30 }: SearchQuery): Promise<SymbolMeta[]> {
    const all = await this.getSymbols(market);
    const needle = q.trim().toLowerCase();
    return all
      .filter((s) => !needle || s.symbol.toLowerCase().includes(needle) || s.displayName.toLowerCase().includes(needle))
      .slice(0, limit);
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (!this.booted) await this.connect();
    if (this._status === "disabled") throw new Error("Forex provider not configured.");
    const res = (await twelveDataQuote({ data: { symbols: [toTd(symbol)] } })) as any;
    if (res?.error) throw new Error(res.error);
    const q = res.quotes?.[0]; if (!q) throw new Error(`twelvedata_no_quote:${symbol}`);
    return { symbol, providerCode: this.code, ts: q.ts, bid: q.bid, ask: q.ask, last: q.last, spread: q.spread, quoteAt: q.quoteAt ?? null };
  }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    if (!this.booted) await this.connect();
    if (this._status === "disabled") throw new Error("Forex provider not configured.");
    const res = (await twelveDataCandles({
      data: { symbol: toTd(q.symbol), timeframe: q.timeframe, from: q.from, to: q.to, count: q.limit },
    })) as any;
    const candles = res.candles ?? [];
    if (res?.error && !candles.length) throw new Error(res.error);
    return candles;
  }
  getHistoricalData(q: CandleQuery) { return this.getCandles(q); }

  subscribe(symbol: string, handler: QuoteHandler): SubscriptionHandle {
    if (!this.booted) void this.connect();
    if (!this.subs.has(symbol)) this.subs.set(symbol, new Set());
    this.subs.get(symbol)!.add(handler);
    this.ensurePoller();
    // Cadence is a function of how many symbols we poll, so it has to be
    // recomputed whenever that set changes.
    this.retunePoller();
    const sub: SubscriptionHandle = {
      id: `twelvedata-${symbol}-${Math.random().toString(36).slice(2, 8)}`, symbol,
      unsubscribe: () => this.unsubscribe(sub),
    };
    (sub as unknown as { _handler: QuoteHandler })._handler = handler;
    return sub;
  }
  unsubscribe(handle: SubscriptionHandle) {
    const h = (handle as unknown as { _handler?: QuoteHandler })._handler;
    const set = this.subs.get(handle.symbol);
    if (!set || !h) return;
    set.delete(h);
    if (set.size === 0) { this.subs.delete(handle.symbol); this.retunePoller(); }
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    return { market, status: this._status === "connected" ? "open" : "closed" };
  }
  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
