// Deterministic-per-tick mock price feed. Every subscriber gets the same
// evolving price using a hash-of-symbol + wall-clock jitter. Swap this out
// for a real WS feed later without touching consumers.
import { useEffect, useState } from "react";
import { SYMBOL_BY_KEY, type SymbolMeta } from "./symbols";

type Quote = { symbol: string; price: number; change: number };

const listeners = new Set<(quotes: Record<string, Quote>) => void>();
let quotes: Record<string, Quote> = {};
let interval: ReturnType<typeof setInterval> | null = null;

function seed(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function nextPrice(sym: SymbolMeta, prev: number, t: number): number {
  // Sinusoidal + noise, capped drift ~ volatility bps per tick.
  const s = seed(sym.symbol);
  const wave = Math.sin(t / (5000 + (s % 4000))) * sym.pipSize * 20;
  const noise = (Math.sin(t / 137 + s) + Math.cos(t / 89 + s)) * sym.pipSize * 5;
  const drift = (wave + noise) * (sym.volatility / 100);
  const next = prev + drift;
  const p = Math.pow(10, sym.decimals);
  return Math.round(next * p) / p;
}

function tick() {
  const t = Date.now();
  const updated: Record<string, Quote> = {};
  for (const sym of Object.values(SYMBOL_BY_KEY)) {
    const prev = quotes[sym.symbol]?.price ?? sym.refPrice;
    const price = nextPrice(sym, prev, t);
    const base = sym.refPrice;
    updated[sym.symbol] = {
      symbol: sym.symbol,
      price,
      change: base ? ((price - base) / base) * 100 : 0,
    };
  }
  quotes = updated;
  listeners.forEach((l) => l(quotes));
}

function ensureRunning() {
  if (interval) return;
  tick();
  interval = setInterval(tick, 1500);
}

export function currentPrice(symbol: string): number {
  ensureRunning();
  return quotes[symbol]?.price ?? SYMBOL_BY_KEY[symbol]?.refPrice ?? 0;
}

export function useLiveQuotes(): Record<string, Quote> {
  const [snap, setSnap] = useState<Record<string, Quote>>(quotes);
  useEffect(() => {
    ensureRunning();
    setSnap(quotes);
    const l = (q: Record<string, Quote>) => setSnap({ ...q });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snap;
}

export function useLivePrice(symbol: string | null): number | null {
  const q = useLiveQuotes();
  if (!symbol) return null;
  return q[symbol]?.price ?? null;
}
