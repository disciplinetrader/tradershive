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
  /**
   * Order-of-magnitude reference ONLY. Never display this, never trade on it.
   *
   * These are static values from when the catalog was authored — gold's 2432
   * against a ~4355 market, EUR/USD's 1.0891 against ~1.155. They were once
   * used as a "price not loaded yet" fallback, which put a 2024 gold price on
   * the live BUY button and into `exit_price` on close. A price is either a
   * real quote or absent; see `live-quotes.ts`.
   *
   * Legitimate remaining use: rejecting typos in manual journal entry, where
   * only the magnitude matters (`journal/instruments.ts`).
   */
  refPrice: number;
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

  // Indices — traded as US-listed ETF proxies, priced in shares.
  //
  // The official index values (SPX, NDX, DJI) are separately licensed and are
  // NOT on our Twelve Data plan: `/quote` and `/time_series` both answer
  // 404 "available starting with the Grow or Venture plan". Finnhub's free
  // tier refuses them too ("Market data subscription required for CFD
  // indices") and serves no candles at all. Measured 2026-08-14.
  //
  // So these are the ETFs themselves, named as the ETFs they are: the price
  // shown IS the price traded, with no proxy arithmetic in between. The
  // `SPX500` / `NAS100` / `US30` tickers are deliberately left unclaimed so a
  // real index feed can take them later without renaming anything.
  //
  // Consequence worth knowing: ETFs trade US regular hours only, so a
  // position held overnight gaps at the open instead of ticking through.
  { symbol: "SPY", name: "S&P 500 ETF",     market: "indices", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 777.88, volatility: 0.9 },
  { symbol: "QQQ", name: "Nasdaq 100 ETF",  market: "indices", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 732.07, volatility: 1.2 },
  { symbol: "DIA", name: "Dow 30 ETF",      market: "indices", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 537.91, volatility: 0.8 },
  { symbol: "IWM", name: "Russell 2000 ETF", market: "indices", pipSize: 0.01, pipValuePerLot: 0.01, contractSize: 1, decimals: 2, minLot: 1, maxLot: 10000, lotStep: 1, refPrice: 303.50, volatility: 1.3 },

  // Crypto
  // 2 decimals, not 1: Binance's BTCUSDT tick size is 0.01, so a 1-decimal
  // display rounds away a real price increment and disagrees with the chart.
  { symbol: "BTC/USDT", name: "Bitcoin",  market: "crypto", pipSize: 1,     pipValuePerLot: 1,   contractSize: 1, decimals: 2, minLot: 0.001, maxLot: 100, lotStep: 0.001, refPrice: 67550, volatility: 2.5 },
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

/** `EUR/USD`, `EURUSD`, `eur-usd` and `EUR_USD` all name the same instrument. */
function normaliseSymbol(s: string): string {
  return s.toUpperCase().replace(/[/\-_:\s]/g, "");
}

const SYMBOL_BY_NORMALISED = new Map(
  SYMBOL_CATALOG.map((s) => [normaliseSymbol(s.symbol), s]),
);

/**
 * Exact key first, then separator/case-insensitive.
 *
 * This was an exact lookup into `SYMBOL_BY_KEY`, so a symbol that arrived
 * without its slash — which is how the market-data providers, the chart engine
 * and several stored rows spell it — found nothing. Callers almost all read
 * `findSymbol(x)?.decimals ?? 2`, so a miss did not fail loudly: it quietly
 * rendered EUR/USD at 2 decimals while the surface next to it, which happened
 * to hold the slashed form, rendered 5. That is the inconsistency where the
 * same price reads 1.15253 in one panel and 1.15 in another.
 */
export function findSymbol(symbol: string): SymbolMeta | undefined {
  if (!symbol) return undefined;
  return SYMBOL_BY_KEY[symbol] ?? SYMBOL_BY_NORMALISED.get(normaliseSymbol(symbol));
}

/**
 * Decimal places for a price, per instrument.
 *
 * Forex majors are 5 (the 5th digit is the fractional pip), JPY pairs 3, and
 * everything else follows its catalog entry. The fallback is deliberately NOT
 * a flat 2: an unknown FX pair rendered at 2 decimals loses the pip entirely,
 * which is worse than an approximate guess from the shape of the symbol.
 */
const FIAT = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK",
  "SGD", "HKD", "CNH", "CNY", "MXN", "ZAR", "TRY", "PLN", "HUF", "CZK", "INR",
  "KRW", "THB", "ILS",
]);

/** Crypto bases that trade well above $1 — cent precision, like an equity. */
const CRYPTO_MAJOR = /^(BTC|ETH|BNB|SOL|LTC|AVAX|LINK|DOT|ATOM|APT|NEAR|FIL|ICP|SUI|TON|ARB|OP|AAVE|MKR|XMR|BCH|ETC)/;
/** Crypto bases that trade below ~$1 — sub-cent precision or they collapse to 0.00. */
const CRYPTO_SMALL = /^(XRP|ADA|DOGE|SHIB|TRX|MATIC|XLM|VET|ALGO|HBAR|SAND|MANA|GALA|PEPE)/;

export function priceDecimals(symbol: string | SymbolMeta | null | undefined): number {
  if (!symbol) return 2;
  const meta = typeof symbol === "string" ? findSymbol(symbol) : symbol;
  if (meta) return meta.decimals;

  // Unlisted symbol — infer from its shape. Getting this wrong is not cosmetic:
  // it is how `BTCUSD` came out at 5 decimals. The old rule was "six letters ⇒
  // forex", which is true of EURUSD and equally true of BTCUSD and ETHUSD, so
  // every slash-less crypto pair was quoted with a fractional pip it does not
  // have. Require BOTH halves to be real currencies before calling it forex.
  const s = normaliseSymbol(String(symbol));
  const base = s.slice(0, 3);
  const quote = s.slice(3, 6);

  if (s.length === 6 && FIAT.has(base) && FIAT.has(quote)) {
    return quote === "JPY" ? 3 : 5;               // 147.523 / 1.15204
  }
  if (/^X(AU|AG|PT|PD)/.test(s)) return quote === "JPY" ? 2 : 2;   // metals
  if (CRYPTO_SMALL.test(s)) return 4;             // 0.5482
  if (CRYPTO_MAJOR.test(s)) return 2;             // 62979.62
  return 2;
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
