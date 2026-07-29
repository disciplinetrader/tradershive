/**
 * Finnhub provider — POC for live forex quotes via WebSocket.
 *
 * Scope (intentionally narrow):
 *   • Live quotes for a handful of forex pairs + XAU/USD via
 *     `wss://ws.finnhub.io` (OANDA-prefixed symbols).
 *   • REST fallback `getQuote()` via the `finnhubQuote` server function.
 *   • No candle support — historical data stays on Twelve Data. Any
 *     `getCandles` call throws `finnhub_no_candles_poc` so callers can
 *     detect and route elsewhere.
 *
 * The provider is only reachable when
 *   VITE_LIVE_FOREX_PROVIDER === "finnhub"
 * or when the Admin Panel explicitly assigns "finnhub" to a market.
 */
import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { finnhubQuote, finnhubStatus, finnhubWsToken } from "../finnhub.functions";
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
    supportsRest: true, supportsWs: true, supportsHistorical: false, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private handlers = new Set<StatusHandler>();
  private subs = new Map<string, Set<QuoteHandler>>(); // engineSym -> handlers
  private lastQuote = new Map<string, Quote>();

  private ws: WebSocket | null = null;
  private wsReady = false;
  private wsQueue: string[] = []; // finnhub symbols pending subscribe after open
  private booted = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
      await this.openSocket();
    } catch (e) {
      this.setStatus("error", { message: (e as Error).message });
      console.error("[finnhub] connect failed:", e);
    }
  }

  private async openSocket() {
    if (typeof WebSocket === "undefined") { this.setStatus("disabled", { reason: "no_websocket" }); return; }
    const { token, url } = (await finnhubWsToken()) as { token: string; url: string };
    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    const openedAt = Date.now();
    ws.onopen = () => {
      this.wsReady = true;
      this.reconnectAttempts = 0;
      this.setStatus("connected");
      console.info(`[finnhub] ws connected in ${Date.now() - openedAt}ms`);
      // Flush any pending subscribes AND re-subscribe existing symbols after reconnect.
      const wanted = new Set<string>([...this.wsQueue, ...[...this.subs.keys()].map(toFinnhub)]);
      this.wsQueue = [];
      for (const s of wanted) ws.send(JSON.stringify({ type: "subscribe", symbol: s }));
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = (e) => { console.warn("[finnhub] ws error:", (e as Event).type); };
    ws.onclose = (e) => {
      this.wsReady = false;
      this.ws = null;
      if (this._status === "disabled") return;
      this.setStatus("disconnected", { code: e.code, reason: e.reason });
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempts, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket().catch((err) => console.warn("[finnhub] reconnect failed:", err));
    }, delay);
  }

  private onMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg?.type !== "trade" || !Array.isArray(msg.data)) return;
    for (const t of msg.data) {
      const fh = String(t.s ?? "");
      const engineSym = [...BY_ENGINE.entries()].find(([, r]) => r.fh === fh)?.[0];
      if (!engineSym) continue;
      const price = Number(t.p);
      if (!Number.isFinite(price) || price <= 0) continue;
      const half = syntheticHalfSpread(engineSym, price);
      const quote: Quote = {
        symbol: engineSym, providerCode: this.code,
        ts: Number(t.t) || Date.now(),
        last: price, bid: price - half, ask: price + half, spread: half * 2,
      };
      this.lastQuote.set(engineSym, quote);
      for (const h of this.subs.get(engineSym) ?? []) { try { h(quote); } catch { /* noop */ } }
    }
  }

  async disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* noop */ } this.ws = null; }
    this.wsReady = false;
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
    // Prefer the freshest WS tick if we have one.
    const ws = this.lastQuote.get(symbol);
    if (ws && Date.now() - ws.ts < 10_000) return ws;
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
      const fh = toFinnhub(symbol);
      if (this.wsReady && this.ws) this.ws.send(JSON.stringify({ type: "subscribe", symbol: fh }));
      else this.wsQueue.push(fh);
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
    if (set.size === 0) {
      this.subs.delete(handle.symbol);
      if (this.wsReady && this.ws) {
        try { this.ws.send(JSON.stringify({ type: "unsubscribe", symbol: toFinnhub(handle.symbol) })); }
        catch { /* noop */ }
      }
    }
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    return { market, status: this._status === "connected" ? "open" : "closed" };
  }
  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
