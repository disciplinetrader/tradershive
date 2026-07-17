// Market Data Provider abstraction.
// This layer separates the Replay Engine from any specific data source.
// Today we use a deterministic synthetic provider; tomorrow this can be
// swapped for TradingView, broker historical APIs, tick feeds, or DOM data
// without touching the engine, controller or UI.

import { TIMEFRAME_SECONDS } from "./constants";
import type { Candle, Timeframe } from "./types";

export type CandleQuery = {
  symbol: string;
  timeframe: Timeframe;
  from: number; // epoch ms
  to: number; // epoch ms
};

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  getCandles(query: CandleQuery): Promise<Candle[]>;
}

// Deterministic seeded RNG so a given (symbol, tf, date) always produces the
// same series — critical for reproducible replay sessions.
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
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

function basePriceFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("BTC")) return 60000;
  if (s.includes("ETH")) return 3200;
  if (s.includes("SOL")) return 170;
  if (s.includes("XAU")) return 2400;
  if (s.includes("XAG")) return 28;
  if (s.includes("JPY")) return 155;
  if (s.includes("NAS")) return 19500;
  if (s.includes("SPX")) return 5500;
  if (s.includes("US30")) return 40000;
  if (s.startsWith("EUR/") || s.startsWith("GBP/") || s.startsWith("AUD/") || s.startsWith("USD/")) return 1.1;
  return 100;
}

function volatilityFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("BTC") || s.includes("ETH") || s.includes("SOL")) return 0.012;
  if (s.includes("JPY")) return 0.0015;
  if (s.includes("XAU")) return 0.004;
  if (s.startsWith("EUR/") || s.startsWith("GBP/") || s.startsWith("USD/") || s.startsWith("AUD/")) return 0.0008;
  return 0.006;
}

export class SyntheticMarketDataProvider implements MarketDataProvider {
  readonly id = "synthetic";
  readonly label = "Synthetic (deterministic)";

  async getCandles({ symbol, timeframe, from, to }: CandleQuery): Promise<Candle[]> {
    const stepSec = TIMEFRAME_SECONDS[timeframe];
    const stepMs = stepSec * 1000;
    const fromAligned = Math.floor(from / stepMs) * stepMs;
    const count = Math.max(1, Math.min(4000, Math.ceil((to - fromAligned) / stepMs)));
    const seed = hash(`${symbol}|${timeframe}|${new Date(fromAligned).toISOString().slice(0, 10)}`);
    const rand = mulberry32(seed);

    const base = basePriceFor(symbol);
    const vol = volatilityFor(symbol) * Math.sqrt(stepSec / 60);
    const candles: Candle[] = [];
    let last = base * (0.98 + rand() * 0.04);

    for (let i = 0; i < count; i++) {
      const time = fromAligned + i * stepMs;
      // Trend regime: slowly drifting bias
      const bias = Math.sin(i / 40 + seed % 7) * vol * 0.3;
      const change = (rand() - 0.5) * vol * 2 + bias;
      const open = last;
      const close = Math.max(0.00001, open * (1 + change));
      const range = Math.abs(open - close) + Math.abs(vol * open * (0.4 + rand()));
      const high = Math.max(open, close) + range * rand() * 0.6;
      const low = Math.min(open, close) - range * rand() * 0.6;
      const volume = Math.floor(500 + rand() * 4500);
      candles.push({ time, open, high, low, close: Math.max(0.00001, close), volume });
      last = close;
    }
    return candles;
  }
}

// Provider registry — pluggable per session.settings.provider.
const providers: Record<string, MarketDataProvider> = {
  synthetic: new SyntheticMarketDataProvider(),
};

export function getProvider(id?: string | null): MarketDataProvider {
  return providers[id ?? "synthetic"] ?? providers.synthetic;
}

export function registerProvider(p: MarketDataProvider) {
  providers[p.id] = p;
}
