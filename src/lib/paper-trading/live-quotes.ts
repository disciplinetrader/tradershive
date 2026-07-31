// Paper Trading price feed.
//
// Ref-counted, lazy per-symbol subscriptions to the Market Data Engine. A
// symbol is only subscribed when a mounted component actually needs it, and
// unsubscribed as soon as the last consumer unmounts. This keeps forex
// polling (Twelve Data) off screens that don't render live quotes.

import { useEffect, useMemo, useState } from "react";
import { SYMBOL_BY_KEY } from "./symbols";
import { marketData } from "@/lib/market-data/engine";
import type { SubscriptionHandle } from "@/lib/market-data/types";

type Quote = { symbol: string; price: number; change: number };

/**
 * Canonical engine symbol for a Paper Trading symbol key. Chart, watchlist and
 * quote subscriptions MUST all go through this so they resolve to the same
 * provider assignment.
 */
export function engineSymbol(sym: string): string {
  return sym.replace(/\//g, "");
}

const listeners = new Set<(quotes: Record<string, Quote>) => void>();
let quotes: Record<string, Quote> = {};

// Ref-counted subs so multiple components asking for the same symbol share
// one upstream subscription.
const subs = new Map<string, { handle: SubscriptionHandle; refs: number }>();

function acquire(symbol: string) {
  const meta = SYMBOL_BY_KEY[symbol];
  if (!meta) return;
  const existing = subs.get(symbol);
  if (existing) { existing.refs += 1; return; }
  try {
    marketData.init();
    const handle = marketData.subscribe(engineSymbol(meta.symbol), (q) => {
      const base = meta.refPrice;
      const price = q.last ?? q.bid ?? base;
      quotes = {
        ...quotes,
        [meta.symbol]: {
          symbol: meta.symbol,
          price,
          change: base ? ((price - base) / base) * 100 : 0,
        },
      };
      listeners.forEach((l) => l(quotes));
    }, meta.market);
    subs.set(symbol, { handle, refs: 1 });
  } catch { /* engine unavailable — UI falls back to last known / refPrice */ }
}

function release(symbol: string) {
  const entry = subs.get(symbol);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    try { entry.handle.unsubscribe(); } catch { /* noop */ }
    subs.delete(symbol);
  }
}

export function currentPrice(symbol: string): number {
  // Read-only snapshot. Does not open a new subscription; a component that
  // needs live updates should use useLivePrice / useLiveQuotes(symbols).
  return quotes[symbol]?.price ?? SYMBOL_BY_KEY[symbol]?.refPrice ?? 0;
}

/**
 * Subscribe to live quotes for a specific set of symbols. Passing an empty
 * array (or omitting) creates no subscriptions and returns the current
 * snapshot — callers that need live prices MUST pass the symbols they
 * actually display so the poller does not fetch symbols nobody is watching.
 */
export function useLiveQuotes(symbols?: readonly (string | null | undefined)[]): Record<string, Quote> {
  const key = useMemo(() => {
    if (!symbols) return "";
    const cleaned = symbols.filter((s): s is string => !!s);
    cleaned.sort();
    return cleaned.join("|");
  }, [symbols?.length, symbols ? symbols.join("|") : ""]);
  const list = useMemo(() => (key ? key.split("|") : []), [key]);
  const [snap, setSnap] = useState<Record<string, Quote>>(quotes);
  useEffect(() => {
    for (const s of list) acquire(s);
    setSnap(quotes);
    const l = (q: Record<string, Quote>) => setSnap(q);
    listeners.add(l);
    return () => {
      listeners.delete(l);
      for (const s of list) release(s);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return snap;
}

export function useLivePrice(symbol: string | null): number | null {
  const list = useMemo(() => (symbol ? [symbol] : []), [symbol]);
  const q = useLiveQuotes(list);
  if (!symbol) return null;
  return q[symbol]?.price ?? null;
}
