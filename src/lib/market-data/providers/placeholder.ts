/**
 * Placeholder provider — implements the `MarketDataProvider` interface for
 * adapters that are registered in the descriptor list but haven't yet had
 * their live REST/WS integration wired up (or that require credentials the
 * platform owner has not configured).
 *
 * The Engine treats it as `disabled` so no consumer accidentally receives
 * synthetic data, and the Admin Panel can still render its configuration
 * form and health tile.
 */
import { DESCRIPTORS_BY_CODE } from "../descriptors";
import { MarketProviderUnavailableError } from "../errors";
import type {
  Candle, CandleQuery, MarketDataProvider, MarketKind, MarketStatusInfo,
  ProviderCapabilities, ProviderDescriptor, ProviderStatus, Quote,
  QuoteHandler, SearchQuery, SessionWindow, StatusHandler,
  SubscriptionHandle, SymbolMeta,
} from "../types";

export class PlaceholderProvider implements MarketDataProvider {
  readonly code: string;
  readonly name: string;
  readonly descriptor: ProviderDescriptor;
  readonly capabilities: ProviderCapabilities;

  private _status: ProviderStatus = "disabled";
  private handlers = new Set<StatusHandler>();

  constructor(code: string) {
    const d = DESCRIPTORS_BY_CODE.get(code);
    if (!d) throw new Error(`Placeholder: no descriptor for ${code}`);
    this.code = d.code;
    this.name = d.name;
    this.descriptor = d;
    this.capabilities = d.capabilities;
  }

  async connect(): Promise<void> { /* stays disabled */ }
  async disconnect(): Promise<void> { /* noop */ }
  status(): ProviderStatus { return this._status; }
  onStatus(h: StatusHandler) { this.handlers.add(h); return () => this.handlers.delete(h); }

  private fail(reason: "not_configured" | "disabled" = "not_configured"): never {
    throw new MarketProviderUnavailableError({ providerCode: this.code, reason });
  }

  async getSymbols(): Promise<SymbolMeta[]> { return []; }
  async searchSymbols(_q: SearchQuery): Promise<SymbolMeta[]> { return []; }
  async getQuote(_symbol: string): Promise<Quote> { this.fail(); }
  async getCandles(_q: CandleQuery): Promise<Candle[]> { this.fail(); }
  async getHistoricalData(_q: CandleQuery): Promise<Candle[]> { this.fail(); }

  subscribe(symbol: string, _h: QuoteHandler): SubscriptionHandle {
    console.warn(`[market-data] ${this.code} is not configured — subscription ignored.`);
    return { id: `noop-${symbol}`, symbol, unsubscribe: () => {} };
  }
  unsubscribe(_h: SubscriptionHandle): void {}

  async getMarketStatus(market: MarketKind): Promise<MarketStatusInfo> { return { market, status: "closed" }; }
  async getSessions(): Promise<SessionWindow[]> { return []; }

  async testConnection() {
    return { ok: false, error: "Provider not configured. Add credentials in Admin → Market Data." };
  }
}
