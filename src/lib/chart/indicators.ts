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

/** Trading-session bands. Standard forex UTC windows (non-DST baseline):
 *  Tokyo/Asia 00:00-09:00, London 08:00-17:00, New York 13:00-22:00. */
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
    if (h >= 0 && h < 9) {
      if (day !== asiaDay) { asiaOpen = candles[i].open; asiaDay = day; }
      asia[i] = asiaOpen;
    }
    if (h >= 8 && h < 17) {
      if (day !== londonDay) { londonOpen = candles[i].open; londonDay = day; }
      london[i] = londonOpen;
    }
    if (h >= 13 && h < 22) {
      if (day !== nyDay) { nyOpen = candles[i].open; nyDay = day; }
      ny[i] = nyOpen;
    }
  }
  return { asia, london, ny };
}

export type SmcMarker = {
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown" | "circle";
  color: string;
  text?: string;
};
export type SmcBox = {
  time: number;
  endTime: number;
  top: number;
  bottom: number;
  kind: "fvg_bull" | "fvg_bear" | "ob_bull" | "ob_bear";
};

/** Smart Money Concepts (SMC/ICT) — swing pivots, BOS/CHoCH breaks,
 *  Fair-Value-Gaps and Order Blocks. */
export function smc(candles: Candle[], pivot = 3) {
  const n = candles.length;
  const swingHigh: number[] = new Array(n).fill(NaN);
  const swingLow: number[] = new Array(n).fill(NaN);
  const bos: number[] = new Array(n).fill(NaN);
  const markers: SmcMarker[] = [];
  const boxes: SmcBox[] = [];
  if (n < pivot * 2 + 2) return { swing_high: swingHigh, swing_low: swingLow, bos, markers, boxes };

  const highs: Array<{ idx: number; price: number }> = [];
  const lows: Array<{ idx: number; price: number }> = [];
  for (let i = pivot; i < n - pivot; i++) {
    let hi = true, lo = true;
    for (let j = i - pivot; j <= i + pivot; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) hi = false;
      if (candles[j].low <= candles[i].low) lo = false;
    }
    if (hi) {
      highs.push({ idx: i, price: candles[i].high });
      markers.push({ time: candles[i].time, position: "aboveBar", shape: "circle", color: "#22c55e", text: "SH" });
    }
    if (lo) {
      lows.push({ idx: i, price: candles[i].low });
      markers.push({ time: candles[i].time, position: "belowBar", shape: "circle", color: "#ef4444", text: "SL" });
    }
  }

  const lastHi = highs[highs.length - 1];
  const lastLo = lows[lows.length - 1];
  if (lastHi) for (let i = lastHi.idx; i < n; i++) swingHigh[i] = lastHi.price;
  if (lastLo) for (let i = lastLo.idx; i < n; i++) swingLow[i] = lastLo.price;

  // BOS / CHoCH detection with trend memory.
  let trend: "up" | "down" | null = null;
  const bosBreaks: Array<{ idx: number; price: number; kind: "BOS" | "CHoCH"; dir: "up" | "down" }> = [];
  for (let i = pivot + 1; i < n; i++) {
    const priorHi = highs.filter((h) => h.idx < i - pivot).pop();
    const priorLo = lows.filter((l) => l.idx < i - pivot).pop();
    if (priorHi && candles[i].close > priorHi.price) {
      const kind = trend === "down" ? "CHoCH" : "BOS";
      bosBreaks.push({ idx: i, price: priorHi.price, kind, dir: "up" });
      trend = "up";
    } else if (priorLo && candles[i].close < priorLo.price) {
      const kind = trend === "up" ? "CHoCH" : "BOS";
      bosBreaks.push({ idx: i, price: priorLo.price, kind, dir: "down" });
      trend = "down";
    }
  }
  const lastBreak = bosBreaks[bosBreaks.length - 1];
  if (lastBreak) {
    for (let j = lastBreak.idx; j < n; j++) bos[j] = lastBreak.price;
    for (const b of bosBreaks.slice(-4)) {
      markers.push({
        time: candles[b.idx].time,
        position: b.dir === "up" ? "belowBar" : "aboveBar",
        shape: b.dir === "up" ? "arrowUp" : "arrowDown",
        color: b.kind === "CHoCH" ? "#f59e0b" : "#60a5fa",
        text: b.kind,
      });
    }
  }

  // FVG: 3-bar imbalance, rendered as rectangles projected forward.
  const projectBars = 20;
  const dt = n > 1 ? candles[1].time - candles[0].time : 60_000;
  for (let i = 2; i < n; i++) {
    const a = candles[i - 2], c = candles[i];
    if (a.high < c.low) {
      boxes.push({ time: a.time, endTime: c.time + dt * projectBars, top: c.low, bottom: a.high, kind: "fvg_bull" });
    } else if (a.low > c.high) {
      boxes.push({ time: a.time, endTime: c.time + dt * projectBars, top: a.low, bottom: c.high, kind: "fvg_bear" });
    }
  }

  // Order blocks: last opposite-color candle before each BOS/CHoCH break.
  for (const b of bosBreaks.slice(-3)) {
    for (let k = b.idx - 1; k >= Math.max(0, b.idx - 20); k--) {
      const cd = candles[k];
      const bullish = cd.close > cd.open;
      const bearish = cd.close < cd.open;
      if (b.dir === "up" && bearish) {
        boxes.push({ time: cd.time, endTime: candles[Math.min(n - 1, b.idx + projectBars)].time, top: cd.high, bottom: cd.low, kind: "ob_bull" });
        break;
      }
      if (b.dir === "down" && bullish) {
        boxes.push({ time: cd.time, endTime: candles[Math.min(n - 1, b.idx + projectBars)].time, top: cd.high, bottom: cd.low, kind: "ob_bear" });
        break;
      }
    }
  }

  const fvgs = boxes.filter((b) => b.kind.startsWith("fvg")).slice(-6);
  const obs = boxes.filter((b) => b.kind.startsWith("ob"));
  return { swing_high: swingHigh, swing_low: swingLow, bos, markers, boxes: [...fvgs, ...obs] };
}

