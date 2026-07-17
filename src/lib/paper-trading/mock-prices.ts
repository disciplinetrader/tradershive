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

export function currentPrice(symbol: string): number {
  ensureEngineSubscriptions();
  return quotes[symbol]?.price ?? SYMBOL_BY_KEY[symbol]?.refPrice ?? 0;
}

export function useLiveQuotes(): Record<string, Quote> {
  const [snap, setSnap] = useState<Record<string, Quote>>(quotes);
  useEffect(() => {
    ensureEngineSubscriptions();
    setSnap(quotes);
    const l = (q: Record<string, Quote>) => setSnap({ ...q });
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return snap;
}

export function useLivePrice(symbol: string | null): number | null {
  const q = useLiveQuotes();
  if (!symbol) return null;
  return q[symbol]?.price ?? null;
}

