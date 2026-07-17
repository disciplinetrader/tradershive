// Paper Trading price feed.
//
// Every symbol is subscribed to the central Market Data Engine so quotes flow
// from the active provider (Binance for crypto, OANDA for forex, Mock as
// fallback). A deterministic local ticker keeps the UI moving even when no
// provider is connected yet (e.g. first paint, offline dev).
import { useEffect, useState } from "react";
import { SYMBOL_BY_KEY, type SymbolMeta } from "./symbols";
import { marketData } from "@/lib/market-data/engine";
import type { SubscriptionHandle } from "@/lib/market-data/types";

type Quote = { symbol: string; price: number; change: number };

// Map paper symbols ("EUR/USD", "BTC/USDT") → engine symbols ("EURUSD", "BTCUSDT").
function engineSymbol(sym: string): string {
  return sym.replace(/\//g, "");
}

const engineSubs = new Map<string, SubscriptionHandle>();
let engineBooted = false;

function ensureEngineSubscriptions() {
  if (engineBooted) return;
  engineBooted = true;
  try {
    marketData.init();
    for (const sym of Object.values(SYMBOL_BY_KEY)) {
      const eSym = engineSymbol(sym.symbol);
      const handle = marketData.subscribe(eSym, (q) => {
        const base = sym.refPrice;
        const price = q.last ?? q.bid ?? base;
        quotes[sym.symbol] = {
          symbol: sym.symbol,
          price,
          change: base ? ((price - base) / base) * 100 : 0,
        };
        listeners.forEach((l) => l(quotes));
      }, sym.market);
      engineSubs.set(sym.symbol, handle);
    }
  } catch { /* engine unavailable — local ticker keeps UI alive */ }
}

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
