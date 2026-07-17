/**
 * OANDA provider — real implementation backed by the OANDA v20 REST API
 * via `src/lib/market-data/oanda.functions.ts` (server-side proxy so the
 * API token never ships to the browser).
 *
 * Live quotes: 1.5s polling of `/v3/accounts/{acct}/pricing` for the set of
 * actively-subscribed instruments (OANDA doesn't provide a browser-safe
 * streaming endpoint; server-side SSE can be added later without changing
 * this class or any consumer).
 */
import { oandaCandles, oandaInstruments, oandaPricing, oandaStatus } from "../oanda.functions";
import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

const POLL_MS = 1500;

// engine symbol ("EURUSD") ⇄ OANDA instrument ("EUR_USD")
function toOandaInstrument(sym: string, symbolMap: Map<string, string>): string {
  if (symbolMap.has(sym)) return symbolMap.get(sym)!;
  const s = sym.replace(/\//g, "").toUpperCase();
  // Best-effort: pair split heuristics for FX / metals.
  if (s.length === 6) return `${s.slice(0, 3)}_${s.slice(3)}`;
  if (s.startsWith("XAU") || s.startsWith("XAG")) return `${s.slice(0, 3)}_${s.slice(3)}`;
  return s.includes("_") ? s : s;
}

export class OandaProvider implements MarketDataProvider {
  readonly code = "oanda";
  readonly name = "OANDA";
  readonly capabilities: ProviderCapabilities = {
    markets: ["forex", "metals", "indices", "commodities"],
    supportsRest: true, supportsWs: false, supportsHistorical: true, supportsStreaming: true,
  };

  private _status: ProviderStatus = "disconnected";
  private handlers = new Set<StatusHandler>();
  private catalog: (SymbolMeta & { oandaName: string })[] = [];
  private symbolMap = new Map<string, string>(); // engine → oanda
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
      const probe = (await oandaStatus()) as { configured: boolean };
      if (!probe?.configured) {
        this.setStatus("disabled", { reason: "oanda_not_configured" });
        console.warn("[oanda] provider disabled — set OANDA_API_TOKEN and OANDA_ACCOUNT_ID to enable");
        return;
      }
      const list = (await oandaInstruments()) as any;
      if (list?.error) throw new Error(list.error);
      this.catalog = list ?? [];
      this.symbolMap.clear();
      for (const inst of this.catalog) this.symbolMap.set(inst.symbol, inst.oandaName);
      this.setStatus("connected", { instruments: this.catalog.length });
      console.info(`[oanda] connected — ${this.catalog.length} instruments`);
      this.ensurePoller();
    } catch (e) {
      this.setStatus("error", { message: (e as Error).message });
      console.warn("[oanda] connect failed:", e);
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
    const instruments = [...this.subs.keys()].map((s) => toOandaInstrument(s, this.symbolMap));
    try {
      const res = (await oandaPricing({ data: { instruments } })) as any;
      if (res?.error) { console.warn("[oanda] pricing:", res.error); return; }
      for (const p of res.prices ?? []) {
        // Deliver to every engine symbol that maps to this instrument.
        for (const [engineSym, set] of this.subs.entries()) {
          if (toOandaInstrument(engineSym, this.symbolMap) !== p.instrument) continue;
          const q: Quote = {
            symbol: engineSym, providerCode: this.code, ts: p.ts,
            bid: p.bid, ask: p.ask, last: p.last, spread: p.spread,
          };
          for (const h of set) { try { h(q); } catch { /* noop */ } }
        }
      }
    } catch (e) {
      console.warn("[oanda] poll failed:", e);
    }
  }

  async getSymbols(market?: MarketKind): Promise<SymbolMeta[]> {
    if (!this.booted) await this.connect();
    if (this._status === "disabled") return [];
    return this.catalog
      .filter((s) => !market || s.market === market)
      .map(({ oandaName: _o, ...meta }) => meta);
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
    if (this._status === "disabled") throw new Error("oanda_not_configured");
    const inst = toOandaInstrument(symbol, this.symbolMap);
    const res = (await oandaPricing({ data: { instruments: [inst] } })) as any;
    if (res?.error) throw new Error(res.error);
    const p = res.prices?.[0]; if (!p) throw new Error(`oanda_no_price:${symbol}`);
    return {
      symbol, providerCode: this.code, ts: p.ts,
      bid: p.bid, ask: p.ask, last: p.last, spread: p.spread,
    };
  }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    if (!this.booted) await this.connect();
    if (this._status === "disabled") throw new Error("oanda_not_configured");
    const inst = toOandaInstrument(q.symbol, this.symbolMap);
    const res = (await oandaCandles({
      data: { instrument: inst, timeframe: q.timeframe, from: q.from, to: q.to, count: q.limit },
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
      id: `oanda-${symbol}-${Math.random().toString(36).slice(2, 8)}`, symbol,
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
