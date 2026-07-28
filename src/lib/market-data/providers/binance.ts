/**
 * Binance provider — REST + WebSocket for crypto.
 *
 * No API key required for public market data. Falls back gracefully
 * On failure the engine surfaces MarketProviderUnavailableError — no silent mock fallback.
 */

import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { TIMEFRAME_SECONDS } from "../constants";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta, Timeframe,
} from "../types";

const REST = "https://api.binance.com";
const WS = "wss://stream.binance.com:9443/stream";

const TF_MAP: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1H": "1h", "2H": "2h", "4H": "4h", "1D": "1d", "1W": "1w", "1M": "1M",
};

function toNative(symbol: string): string { return symbol.replace(/[\/\-\.]/g, "").toUpperCase(); }

export class BinanceProvider implements MarketDataProvider {
  readonly code = "binance";
  readonly descriptor = DESCRIPTORS_BY_CODE.get("binance")!;
  readonly name = "Binance";
  readonly capabilities: ProviderCapabilities = {
    markets: ["crypto"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private statusHandlers = new Set<StatusHandler>();
  private ws: WebSocket | null = null;
  private subs = new Map<string, Set<QuoteHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  status() { return this._status; }
  onStatus(h: StatusHandler) { this.statusHandlers.add(h); return () => this.statusHandlers.delete(h); }
  private setStatus(s: ProviderStatus, meta?: Record<string, unknown>) {
    this._status = s;
    for (const h of this.statusHandlers) { try { h(s, meta); } catch { /* noop */ } }
  }

  async connect() {
    if (typeof window === "undefined") { this.setStatus("disabled"); return; }
    if (this._status === "connected" || this._status === "connecting") return;
    this.openWs();
  }
  async disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* noop */ } this.ws = null; }
    this.setStatus("disconnected");
  }

  private openWs() {
    this.setStatus("connecting");
    const streams = [...this.subs.keys()].map((s) => `${toNative(s).toLowerCase()}@bookTicker`);
    const url = streams.length ? `${WS}?streams=${streams.join("/")}` : WS;
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error("[binance] WebSocket construction failed:", e);
      this.scheduleReconnect(); return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      console.info(`[binance] WS connected (${this.subs.size} symbols)`);
      // Binance sends WS ping frames every ~3 min; the browser auto-responds
      // with a pong. Do NOT send app-level heartbeats — Binance treats
      // unsolicited text frames as protocol violations and closes with 1006.
      if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    };
    this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    this.ws.onerror = () => {
      // WS `error` events carry no diagnostic info in browsers — the useful
      // signal is the `close` event that follows. Just mark status; don't
      // spam the console every reconnect.
      this.setStatus("error");
    };
    this.ws.onclose = (ev) => {
      this.setStatus("disconnected");
      // Only warn the first time; subsequent reconnects are expected.
      if (!ev.wasClean && this.reconnectAttempt === 0) {
        console.warn(`[binance] WS closed (code=${ev.code}); reconnecting with backoff`);
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 750 * Math.pow(2, this.reconnectAttempt++));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.openWs(); }, delay);
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      const d = msg?.data ?? msg;
      if (!d?.s) return;
      const symbol = d.s as string;
      const bid = parseFloat(d.b), ask = parseFloat(d.a);
      const last = (bid + ask) / 2;
      const q: Quote = {
        symbol, providerCode: this.code, ts: Date.now(),
        bid, ask, last, spread: ask - bid,
      };
      // Route to any subscriber matching either native or upstream symbol.
      for (const [key, set] of this.subs.entries()) {
        if (toNative(key) === symbol) for (const h of set) { try { h(q); } catch { /* noop */ } }
      }
    } catch { /* noop */ }
  }

  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> {
    if (market && market !== "crypto") return [];
    try {
      const res = await fetch(`${REST}/api/v3/exchangeInfo`);
      const data = await res.json();
      return (data.symbols ?? []).filter((s: any) => s.status === "TRADING").slice(0, 500).map((s: any) => ({
        symbol: s.symbol, displayName: `${s.baseAsset} / ${s.quoteAsset}`, market: "crypto" as const,
        baseAsset: s.baseAsset, quoteAsset: s.quoteAsset, tickSize: 0.00001, pricePrecision: s.quotePrecision ?? 2,
      }));
    } catch (e) { console.warn("[binance] getSymbols failed:", e); return []; }
  }
  async searchSymbols({ q, market, limit = 20 }: SearchQuery): Promise<SymbolMeta[]> {
    const all = await this.getSymbols(market);
    const needle = q.trim().toLowerCase();
    return all.filter((s) => !needle || s.symbol.toLowerCase().includes(needle) || s.displayName.toLowerCase().includes(needle)).slice(0, limit);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const native = toNative(symbol);
    const res = await fetch(`${REST}/api/v3/ticker/bookTicker?symbol=${native}`);
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const d = await res.json();
    const bid = parseFloat(d.bidPrice), ask = parseFloat(d.askPrice);
    return { symbol, providerCode: this.code, ts: Date.now(), bid, ask, last: (bid + ask) / 2, spread: ask - bid };
  }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    const tf = TF_MAP[q.timeframe];
    if (!tf) return [];
    const native = toNative(q.symbol);
    const params = new URLSearchParams({
      symbol: native, interval: tf,
      startTime: String(q.from), endTime: String(q.to),
      limit: String(Math.min(1000, q.limit ?? 1000)),
    });
    const res = await fetch(`${REST}/api/v3/klines?${params.toString()}`);
    if (!res.ok) throw new Error(`binance klines ${res.status}`);
    const rows: any[] = await res.json();
    return rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
  }
  getHistoricalData(q: CandleQuery) { return this.getCandles(q); }

  private resubTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleResub() {
    if (this.resubTimer) return;
    this.resubTimer = setTimeout(() => {
      this.resubTimer = null;
      if (this._status === "connected" && this.ws) { try { this.ws.close(); } catch { /* noop */ } }
      else this.openWs();
    }, 200);
  }
  subscribe(symbol: string, handler: QuoteHandler): SubscriptionHandle {
    const isNew = !this.subs.has(symbol);
    if (isNew) this.subs.set(symbol, new Set());
    this.subs.get(symbol)!.add(handler);
    if (isNew) this.scheduleResub();
    else if (this._status !== "connected" && this._status !== "connecting") this.connect();
    const sub: SubscriptionHandle = { id: `${symbol}-${Math.random().toString(36).slice(2, 8)}`, symbol, unsubscribe: () => this.unsubscribe(sub) };
    (sub as unknown as { _handler: QuoteHandler })._handler = handler;
    return sub;
  }
  unsubscribe(handle: SubscriptionHandle) {
    const h = (handle as unknown as { _handler?: QuoteHandler })._handler;
    const set = this.subs.get(handle.symbol);
    if (!set || !h) return;
    set.delete(h);
    if (set.size === 0) { this.subs.delete(handle.symbol); this.scheduleResub(); }
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    if (market !== "crypto") return { market, status: "closed" };
    return { market, status: "open" };
  }
  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
