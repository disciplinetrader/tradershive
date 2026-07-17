/**
 * Development mock provider — deterministic OHLCV + simulated live ticks.
 *
 * Used everywhere by default so the platform runs without external creds.
 * Real providers (Binance, OANDA) implement the same interface.
 */

import { TIMEFRAME_SECONDS } from "../constants";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle,
  CandleQuery,
  MarketDataProvider,
  MarketKind,
  MarketStatusInfo,
  ProviderCapabilities,
  ProviderStatus,
  Quote,
  QuoteHandler,
  SearchQuery,
  SessionWindow,
  StatusHandler,
  SubscriptionHandle,
  SymbolMeta,
} from "../types";

const CATALOG: SymbolMeta[] = [
  { symbol: "EURUSD", displayName: "EUR / USD", market: "forex", baseAsset: "EUR", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5, category: "fx_majors", isPopular: true },
  { symbol: "GBPUSD", displayName: "GBP / USD", market: "forex", baseAsset: "GBP", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5, category: "fx_majors", isPopular: true },
  { symbol: "USDJPY", displayName: "USD / JPY", market: "forex", baseAsset: "USD", quoteAsset: "JPY", tickSize: 0.001, pricePrecision: 3, category: "fx_majors", isPopular: true },
  { symbol: "USDCHF", displayName: "USD / CHF", market: "forex", baseAsset: "USD", quoteAsset: "CHF", tickSize: 0.00001, pricePrecision: 5, category: "fx_majors" },
  { symbol: "AUDUSD", displayName: "AUD / USD", market: "forex", baseAsset: "AUD", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5, category: "fx_majors" },
  { symbol: "NZDUSD", displayName: "NZD / USD", market: "forex", baseAsset: "NZD", quoteAsset: "USD", tickSize: 0.00001, pricePrecision: 5, category: "fx_majors" },
  { symbol: "USDCAD", displayName: "USD / CAD", market: "forex", baseAsset: "USD", quoteAsset: "CAD", tickSize: 0.00001, pricePrecision: 5, category: "fx_majors" },
  { symbol: "XAUUSD", displayName: "Gold / USD", market: "metals", baseAsset: "XAU", quoteAsset: "USD", tickSize: 0.01, pricePrecision: 2, category: "metals", isPopular: true },
  { symbol: "XAGUSD", displayName: "Silver / USD", market: "metals", baseAsset: "XAG", quoteAsset: "USD", tickSize: 0.001, pricePrecision: 3, category: "metals" },
  { symbol: "BTCUSDT", displayName: "BTC / USDT", market: "crypto", baseAsset: "BTC", quoteAsset: "USDT", tickSize: 0.01, pricePrecision: 2, category: "crypto_top", isPopular: true },
  { symbol: "ETHUSDT", displayName: "ETH / USDT", market: "crypto", baseAsset: "ETH", quoteAsset: "USDT", tickSize: 0.01, pricePrecision: 2, category: "crypto_top", isPopular: true },
  { symbol: "SOLUSDT", displayName: "SOL / USDT", market: "crypto", baseAsset: "SOL", quoteAsset: "USDT", tickSize: 0.001, pricePrecision: 3, category: "crypto_top", isPopular: true },
  { symbol: "BNBUSDT", displayName: "BNB / USDT", market: "crypto", baseAsset: "BNB", quoteAsset: "USDT", tickSize: 0.01, pricePrecision: 2, category: "crypto_top" },
  { symbol: "XRPUSDT", displayName: "XRP / USDT", market: "crypto", baseAsset: "XRP", quoteAsset: "USDT", tickSize: 0.0001, pricePrecision: 4, category: "crypto_alt" },
  { symbol: "ADAUSDT", displayName: "ADA / USDT", market: "crypto", baseAsset: "ADA", quoteAsset: "USDT", tickSize: 0.0001, pricePrecision: 4, category: "crypto_alt" },
  { symbol: "DOGEUSDT", displayName: "DOGE / USDT", market: "crypto", baseAsset: "DOGE", quoteAsset: "USDT", tickSize: 0.00001, pricePrecision: 5, category: "crypto_alt" },
  { symbol: "SPX500", displayName: "S&P 500", market: "indices", tickSize: 0.1, pricePrecision: 1, category: "indices_us", isPopular: true },
  { symbol: "NAS100", displayName: "NASDAQ 100", market: "indices", tickSize: 0.1, pricePrecision: 1, category: "indices_us", isPopular: true },
  { symbol: "US30", displayName: "Dow Jones 30", market: "indices", tickSize: 0.1, pricePrecision: 1, category: "indices_us" },
];

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basePrice(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("BTC")) return 60000;
  if (s.includes("ETH")) return 3200;
  if (s.includes("SOL")) return 170;
  if (s.includes("BNB")) return 580;
  if (s.includes("XRP")) return 0.6;
  if (s.includes("ADA")) return 0.45;
  if (s.includes("DOGE")) return 0.13;
  if (s.includes("XAU") || s === "XAUUSD") return 2400;
  if (s.includes("XAG") || s === "XAGUSD") return 28;
  if (s.startsWith("USDJPY") || s.endsWith("JPY")) return 155;
  if (s === "NAS100") return 19500;
  if (s === "SPX500") return 5500;
  if (s === "US30") return 40000;
  if (/^[A-Z]{3}[A-Z]{3}$/.test(s)) return 1.1;
  return 100;
}
function vol(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("BTC") || s.includes("ETH") || s.includes("SOL")) return 0.012;
  if (s.endsWith("JPY")) return 0.0015;
  if (s.includes("XAU")) return 0.004;
  if (/^[A-Z]{3}[A-Z]{3}$/.test(s)) return 0.0008;
  return 0.006;
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly code = "mock";
  readonly name = "Development Mock";
  readonly capabilities: ProviderCapabilities = {
    markets: ["forex","crypto","indices","metals","commodities","futures","stocks"],
    supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private statusHandlers = new Set<StatusHandler>();
  private subs = new Map<string, Set<QuoteHandler>>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  status() { return this._status; }
  onStatus(h: StatusHandler) { this.statusHandlers.add(h); return () => this.statusHandlers.delete(h); }
  private setStatus(s: ProviderStatus, meta?: Record<string, unknown>) {
    this._status = s;
    for (const h of this.statusHandlers) { try { h(s, meta); } catch { /* noop */ } }
  }

  async connect() {
    if (this._status === "connected") return;
    this.setStatus("connecting");
    await new Promise((r) => setTimeout(r, 120));
    this.setStatus("connected", { latencyMs: 40 });
    if (!this.tickTimer && typeof window !== "undefined") {
      this.tickTimer = setInterval(() => this.emitTicks(), 1000);
    }
  }
  async disconnect() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    this.setStatus("disconnected");
  }

  async getSymbols(market?: MarketKind) {
    return market ? CATALOG.filter((s) => s.market === market) : CATALOG.slice();
  }
  async searchSymbols({ q, market, limit = 20 }: SearchQuery) {
    const needle = q.trim().toLowerCase();
    return CATALOG.filter((s) =>
      (!market || s.market === market) &&
      (!needle || s.symbol.toLowerCase().includes(needle) || s.displayName.toLowerCase().includes(needle))
    ).slice(0, limit);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const now = Date.now();
    const seed = hash(`${symbol}|${Math.floor(now / 1000)}`);
    const r = mulberry32(seed)();
    const base = basePrice(symbol);
    const v = vol(symbol);
    const last = base * (1 + (r - 0.5) * v);
    const spread = base * v * 0.05;
    return {
      symbol, providerCode: this.code, ts: now,
      bid: last - spread / 2, ask: last + spread / 2, last, spread,
      changePct: (r - 0.5) * 2,
    };
  }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    const stepSec = TIMEFRAME_SECONDS[q.timeframe];
    const stepMs = stepSec * 1000;
    const from = Math.floor(q.from / stepMs) * stepMs;
    const count = Math.max(1, Math.min(q.limit ?? 4000, Math.ceil((q.to - from) / stepMs)));
    const seed = hash(`${q.symbol}|${q.timeframe}|${new Date(from).toISOString().slice(0, 10)}`);
    const rand = mulberry32(seed);
    const base = basePrice(q.symbol);
    const v = vol(q.symbol) * Math.sqrt(stepSec / 60);
    const out: Candle[] = [];
    let last = base * (0.98 + rand() * 0.04);
    for (let i = 0; i < count; i++) {
      const time = from + i * stepMs;
      const bias = Math.sin(i / 40 + (seed % 7)) * v * 0.3;
      const change = (rand() - 0.5) * v * 2 + bias;
      const open = last;
      const close = Math.max(0.00001, open * (1 + change));
      const range = Math.abs(open - close) + Math.abs(v * open * (0.4 + rand()));
      const high = Math.max(open, close) + range * rand() * 0.6;
      const low = Math.min(open, close) - range * rand() * 0.6;
      const volume = Math.floor(500 + rand() * 4500);
      out.push({ time, open, high, low, close, volume });
      last = close;
    }
    return out;
  }
  getHistoricalData(q: CandleQuery) { return this.getCandles(q); }

  subscribe(symbol: string, handler: QuoteHandler): SubscriptionHandle {
    if (!this.subs.has(symbol)) this.subs.set(symbol, new Set());
    this.subs.get(symbol)!.add(handler);
    const id = `${symbol}-${Math.random().toString(36).slice(2, 8)}`;
    const sub: SubscriptionHandle = { id, symbol, unsubscribe: () => this.unsubscribe(sub) };
    // Fire an immediate quote so subscribers hydrate.
    this.getQuote(symbol).then((q) => handler(q)).catch(() => {});
    // Persist handler reference on the sub for unsubscribe
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

  private async emitTicks() {
    for (const symbol of this.subs.keys()) {
      const q = await this.getQuote(symbol);
      const set = this.subs.get(symbol);
      if (!set) continue;
      for (const h of set) { try { h(q); } catch { /* noop */ } }
    }
  }

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> {
    if (market === "crypto") return { market, status: "open" };
    const now = new Date();
    const day = now.getUTCDay();
    const min = now.getUTCHours() * 60 + now.getUTCMinutes();
    // Forex 24/5, closed Sat + Sun before 22:00 UTC
    const isOpen = !(day === 6 || (day === 0 && min < 22 * 60) || (day === 5 && min >= 21 * 60));
    return { market, status: isOpen ? "open" : "closed" };
  }

  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
