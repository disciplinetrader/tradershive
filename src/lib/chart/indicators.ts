/**
 * Vectorised indicator calculations. Pure functions — safe to memoize.
 * Each function accepts arrays aligned with the source candles.
 */
import type { Candle } from "@/lib/market-data/types";

export function sma(values: number[], length: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(values: number[], length: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (length + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], length = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= length) {
      avgGain += gain / length;
      avgLoss += loss / length;
    } else {
      avgGain = (avgGain * (length - 1) + gain) / length;
      avgLoss = (avgLoss * (length - 1) + loss) / length;
    }
    if (i >= length) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export function atr(candles: Candle[], length = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(!p ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return ema(trs, length);
}

export function bollinger(values: number[], length = 20, stddev = 2) {
  const mid = sma(values, length);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);
  for (let i = length - 1; i < values.length; i++) {
    let sq = 0;
    for (let j = i - length + 1; j <= i; j++) sq += (values[j] - mid[i]) ** 2;
    const s = Math.sqrt(sq / length);
    upper[i] = mid[i] + stddev * s;
    lower[i] = mid[i] - stddev * s;
  }
  return { mid, upper, lower };
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  const sig = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - sig[i]);
  return { macdLine, signal: sig, hist };
}

export function vwap(candles: Candle[]): number[] {
  const out: number[] = [];
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * (c.volume ?? 0);
    cumV += c.volume ?? 0;
    out.push(cumV > 0 ? cumPV / cumV : tp);
  }
  return out;
}

export function donchian(candles: Candle[], length = 20) {
  const upper: number[] = [], lower: number[] = [], mid: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < length - 1) { upper.push(NaN); lower.push(NaN); mid.push(NaN); continue; }
    let hi = -Infinity, lo = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    upper.push(hi); lower.push(lo); mid.push((hi + lo) / 2);
  }
  return { upper, lower, mid };
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    out.push({ time: c.time, open, high, low, close, volume: c.volume });
  }
  return out;
}
