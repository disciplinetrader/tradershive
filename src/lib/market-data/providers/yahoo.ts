/**
 * Yahoo Finance provider — key-less, near-live quotes and historical candles
 * for Forex, Metals and Indices. Uses the server proxy in
 * `../yahoo.functions.ts` to bypass CORS and set a User-Agent.
 *
 * Quotes are polled ~every 10s (Yahoo data is delayed 10-30s anyway; we
 * don't gain anything from faster polling and it wastes network).
 */
import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { yahooCandles, yahooQuote, yahooStatus } from "../yahoo.functions";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

const POLL_MS = 10_000;

type Row = { symbol: string; y: string; displayName: string; market: MarketKind; baseAsset: string; quoteAsset: string; tickSize: number; pricePrecision: number };
const CATALOG: Row[] = [
  // Forex majors
  { symbol: "EURUSD", y: "EURUSD=X", displayName: "EUR / USD", market: "forex", baseAsset: "EUR", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "GBPUSD", y: "GBPUSD=X", displayName: "GBP / USD", market: "forex", baseAsset: "GBP", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "USDJPY", y: "USDJPY=X", displayName: "USD / JPY", market: "forex", baseAsset: "USD", quoteAsset: "JPY", tickSize: 0.001,   pricePrecision: 3 },
  { symbol: "USDCHF", y: "USDCHF=X", displayName: "USD / CHF", market: "forex", baseAsset: "USD", quoteAsset: "CHF", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "AUDUSD", y: "AUDUSD=X", displayName: "AUD / USD", market: "forex", baseAsset: "AUD", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "NZDUSD", y: "NZDUSD=X", displayName: "NZD / USD", market: "forex", baseAsset: "NZD", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "USDCAD", y: "USDCAD=X", displayName: "USD / CAD", market: "forex", baseAsset: "USD", quoteAsset: "CAD", tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "EURJPY", y: "EURJPY=X", displayName: "EUR / JPY", market: "forex", baseAsset: "EUR", quoteAsset: "JPY", tickSize: 0.001,   pricePrecision: 3 },
  { symbol: "GBPJPY", y: "GBPJPY=X", displayName: "GBP / JPY", market: "forex", baseAsset: "GBP", quoteAsset: "JPY", tickSize: 0.001,   pricePrecision: 3 },
  // Metals
  { symbol: "XAUUSD", y: "GC=F",     displayName: "Gold (Futures)",   market: "metals",  baseAsset: "XAU", quoteAsset: "USD", tickSize: 0.1,  pricePrecision: 2 },
  { symbol: "XAGUSD", y: "SI=F",     displayName: "Silver (Futures)", market: "metals",  baseAsset: "XAG", quoteAsset: "USD", tickSize: 0.005, pricePrecision: 3 },
  // Indices
  { symbol: "US30",   y: "^DJI",     displayName: "Dow Jones 30", market: "indices", baseAsset: "DJI", quoteAsset: "USD", tickSize: 0.1, pricePrecision: 1 },
  { symbol: "NAS100", y: "^NDX",     displayName: "NASDAQ 100",   market: "indices", baseAsset: "NDX", quoteAsset: "USD", tickSize: 0.1, pricePrecision: 1 },
  { symbol: "SPX500", y: "^GSPC",    displayName: "S&P 500",      market: "indices", baseAsset: "SPX", quoteAsset: "USD", tickSize: 0.1, pricePrecision: 1 },
  // Commodities
  { symbol: "WTI",    y: "CL=F",     displayName: "Crude Oil WTI", market: "commodities", baseAsset: "WTI", quoteAsset: "USD", tickSize: 0.01, pricePrecision: 2 },
];

const BY_ENGINE = new Map(CATALOG.map((r) => [r.symbol, r]));
function toYahoo(engineSym: string): string {
  const hit = BY_ENGINE.get(engineSym);
  if (hit) return hit.y;
  // Best-effort fallback for FX pairs not in the catalog.
  const s = engineSym.replace(/[\/=X]/g, "").toUpperCase();
  if (s.length === 6) return `${s}=X`;
  return engineSym;
}

export class YahooProvider implements MarketDataProvider {
  readonly code = "yahoo";
  readonly descriptor = DESCRIPTORS_BY_CODE.get("yahoo")!;
  readonly name = "Yahoo Finance";
  readonly capabilities: ProviderCapabilities = {
    markets: ["forex", "metals", "indices", "commodities", "stocks"],
    supportsRest: true, supportsWs: false, supportsHistorical: true, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private handlers = new Set<StatusHandler>();
  private subs = new Map<string, Set<QuoteHandler>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private booted = false;

  status() { return this._status; }
  onStatus(h: StatusHandler) { this.handlers.add(h); return () => this.handlers.delete(h); }
  private setStatus(s: ProviderStatus, meta?: Record<string, unknown>) {
    if (this._status === s) return;
    this._status = s;
    for (const h of this.handlers) { try { h(s, meta); } catch { /* noop */ } }
  }

  async connect() {
    if (this.booted) return;
    this.booted = true;
    this.setStatus("connecting");
    try {
      const probe = (await yahooStatus()) as { configured: boolean; warning?: string };
      if (probe?.warning) console.warn("[yahoo] probe warning:", probe.warning);
      this.setStatus("connected");
      console.info("[yahoo] connected — key-less near-live feed");
      this.ensurePoller();
    } catch (e) {
      this.setStatus("error", { message: (e as Error).message });
      console.error("[yahoo] connect failed:", e);
    }
  }

  async disconnect() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.subs.clear();
    this.setStatus("disconnected");
  }

  private ensurePoller() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => { void this.pollOnce(); }, POLL_MS);
  }

  private async pollOnce() {
    if (this._status !== "connected" || this.subs.size === 0) return;
    const engineSyms = [...this.subs.keys()];
    const ySyms = engineSyms.map(toYahoo);
    try {
      const res = (await yahooQuote({ data: { symbols: ySyms } })) as any;
      if (res?.error) { console.warn("[yahoo] quote:", res.error); return; }
      const byY = new Map<string, any>();
      for (const q of res.quotes ?? []) byY.set(q.symbol, q);
      for (const engineSym of engineSyms) {
        const q = byY.get(toYahoo(engineSym));
        if (!q) continue;
        const quote: Quote = {
          symbol: engineSym, providerCode: this.code, ts: q.ts,
          bid: q.bid, ask: q.ask, last: q.last, spread: q.spread,
        };
        for (const h of this.subs.get(engineSym) ?? []) { try { h(quote); } catch { /* noop */ } }
      }
    } catch (e) {
      console.warn("[yahoo] poll failed:", e);
    }
  }

  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> {
    return CATALOG
      .filter((r) => !market || r.market === market)
      .map(({ y: _y, ...meta }) => meta);
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
    const res = (await yahooQuote({ data: { symbols: [toYahoo(symbol)] } })) as any;
    if (res?.error) throw new Error(res.error);
    const q = res.quotes?.[0]; if (!q) throw new Error(`yahoo_no_quote:${symbol}`);
    return { symbol, providerCode: this.code, ts: q.ts, bid: q.bid, ask: q.ask, last: q.last, spread: q.spread };
  }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    if (!this.booted) await this.connect();
    const res = (await yahooCandles({
      data: { symbol: toYahoo(q.symbol), timeframe: q.timeframe, from: q.from, to: q.to, count: q.limit },
    })) as any;
    if (res?.error) throw new Error(res.error);
    return res.candles ?? [];
  }
  getHistoricalData(q: CandleQuery) { return this.getCandles(q); }

  subscribe(symbol: string, handler: QuoteHandler): SubscriptionHandle {
    if (!this.booted) void this.connect();
    if (!this.subs.has(symbol)) this.subs.set(symbol, new Set());
    this.subs.get(symbol)!.add(handler);
    this.ensurePoller();
    const sub: SubscriptionHandle = {
      id: `yahoo-${symbol}-${Math.random().toString(36).slice(2, 8)}`, symbol,
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
