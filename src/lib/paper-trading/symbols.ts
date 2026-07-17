// Symbol catalog. Every symbol carries the metadata the calculator needs
// (pip size, pip value per 1.00 lot, contract size, decimals, category).
// Broker feeds can be swapped in later without changing the calculator.

export type PaperMarket = "forex" | "crypto" | "stocks" | "indices" | "futures" | "metals";

export type SymbolMeta = {
  symbol: string;
  name: string;
  market: PaperMarket;
  pipSize: number;         // price move that counts as "1 pip"
  pipValuePerLot: number;  // USD value of 1 pip on a 1.00 lot
  contractSize: number;    // units per 1.00 lot (informational)
  decimals: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  refPrice: number;        // seed price for simulator until a real feed is wired
  volatility: number;      // % daily-ish drift for the mock feed
};

// Curated but comprehensive. Prices are seed values; the mock feed evolves them.
export const SYMBOL_CATALOG: SymbolMeta[] = [
  // Forex majors
  { symbol: "EUR/USD", name: "Euro / US Dollar",       market: "forex", pipSize: 0.0001, pipValuePerLot: 10, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 1.0891, volatility: 0.4 },
  { symbol: "GBP/USD", name: "British Pound / USD",    market: "forex", pipSize: 0.0001, pipValuePerLot: 10, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 1.2874, volatility: 0.5 },
  { symbol: "USD/JPY", name: "US Dollar / Yen",        market: "forex", pipSize: 0.01,   pipValuePerLot: 9.5, contractSize: 100_000, decimals: 3, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 156.92, volatility: 0.5 },
  { symbol: "AUD/USD", name: "Aussie / USD",           market: "forex", pipSize: 0.0001, pipValuePerLot: 10, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 0.6712, volatility: 0.5 },
  { symbol: "USD/CAD", name: "USD / Canadian Dollar",  market: "forex", pipSize: 0.0001, pipValuePerLot: 7.5, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 1.3712, volatility: 0.4 },
  { symbol: "USD/CHF", name: "USD / Swiss Franc",      market: "forex", pipSize: 0.0001, pipValuePerLot: 11, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 0.9014, volatility: 0.4 },
  { symbol: "NZD/USD", name: "Kiwi / USD",             market: "forex", pipSize: 0.0001, pipValuePerLot: 10, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 0.6112, volatility: 0.5 },
  { symbol: "EUR/GBP", name: "Euro / Pound",           market: "forex", pipSize: 0.0001, pipValuePerLot: 12, contractSize: 100_000, decimals: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 0.8462, volatility: 0.4 },
  { symbol: "GBP/JPY", name: "Pound / Yen",            market: "forex", pipSize: 0.01,   pipValuePerLot: 9.5, contractSize: 100_000, decimals: 3, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 202.14, volatility: 0.7 },
  { symbol: "EUR/JPY", name: "Euro / Yen",             market: "forex", pipSize: 0.01,   pipValuePerLot: 9.5, contractSize: 100_000, decimals: 3, minLot: 0.01, maxLot: 100, lotStep: 0.01, refPrice: 170.88, volatility: 0.6 },

  // Metals
  { symbol: "XAU/USD", name: "Gold",   market: "metals", pipSize: 0.1,  pipValuePerLot: 10, contractSize: 100, decimals: 2, minLot: 0.01, maxLot: 50, lotStep: 0.01, refPrice: 2432.1, volatility: 0.8 },
  { symbol: "XAG/USD", name: "Silver", market: "metals", pipSize: 0.01, pipValuePerLot: 50, contractSize: 5000, decimals: 3, minLot: 0.01, maxLot: 50, lotStep: 0.01, refPrice: 28.42, volatility: 1.2 },

  // Indices (CFD units)
  { symbol: "SPX500", name: "S&P 500",     market: "indices", pipSize: 0.1, pipValuePerLot: 10, contractSize: 100, decimals: 2, minLot: 0.1, maxLot: 100, lotStep: 0.1, refPrice: 5628.1, volatility: 0.6 },
  { symbol: "NAS100", name: "Nasdaq 100",  market: "indices", pipSize: 0.1, pipValuePerLot: 10, contractSize: 100, decimals: 2, minLot: 0.1, maxLot: 100, lotStep: 0.1, refPrice: 19910, volatility: 0.8 },
  { symbol: "US30",   name: "Dow Jones",   market: "indices", pipSize: 1,   pipValuePerLot: 10, contractSize: 10,  decimals: 1, minLot: 0.1, maxLot: 100, lotStep: 0.1, refPrice: 40180, volatility: 0.5 },
  { symbol: "GER40",  name: "DAX 40",      market: "indices", pipSize: 1,   pipValuePerLot: 10, contractSize: 10,  decimals: 1, minLot: 0.1, maxLot: 100, lotStep: 0.1, refPrice: 18420, volatility: 0.7 },
  { symbol: "UK100",  name: "FTSE 100",    market: "indices", pipSize: 1,   pipValuePerLot: 10, contractSize: 10,  decimals: 1, minLot: 0.1, maxLot: 100, lotStep: 0.1, refPrice: 8210,  volatility: 0.5 },
  { symbol: "JP225",  name: "Nikkei 225",  market: "indices", pipSize: 1,   pipValuePerLot: 10, contractSize: 10,  decimals: 1, minLot: 0.1, maxLot: 100, lotStep: 0.1, refPrice: 41240, volatility: 0.7 },

  // Crypto
  { symbol: "BTC/USDT", name: "Bitcoin",  market: "crypto", pipSize: 1,     pipValuePerLot: 1,   contractSize: 1, decimals: 1, minLot: 0.001, maxLot: 100, lotStep: 0.001, refPrice: 67550, volatility: 2.5 },
  { symbol: "ETH/USDT", name: "Ethereum", market: "crypto", pipSize: 0.1,   pipValuePerLot: 0.1, contractSize: 1, decimals: 2, minLot: 0.01,  maxLot: 500, lotStep: 0.01,  refPrice: 3418.5, volatility: 3 },
  { symbol: "SOL/USDT", name: "Solana",   market: "crypto", pipSize: 0.01,  pipValuePerLot: 0.01,contractSize: 1, decimals: 3, minLot: 0.1,   maxLot: 5000, lotStep: 0.1,  refPrice: 178.9, volatility: 4 },
  { symbol: "BNB/USDT", name: "Binance Coin", market: "crypto", pipSize: 0.1, pipValuePerLot: 0.1, contractSize: 1, decimals: 2, minLot: 0.01, maxLot: 500, lotStep: 0.01, refPrice: 612.4, volatility: 3 },
  { symbol: "XRP/USDT", name: "Ripple",   market: "crypto", pipSize: 0.0001, pipValuePerLot: 0.0001, contractSize: 1, decimals: 4, minLot: 1, maxLot: 100000, lotStep: 1, refPrice: 0.548, volatility: 4 },
  { symbol: "ADA/USDT", name: "Cardano",  market: "crypto", pipSize: 0.0001, pipValuePerLot: 0.0001, contractSize: 1, decimals: 4, minLot: 1, maxLot: 100000, lotStep: 1, refPrice: 0.412, volatility: 4 },

  // Stocks
  { symbol: "AAPL",  name: "Apple",     market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 228.4, volatility: 1.5 },
  { symbol: "MSFT",  name: "Microsoft", market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 442.1, volatility: 1.4 },
  { symbol: "TSLA",  name: "Tesla",     market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 248.9, volatility: 3 },
  { symbol: "NVDA",  name: "NVIDIA",    market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 132.4, volatility: 2.5 },
  { symbol: "META",  name: "Meta",      market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 512.8, volatility: 2 },
  { symbol: "AMZN",  name: "Amazon",    market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 186.5, volatility: 1.8 },
  { symbol: "GOOGL", name: "Alphabet",  market: "stocks", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 178.2, volatility: 1.6 },

  // Futures (CFD-style)
  { symbol: "ES",  name: "E-mini S&P 500", market: "futures", pipSize: 0.25, pipValuePerLot: 12.5, contractSize: 50, decimals: 2, minLot: 1, maxLot: 100, lotStep: 1, refPrice: 5628.5, volatility: 0.7 },
  { symbol: "NQ",  name: "E-mini Nasdaq",  market: "futures", pipSize: 0.25, pipValuePerLot: 5,    contractSize: 20, decimals: 2, minLot: 1, maxLot: 100, lotStep: 1, refPrice: 19912.5, volatility: 0.9 },
  { symbol: "CL",  name: "Crude Oil",      market: "futures", pipSize: 0.01, pipValuePerLot: 10,   contractSize: 1000, decimals: 2, minLot: 1, maxLot: 100, lotStep: 1, refPrice: 82.4, volatility: 1.5 },
  { symbol: "GC",  name: "Gold Futures",   market: "futures", pipSize: 0.1,  pipValuePerLot: 10,   contractSize: 100, decimals: 2, minLot: 1, maxLot: 100, lotStep: 1, refPrice: 2432.1, volatility: 0.8 },
];

export const SYMBOL_BY_KEY: Record<string, SymbolMeta> = Object.fromEntries(
  SYMBOL_CATALOG.map((s) => [s.symbol, s]),
);

export function findSymbol(symbol: string): SymbolMeta | undefined {
  return SYMBOL_BY_KEY[symbol];
}

export function symbolsByMarket(market: PaperMarket): SymbolMeta[] {
  return SYMBOL_CATALOG.filter((s) => s.market === market);
}

export const MARKET_TABS: { value: PaperMarket; label: string }[] = [
  { value: "forex", label: "Forex" },
  { value: "crypto", label: "Crypto" },
  { value: "stocks", label: "Stocks" },
  { value: "indices", label: "Indices" },
  { value: "futures", label: "Futures" },
  { value: "metals", label: "Metals" },
];

export const DEFAULT_MARKET: PaperMarket = "forex";

export const COMMON_TAGS = [
  "Breakout","Pullback","Liquidity Sweep","SMC","ICT","VWAP",
  "Scalp","Swing","News","Momentum","Trend","Reversal",
];
