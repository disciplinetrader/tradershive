/**
 * Finnhub provider — LIVE quotes for US equities / ETFs.
 *
 * Scope is dictated by what our Finnhub subscription actually serves
 * (verified by direct probes, see `finnhub.functions.ts`):
 *   • `/quote` → US stocks and ETFs  ✅
 *   • forex, metals and CFD indices  ❌ HTTP 403 / "subscription required"
 *   • any `/candle` endpoint         ❌ HTTP 403
 *
 * So this provider advertises `markets: ["stocks"]` only, is live-quote
 * only, and never claims historical support. The engine falls back to
 * Twelve Data automatically whenever a request here fails.
 */
import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { finnhubQuote, finnhubStatus } from "../finnhub.functions";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

/** Engine-symbol → Finnhub symbol. For US equities they're identical. */
const CATALOG: Array<{ symbol: string; fh: string; displayName: string; market: MarketKind; tickSize: number; pricePrecision: number }> = [
  { symbol: "AAPL",  fh: "AAPL",  displayName: "Apple Inc.",        market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "MSFT",  fh: "MSFT",  displayName: "Microsoft Corp.",   market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "TSLA",  fh: "TSLA",  displayName: "Tesla Inc.",        market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "NVDA",  fh: "NVDA",  displayName: "NVIDIA Corp.",      market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "AMZN",  fh: "AMZN",  displayName: "Amazon.com Inc.",   market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "GOOGL", fh: "GOOGL", displayName: "Alphabet Inc.",     market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "META",  fh: "META",  displayName: "Meta Platforms",    market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "SPY",   fh: "SPY",   displayName: "S&P 500 ETF",       market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "QQQ",   fh: "QQQ",   displayName: "Nasdaq 100 ETF",    market: "stocks", tickSize: 0.01, pricePrecision: 2 },
  { symbol: "DIA",   fh: "DIA",   displayName: "Dow 30 ETF",        market: "stocks", tickSize: 0.01, pricePrecision: 2 },
];

/** Live-quote poll cadence through the authenticated server proxy. */
const POLL_MS = 5_000;

const BY_ENGINE = new Map(CATALOG.map((r) => [r.symbol, r]));

function toFinnhub(engineSym: string): string {
  return BY_ENGINE.get(engineSym)?.fh ?? engineSym.replace(/[/\s]/g, "").toUpperCase();
}

export class FinnhubProvider implements MarketDataProvider {
  readonly code = "finnhub";
  readonly descriptor = DESCRIPTORS_BY_CODE.get("finnhub")!;
  readonly name = "Finnhub";
  readonly capabilities: ProviderCapabilities = {
    markets: ["stocks"],
    supportsRest: true, supportsWs: false, supportsHistorical: false, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private handlers = new Set<StatusHandler>();
  private subs = new Map<string, Set<QuoteHandler>>(); // engineSym -> handlers
  private lastQuote = new Map<string, Quote>();
  /** Symbols this plan is not entitled to — never retried. */
  private notEntitled = new Set<string>();

  private booted = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private failures = 0;

  status() { return this._status; }
  onStatus(h: StatusHandler) { this.handlers.add(h); return () => this.handlers.delete(h); }
  private setStatus(s: ProviderStatus, meta?: Record<string, unknown>) {
    if (this._status === s) return;
    this._status = s;
    for (const h of this.handlers) { try { h(s, meta); } catch { /* noop */ } }
  }

  /** True when the plan can't serve this symbol — engine should fail over. */
  supportsSymbol(engineSym: string) { return !this.notEntitled.has(engineSym); }

  async connect() {
    if (this.booted) return;
    this.booted = true;
    this.setStatus("connecting");
    try {
      const probe = (await finnhubStatus()) as { configured: boolean };
      if (!probe?.configured) {
        this.setStatus("disabled", { reason: "finnhub_not_configured" });
        console.warn("[finnhub] provider disabled — set FINNHUB_API_KEY to enable.");
        return;
      }
      this.setStatus("connected");
      this.startPolling();
    } catch (e) {
      this.setStatus("error", { message: (e as Error).message });
      console.error("[finnhub] connect failed:", e);
    }
  }

  /**
   * Live quotes are polled through the authenticated server proxy. The
   * Finnhub key stays on the server — the browser never sees it.
   */
  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => { void this.pollOnce(); }, POLL_MS);
    void this.pollOnce();
  }

  private async pollOnce() {
    if (this.polling) return;
    const symbols = [...this.subs.keys()].filter((s) => !this.notEntitled.has(s));
    if (!symbols.length) return;
    this.polling = true;
    try {
      for (const engineSym of symbols) {
        try {
          const res = (await finnhubQuote({ data: { symbol: toFinnhub(engineSym) } })) as any;
          if (res?.error === "finnhub_not_entitled") {
            this.notEntitled.add(engineSym);
            console.warn(`[finnhub] ${engineSym} is not covered by the current plan — engine will fail over.`);
            continue;
          }
          if (!res || res.error || !Number.isFinite(res.last)) continue;
          this.emit({
            symbol: engineSym, providerCode: this.code,
            ts: res.ts ?? Date.now(),
            last: res.last, bid: res.bid, ask: res.ask, spread: res.spread,
          });
          this.failures = 0;
          if (this._status !== "connected") this.setStatus("connected");
        } catch (e) {
          this.failures += 1;
          if (this.failures >= 3 && this._status === "connected") {
            this.setStatus("error", { message: (e as Error).message });
          }
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private emit(quote: Quote) {
    this.lastQuote.set(quote.symbol, quote);
    for (const h of this.subs.get(quote.symbol) ?? []) { try { h(quote); } catch { /* noop */ } }
  }

  async disconnect() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.subs.clear();
    this.setStatus("disconnected");
  }

  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> {
    return CATALOG
      .filter((r) => !market || r.market === market)
      .map(({ fh: _fh, ...meta }) => ({ ...meta, baseAsset: null, quoteAsset: null }));
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
    if (this._status === "disabled") throw new Error("finnhub_not_configured");
    if (this.notEntitled.has(symbol)) throw new Error("finnhub_not_entitled");
    const cachedQuote = this.lastQuote.get(symbol);
    if (cachedQuote && Date.now() - cachedQuote.ts < POLL_MS) return cachedQuote;
    const res = (await finnhubQuote({ data: { symbol: toFinnhub(symbol) } })) as any;
    if (res?.error) {
      if (res.error === "finnhub_not_entitled") this.notEntitled.add(symbol);
      throw new Error(res.error);
    }
    const quote: Quote = {
      symbol, providerCode: this.code, ts: res.ts,
      bid: res.bid, ask: res.ask, last: res.last, spread: res.spread,
    };
    this.lastQuote.set(symbol, quote);
    return quote;
  }

  async getCandles(_q: CandleQuery): Promise<Candle[]> {
    // Historical candles are not available on this plan (HTTP 403) and are
    // owned by Twelve Data / Binance. Throw so the engine routes elsewhere.
    throw new Error("finnhub_no_historical");
  }
  getHistoricalData(q: CandleQuery) { return this.getCandles(q); }

  subscribe(symbol: string, handler: QuoteHandler): SubscriptionHandle {
    if (!this.booted) void this.connect();
    if (!this.subs.has(symbol)) {
      this.subs.set(symbol, new Set());
      this.startPolling();
      void this.pollOnce();
    }
    this.subs.get(symbol)!.add(handler);
    const cached = this.lastQuote.get(symbol);
    if (cached) { try { handler(cached); } catch { /* noop */ } }
    const sub: SubscriptionHandle = {
      id: `finnhub-${symbol}-${Math.random().toString(36).slice(2, 8)}`, symbol,
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
    if (set.size === 0) this.subs.delete(handle.symbol);
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    return { market, status: this._status === "connected" ? "open" : "closed" };
  }
  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
