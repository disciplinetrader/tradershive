/**
 * Finnhub provider — POC for live forex quotes via WebSocket.
 *
 * Scope (intentionally narrow):
 *   • Live quotes for a handful of forex pairs + XAU/USD, polled through the
 *     authenticated `finnhubQuote` server function (OANDA-prefixed symbols).
 *     The API key never reaches the browser.
 *   • No candle support — historical data stays on Twelve Data. Any
 *     `getCandles` call throws `finnhub_no_candles_poc` so callers can
 *     detect and route elsewhere.
 *
 * The provider is only reachable when
 *   VITE_LIVE_FOREX_PROVIDER === "finnhub"
 * or when the Admin Panel explicitly assigns "finnhub" to a market.
 */
import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { finnhubQuote, finnhubStatus } from "../finnhub.functions";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

/** Engine-symbol → Finnhub (OANDA broker) symbol map. */
const CATALOG: Array<{ symbol: string; fh: string; displayName: string; market: MarketKind; tickSize: number; pricePrecision: number }> = [
  { symbol: "EURUSD", fh: "OANDA:EUR_USD", displayName: "EUR / USD", market: "forex",  tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "GBPUSD", fh: "OANDA:GBP_USD", displayName: "GBP / USD", market: "forex",  tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "USDJPY", fh: "OANDA:USD_JPY", displayName: "USD / JPY", market: "forex",  tickSize: 0.001,   pricePrecision: 3 },
  { symbol: "AUDUSD", fh: "OANDA:AUD_USD", displayName: "AUD / USD", market: "forex",  tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "USDCAD", fh: "OANDA:USD_CAD", displayName: "USD / CAD", market: "forex",  tickSize: 0.00001, pricePrecision: 5 },
  { symbol: "XAUUSD", fh: "OANDA:XAU_USD", displayName: "Gold / USD", market: "metals", tickSize: 0.01,   pricePrecision: 2 },
];

/** Live-quote poll cadence through the authenticated server proxy. */
const POLL_MS = 3_000;

const BY_ENGINE = new Map(CATALOG.map((r) => [r.symbol, r]));

function toFinnhub(engineSym: string): string {
  const hit = BY_ENGINE.get(engineSym);
  if (hit) return hit.fh;
  const s = engineSym.replace(/\//g, "").toUpperCase();
  if (s.length === 6) return `OANDA:${s.slice(0, 3)}_${s.slice(3)}`;
  return engineSym;
}

// Reasonable synthetic spread when the ticker gives us only last-trade.
function syntheticHalfSpread(sym: string, price: number): number {
  if (sym.startsWith("XAU")) return 0.05;
  if (sym.endsWith("JPY")) return 0.005;
  return price * 0.00005;
}

export class FinnhubProvider implements MarketDataProvider {
  readonly code = "finnhub";
  readonly descriptor = DESCRIPTORS_BY_CODE.get("finnhub")!;
  readonly name = "Finnhub";
  readonly capabilities: ProviderCapabilities = {
    markets: ["forex", "metals"],
    supportsRest: true, supportsWs: false, supportsHistorical: false, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private handlers = new Set<StatusHandler>();
  private subs = new Map<string, Set<QuoteHandler>>(); // engineSym -> handlers
  private lastQuote = new Map<string, Quote>();

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
   * Finnhub key stays on the server — the browser never sees it and no
   * socket URL carries a credential.
   */
  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => { void this.pollOnce(); }, POLL_MS);
    void this.pollOnce();
  }

  private async pollOnce() {
    if (this.polling) return;
    const symbols = [...this.subs.keys()];
    if (!symbols.length) return;
    this.polling = true;
    try {
      for (const engineSym of symbols) {
        try {
          const res = (await finnhubQuote({ data: { symbol: toFinnhub(engineSym) } })) as any;
          if (!res || res.error || !Number.isFinite(res.last)) continue;
          const half = Number.isFinite(res.spread)
            ? res.spread / 2
            : syntheticHalfSpread(engineSym, res.last);
          this.emit({
            symbol: engineSym, providerCode: this.code,
            ts: res.ts ?? Date.now(),
            last: res.last, bid: res.last - half, ask: res.last + half, spread: half * 2,
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
    if (this._status === "disabled") throw new Error("Finnhub provider not configured.");
    // Prefer the freshest polled tick if we have one.
    const cachedQuote = this.lastQuote.get(symbol);
    if (cachedQuote && Date.now() - cachedQuote.ts < POLL_MS) return cachedQuote;
    const res = (await finnhubQuote({ data: { symbol: toFinnhub(symbol) } })) as any;
    if (res?.error) throw new Error(res.error);
    console.info(`[finnhub] REST getQuote(${symbol}) in ${res.durationMs}ms`);
    return {
      symbol, providerCode: this.code, ts: res.ts,
      bid: res.bid, ask: res.ask, last: res.last, spread: res.spread,
    };
  }

  async getCandles(_q: CandleQuery): Promise<Candle[]> {
    // Historical candles are out of scope for the POC — Twelve Data owns
    // that path. Throwing lets the engine or caller fall back cleanly.
    throw new Error("finnhub_no_candles_poc");
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
    // Prime with last known tick if any.
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
