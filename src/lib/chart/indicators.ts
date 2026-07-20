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

/* ============================================================
 * Advanced Indicators — SMC / Sessions / Fibonacci / S+R
 * All functions return arrays aligned with `candles`. Missing
 * values are NaN so the chart adapter can filter them out.
 * ============================================================ */

/** Fibonacci retracement of the last `length` bar swing (auto low↔high).
 *  Returns level-name → constant array across all bars (horizontal lines). */
export function fibonacci(candles: Candle[], length = 120) {
  const n = candles.length;
  const out: Record<string, number[]> = {
    "0.0": new Array(n).fill(NaN),
    "0.236": new Array(n).fill(NaN),
    "0.382": new Array(n).fill(NaN),
    "0.5": new Array(n).fill(NaN),
    "0.618": new Array(n).fill(NaN),
    "0.786": new Array(n).fill(NaN),
    "1.0": new Array(n).fill(NaN),
  };
  if (n < 2) return out;
  const from = Math.max(0, n - length);
  let hi = -Infinity, lo = Infinity, hiIdx = from, loIdx = from;
  for (let i = from; i < n; i++) {
    if (candles[i].high > hi) { hi = candles[i].high; hiIdx = i; }
    if (candles[i].low < lo) { lo = candles[i].low; loIdx = i; }
  }
  const up = hiIdx >= loIdx; // trend direction
  const start = up ? loIdx : hiIdx;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
  for (const lvl of levels) {
    const v = up ? lo + (hi - lo) * lvl : hi - (hi - lo) * lvl;
    for (let i = start; i < n; i++) out[String(lvl === 1 ? "1.0" : lvl === 0 ? "0.0" : lvl)][i] = v;
  }
  return out;
}

/** Pivot-based Support & Resistance — finds pivot highs/lows over
 *  `length` bars using a `left/right` fractal and projects each level
 *  forward as a horizontal segment until price breaks through. */
export function supportResistance(candles: Candle[], left = 5, right = 5, maxLevels = 6) {
  const n = candles.length;
  const resistance: number[] = new Array(n).fill(NaN);
  const support: number[] = new Array(n).fill(NaN);
  const pivots: Array<{ idx: number; price: number; kind: "R" | "S" }> = [];
  for (let i = left; i < n - right; i++) {
    let isHi = true, isLo = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHi = false;
      if (candles[j].low <= candles[i].low) isLo = false;
    }
    if (isHi) pivots.push({ idx: i, price: candles[i].high, kind: "R" });
    if (isLo) pivots.push({ idx: i, price: candles[i].low, kind: "S" });
  }
  // Keep the most recent `maxLevels` per side, project until broken.
  const recentR = pivots.filter((p) => p.kind === "R").slice(-maxLevels);
  const recentS = pivots.filter((p) => p.kind === "S").slice(-maxLevels);
  for (const p of recentR) {
    for (let i = p.idx; i < n; i++) {
      if (candles[i].close > p.price) break;
      resistance[i] = p.price;
    }
  }
  for (const p of recentS) {
    for (let i = p.idx; i < n; i++) {
      if (candles[i].close < p.price) break;
      support[i] = p.price;
    }
  }
  return { resistance, support };
}

/** Trading-session bands. For each bar we emit the session's open price
 *  (Asia / London / New York) so it draws as a stepped horizontal line
 *  that highlights the session's control price. UTC session windows:
 *  Asia 00-08, London 07-16, NY 12-21. */
export function sessions(candles: Candle[]) {
  const n = candles.length;
  const asia: number[] = new Array(n).fill(NaN);
  const london: number[] = new Array(n).fill(NaN);
  const ny: number[] = new Array(n).fill(NaN);
  let asiaOpen = NaN, londonOpen = NaN, nyOpen = NaN;
  let asiaDay = -1, londonDay = -1, nyDay = -1;
  for (let i = 0; i < n; i++) {
    const d = new Date(candles[i].time);
    const day = Math.floor(candles[i].time / 86_400_000);
    const h = d.getUTCHours();
    if (h >= 0 && h < 8) {
      if (day !== asiaDay) { asiaOpen = candles[i].open; asiaDay = day; }
      asia[i] = asiaOpen;
    }
    if (h >= 7 && h < 16) {
      if (day !== londonDay) { londonOpen = candles[i].open; londonDay = day; }
      london[i] = londonOpen;
    }
    if (h >= 12 && h < 21) {
      if (day !== nyDay) { nyOpen = candles[i].open; nyDay = day; }
      ny[i] = nyOpen;
    }
  }
  return { asia, london, ny };
}

/** Smart Money Concepts (SMC/ICT) — swing structure, BOS/CHoCH lines,
 *  and fair-value-gap midlines. Swing detection uses a `pivot` fractal.
 *  Emits four series:
 *    - swing_high / swing_low: horizontal levels projected forward
 *    - bos: break-of-structure — last broken swing level, projected forward
 *    - fvg: bullish/bearish fair-value-gap midpoint (3-bar imbalance) */
export function smc(candles: Candle[], pivot = 3) {
  const n = candles.length;
  const swingHigh: number[] = new Array(n).fill(NaN);
  const swingLow: number[] = new Array(n).fill(NaN);
  const bos: number[] = new Array(n).fill(NaN);
  const fvg: number[] = new Array(n).fill(NaN);
  const highs: Array<{ idx: number; price: number }> = [];
  const lows: Array<{ idx: number; price: number }> = [];
  for (let i = pivot; i < n - pivot; i++) {
    let hi = true, lo = true;
    for (let j = i - pivot; j <= i + pivot; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) hi = false;
      if (candles[j].low <= candles[i].low) lo = false;
    }
    if (hi) highs.push({ idx: i, price: candles[i].high });
    if (lo) lows.push({ idx: i, price: candles[i].low });
  }
  const lastHi = highs[highs.length - 1];
  const lastLo = lows[lows.length - 1];
  if (lastHi) for (let i = lastHi.idx; i < n; i++) swingHigh[i] = lastHi.price;
  if (lastLo) for (let i = lastLo.idx; i < n; i++) swingLow[i] = lastLo.price;
  // BOS: most recent close above prior swing high OR below prior swing low.
  for (let i = n - 1; i >= 1; i--) {
    const priorHi = highs.filter((h) => h.idx < i).pop();
    const priorLo = lows.filter((l) => l.idx < i).pop();
    if (priorHi && candles[i].close > priorHi.price) {
      for (let j = i; j < n; j++) bos[j] = priorHi.price;
      break;
    }
    if (priorLo && candles[i].close < priorLo.price) {
      for (let j = i; j < n; j++) bos[j] = priorLo.price;
      break;
    }
  }
  // FVG: 3-bar imbalance — gap between candle[i-2] and candle[i].
  for (let i = 2; i < n; i++) {
    const a = candles[i - 2], c = candles[i];
    if (a.high < c.low) fvg[i] = (a.high + c.low) / 2; // bullish FVG
    else if (a.low > c.high) fvg[i] = (a.low + c.high) / 2; // bearish FVG
  }
  return { swing_high: swingHigh, swing_low: swingLow, bos, fvg };
}

