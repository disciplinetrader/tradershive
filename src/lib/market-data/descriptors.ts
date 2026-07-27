/**
 * Static descriptors for every provider TradersHIVE Arena ships with.
 * The Admin Panel and Setup Wizard render entirely from this list — adding a
 * new provider means: implement `MarketDataProvider`, export a descriptor
 * here, register it in `registry.ts`. That's it.
 */
import type { ProviderDescriptor, CredentialField } from "./types";

const OANDA_ENV: CredentialField = {
  key: "environment", label: "Environment", type: "select", required: true,
  options: [
    { value: "practice", label: "Practice" },
    { value: "live",     label: "Live" },
  ],
};

export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
  {
    code: "binance", name: "Binance",
    description: "Public spot market data for crypto pairs. No API key needed.",
    website: "https://binance.com",
    markets: ["crypto"], publicByDefault: true,
    capabilities: { markets: ["crypto"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true, supportsOrderbook: true },
    credentials: [
      { key: "api_key",    label: "API Key (optional)", type: "text",     required: false, help: "Only needed for private endpoints." },
      { key: "api_secret", label: "API Secret (optional)", type: "password", required: false },
    ],
  },
  {
    code: "twelvedata", name: "Twelve Data",
    description: "Forex, metals, indices, ETFs and stocks via a single REST API.",
    website: "https://twelvedata.com",
    markets: ["forex", "metals", "indices", "commodities", "stocks"], publicByDefault: false,
    capabilities: { markets: ["forex","metals","indices","commodities","stocks"], supportsRest: true, supportsWs: false, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_key", label: "API Key", type: "password", required: true, help: "https://twelvedata.com/account/api-keys" },
    ],
  },
  {
    code: "finnhub", name: "Finnhub",
    description: "Real-time and historical data for US stocks, forex, and crypto.",
    website: "https://finnhub.io",
    markets: ["stocks", "forex", "crypto"], publicByDefault: false,
    capabilities: { markets: ["stocks","forex","crypto"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [{ key: "api_key", label: "API Key", type: "password", required: true }],
  },
  {
    code: "polygon", name: "Polygon.io",
    description: "Institutional-grade US stocks, options, forex and crypto.",
    website: "https://polygon.io",
    markets: ["stocks", "forex", "crypto", "indices"], publicByDefault: false,
    capabilities: { markets: ["stocks","forex","crypto","indices"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [{ key: "api_key", label: "API Key", type: "password", required: true }],
  },
  {
    code: "alphavantage", name: "Alpha Vantage",
    description: "Free REST API for stocks, forex, and crypto with historical coverage.",
    website: "https://www.alphavantage.co",
    markets: ["stocks", "forex", "crypto"], publicByDefault: false,
    capabilities: { markets: ["stocks","forex","crypto"], supportsRest: true, supportsWs: false, supportsHistorical: true, supportsStreaming: false },
    credentials: [{ key: "api_key", label: "API Key", type: "password", required: true }],
  },
  {
    code: "coinbase", name: "Coinbase",
    description: "Public REST + WebSocket feed for major crypto pairs. No API key needed for public data.",
    website: "https://www.coinbase.com",
    markets: ["crypto"], publicByDefault: true,
    capabilities: { markets: ["crypto"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_key",    label: "API Key (optional)", type: "text",     required: false },
      { key: "api_secret", label: "API Secret (optional)", type: "password", required: false },
    ],
  },
  {
    code: "kraken", name: "Kraken",
    description: "Public REST + WebSocket feed for Kraken spot crypto markets.",
    website: "https://www.kraken.com",
    markets: ["crypto"], publicByDefault: true,
    capabilities: { markets: ["crypto"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_key", label: "API Key (optional)", type: "text", required: false },
      { key: "api_secret", label: "API Secret (optional)", type: "password", required: false },
    ],
  },
  {
    code: "bybit", name: "Bybit",
    description: "Spot and derivatives crypto data. Public feed requires no key.",
    website: "https://www.bybit.com",
    markets: ["crypto", "futures"], publicByDefault: true,
    capabilities: { markets: ["crypto","futures"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_key", label: "API Key (optional)", type: "text", required: false },
      { key: "api_secret", label: "API Secret (optional)", type: "password", required: false },
    ],
  },
  {
    code: "okx", name: "OKX",
    description: "Global crypto exchange with spot and futures market data.",
    website: "https://www.okx.com",
    markets: ["crypto", "futures"], publicByDefault: true,
    capabilities: { markets: ["crypto","futures"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_key", label: "API Key (optional)", type: "text", required: false },
      { key: "api_secret", label: "API Secret (optional)", type: "password", required: false },
      { key: "passphrase", label: "Passphrase (optional)", type: "password", required: false },
    ],
  },
  {
    code: "alpaca", name: "Alpaca Markets",
    description: "Commission-free US stock market data + crypto for retail brokerage flows.",
    website: "https://alpaca.markets",
    markets: ["stocks", "crypto"], publicByDefault: false,
    capabilities: { markets: ["stocks","crypto"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_key", label: "API Key ID", type: "text", required: true },
      { key: "api_secret", label: "API Secret", type: "password", required: true },
      { key: "environment", label: "Environment", type: "select", required: true, options: [{value:"paper",label:"Paper"},{value:"live",label:"Live"}] },
    ],
  },
  {
    code: "oanda", name: "OANDA",
    description: "Professional forex and CFD broker data feed.",
    website: "https://www.oanda.com",
    markets: ["forex", "metals", "indices", "commodities"], publicByDefault: false,
    capabilities: { markets: ["forex","metals","indices","commodities"], supportsRest: true, supportsWs: false, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "api_token", label: "API Token", type: "password", required: true },
      { key: "account_id", label: "Account ID", type: "text", required: true },
      OANDA_ENV,
    ],
  },
  {
    code: "interactive_brokers", name: "Interactive Brokers",
    description: "Multi-asset professional broker. Coming soon.",
    website: "https://www.interactivebrokers.com",
    markets: ["stocks", "futures", "forex", "indices", "commodities"], publicByDefault: false,
    capabilities: { markets: ["stocks","futures","forex","indices","commodities"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "gateway_url", label: "Gateway URL", type: "text", required: true, placeholder: "https://localhost:5000" },
      { key: "account_id", label: "Account ID", type: "text", required: true },
    ],
    comingSoon: true,
  },
  {
    code: "metatrader", name: "MetaTrader Bridge",
    description: "Bridge to MT4 / MT5 terminals. Coming soon.",
    markets: ["forex", "metals", "indices", "commodities", "futures"], publicByDefault: false,
    capabilities: { markets: ["forex","metals","indices","commodities","futures"], supportsRest: true, supportsWs: true, supportsHistorical: true, supportsStreaming: true },
    credentials: [
      { key: "bridge_url", label: "Bridge URL", type: "text", required: true },
      { key: "shared_secret", label: "Shared Secret", type: "password", required: true },
    ],
    comingSoon: true,
  },
];

export const DESCRIPTORS_BY_CODE = new Map(PROVIDER_DESCRIPTORS.map((d) => [d.code, d]));
