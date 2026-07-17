/**
 * Market Data Engine — shared types.
 *
 * Every consumer of market data in TradersHIVE Arena speaks this vocabulary.
 * Providers implement `MarketDataProvider`; the Engine orchestrates them.
 */

export type MarketKind =
  | "forex"
  | "crypto"
  | "indices"
  | "metals"
  | "commodities"
  | "futures"
  | "stocks";

export type Timeframe =
  | "tick"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1H"
  | "2H"
  | "4H"
  | "1D"
  | "1W"
  | "1M";

export type MarketStatusKind =
  | "open"
  | "closed"
  | "pre_market"
  | "after_hours"
  | "holiday"
  | "maintenance";

export type ProviderStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  | "disabled";

export interface SymbolMeta {
  symbol: string;
  displayName: string;
  market: MarketKind;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  tickSize: number;
  pricePrecision: number;
  category?: string | null;
  isPopular?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  spread: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  changePct?: number;
  ts: number; // epoch ms
  providerCode: string;
}

export interface Candle {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleQuery {
  symbol: string;
  timeframe: Timeframe;
  from: number;
  to: number;
  limit?: number;
}

export interface SearchQuery {
  q: string;
  market?: MarketKind;
  limit?: number;
}

export interface SessionWindow {
  code: string;
  name: string;
  market: MarketKind;
  openUtcMinute: number;
  closeUtcMinute: number;
  weekdays: number[];
  color?: string | null;
}

export interface MarketStatusInfo {
  market: MarketKind;
  status: MarketStatusKind;
  nextOpen?: number | null;
  nextClose?: number | null;
}

export type QuoteHandler = (q: Quote) => void;
export type CandleHandler = (c: Candle) => void;
export type StatusHandler = (s: ProviderStatus, meta?: Record<string, unknown>) => void;

export interface SubscriptionHandle {
  id: string;
  symbol: string;
  timeframe?: Timeframe;
  unsubscribe(): void;
}

export interface ProviderCapabilities {
  markets: MarketKind[];
  supportsRest: boolean;
  supportsWs: boolean;
  supportsHistorical: boolean;
  supportsStreaming: boolean;
}

export interface MarketDataProvider {
  readonly code: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): ProviderStatus;
  onStatus(handler: StatusHandler): () => void;

  getSymbols(market?: MarketKind): Promise<SymbolMeta[]>;
  searchSymbols(q: SearchQuery): Promise<SymbolMeta[]>;

  getQuote(symbol: string): Promise<Quote>;
  getCandles(q: CandleQuery): Promise<Candle[]>;
  getHistoricalData(q: CandleQuery): Promise<Candle[]>;

  subscribe(symbol: string, handler: QuoteHandler): SubscriptionHandle;
  unsubscribe(handle: SubscriptionHandle): void;

  getMarketStatus(market: MarketKind): Promise<MarketStatusInfo>;
  getSessions(): Promise<SessionWindow[]>;
}
