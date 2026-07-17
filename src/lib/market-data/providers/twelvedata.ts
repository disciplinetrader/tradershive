/**
import { DESCRIPTORS_BY_CODE } from "../descriptors";
 * Twelve Data provider — REST-based feed for Forex, Metals and Indices
 * (and, in the future, Stocks). No user account required beyond a single
 * TWELVE_DATA_API_KEY server secret.
 *
 * Live quotes: polled through the server proxy at a modest cadence so the
 * free-tier request quota is respected. Historical candles use /time_series.
 */
import { twelveDataCandles, twelveDataQuote, twelveDataStatus } from "../twelvedata.functions";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

const POLL_MS = 8000; // 7.5 req/min — safe for Twelve Data free tier.

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
  readonly name = "Twelve Data";
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
      const probe = (await twelveDataStatus()) as { configured: boolean; plan?: string };
      if (!probe?.configured) {
        this.setStatus("disabled", { reason: "twelvedata_not_configured" });
        console.warn("[twelvedata] provider disabled — Forex provider not configured. Set TWELVE_DATA_API_KEY to enable.");
        return;
      }
      this.setStatus("connected", { plan: probe.plan });
      console.info(`[twelvedata] connected — plan=${probe.plan ?? "unknown"}`);
      this.ensurePoller();
    } catch (e) {
      this.setStatus("error", { message: (e as Error).message });
      console.error("[twelvedata] connect failed:", e);
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
    const tdSyms = engineSyms.map(toTd);
    try {
      const res = (await twelveDataQuote({ data: { symbols: tdSyms } })) as any;
      if (res?.error) { console.warn("[twelvedata] quote:", res.error); return; }
      const byTd = new Map<string, any>();
      for (const q of res.quotes ?? []) byTd.set(q.symbol, q);
      for (const engineSym of engineSyms) {
        const q = byTd.get(toTd(engineSym));
        if (!q) continue;
        const quote: Quote = {
          symbol: engineSym, providerCode: this.code, ts: q.ts,
          bid: q.bid, ask: q.ask, last: q.last, spread: q.spread,
        };
        for (const h of this.subs.get(engineSym) ?? []) { try { h(quote); } catch { /* noop */ } }
      }
    } catch (e) {
      console.warn("[twelvedata] poll failed:", e);
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
    return { symbol, providerCode: this.code, ts: q.ts, bid: q.bid, ask: q.ask, last: q.last, spread: q.spread };
  }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    if (!this.booted) await this.connect();
    if (this._status === "disabled") throw new Error("Forex provider not configured.");
    const res = (await twelveDataCandles({
      data: { symbol: toTd(q.symbol), timeframe: q.timeframe, from: q.from, to: q.to, count: q.limit },
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
    if (set.size === 0) this.subs.delete(handle.symbol);
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    return { market, status: this._status === "connected" ? "open" : "closed" };
  }
  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
