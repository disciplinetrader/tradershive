/**
 * OANDA provider — placeholder implementation.
 *
 * OANDA requires an authenticated account/token and per-account streams; when
 * credentials are not configured this provider stays "disabled" and defers to
 * the mock provider. All calls are still routed through the shared interface
 * so the engine treats it identically to Binance or any future provider.
 */

import { DEFAULT_SESSIONS } from "../sessions";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderStatus, Quote, QuoteHandler, SearchQuery,
  SessionWindow, StatusHandler, SubscriptionHandle, SymbolMeta,
} from "../types";

export class OandaProvider implements MarketDataProvider {
  readonly code = "oanda";
  readonly name = "OANDA";
  readonly capabilities: ProviderCapabilities = {
    markets: ["forex","metals","indices","commodities"],
    supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true,
  };
  private _status: ProviderStatus = "disabled";
  private handlers = new Set<StatusHandler>();

  status() { return this._status; }
  onStatus(h: StatusHandler) { this.handlers.add(h); return () => this.handlers.delete(h); }
  private setStatus(s: ProviderStatus) {
    this._status = s;
    for (const h of this.handlers) { try { h(s); } catch { /* noop */ } }
  }

  async connect() {
    // Requires OANDA_API_TOKEN + OANDA_ACCOUNT_ID configured server-side.
    // Without credentials we stay disabled; engine fails over to mock.
    this.setStatus("disabled");
  }
  async disconnect() { this.setStatus("disconnected"); }

  async getSymbols(): Promise<SymbolMeta[]> { return []; }
  async searchSymbols(_q: SearchQuery): Promise<SymbolMeta[]> { return []; }
  async getQuote(symbol: string): Promise<Quote> {
    throw new Error(`OANDA provider not configured (symbol=${symbol})`);
  }
  async getCandles(_q: CandleQuery): Promise<Candle[]> { return []; }
  getHistoricalData(q: CandleQuery) { return this.getCandles(q); }
  subscribe(symbol: string, _handler: QuoteHandler): SubscriptionHandle {
    return { id: `noop-${Math.random()}`, symbol, unsubscribe: () => {} };
  }
  unsubscribe(_h: SubscriptionHandle) {}
  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> { return { market, status: "closed" }; }
  async getSessions(): Promise<SessionWindow[]> { return DEFAULT_SESSIONS; }
}
