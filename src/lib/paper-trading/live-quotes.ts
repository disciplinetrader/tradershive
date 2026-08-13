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

/** Snapshot poller per symbol, used until/while the streaming feed is silent. */
const snapshots = new Map<string, ReturnType<typeof setInterval>>();

/** How long the real feed must be silent before the fallback snapshot fires. */
const SNAPSHOT_QUIET_MS = 60_000;
/** Floor between two fallback pulls for the same symbol. */
const SNAPSHOT_MIN_GAP_MS = 60_000;
/** How often we re-check whether the feed has gone quiet. */
const SNAPSHOT_TICK_MS = 20_000;

function publish(meta: { symbol: string; refPrice: number }, price: number) {
  if (!Number.isFinite(price) || price <= 0) return;
  const base = meta.refPrice;
  quotes = {
    ...quotes,
    [meta.symbol]: { symbol: meta.symbol, price, change: base ? ((price - base) / base) * 100 : 0 },
  };
  listeners.forEach((l) => l(quotes));
}

function acquire(symbol: string) {
  const meta = SYMBOL_BY_KEY[symbol];
  if (!meta) return;
  const existing = subs.get(symbol);
  if (existing) { existing.refs += 1; return; }
  try {
    marketData.init();
    let lastTickAt = 0;
    const handle = marketData.subscribe(engineSymbol(meta.symbol), (q) => {
      lastTickAt = Date.now();
      publish(meta, q.last ?? q.bid ?? meta.refPrice);
    }, meta.market);
    subs.set(symbol, { handle, refs: 1 });

    // Streaming feeds drop (WS 1006, provider cooldown) and can stay silent
    // forever. Seed immediately from the REST snapshot and keep polling while
    // no tick has arrived, so the ticket never sits on "Waiting for price".
    // These are real provider quotes — never synthesised.
    //
    // This is a LAST RESORT, not a second feed. Each pull is an un-batched
    // one-symbol request; at the old 15s interval every open position spent 4
    // Twelve Data credits a minute on top of the provider's own batched
    // poller, which alone exceeded the free plan's 8 credits/min and left
    // forex/metals rate-limited into silence. Only fire when the real feed has
    // actually gone quiet.
    let lastPullAt = 0;
    const pull = () => {
      const now = Date.now();
      if (lastTickAt && now - lastTickAt < SNAPSHOT_QUIET_MS) return;
      if (lastPullAt && now - lastPullAt < SNAPSHOT_MIN_GAP_MS) return;
      lastPullAt = now;
      void marketData
        .getQuote(engineSymbol(meta.symbol), meta.market)
        .then((q) => publish(meta, (q as any).last ?? (q as any).bid ?? 0))
        .catch(() => { /* stay on the last real price */ });
    };
    pull();
    snapshots.set(symbol, setInterval(pull, SNAPSHOT_TICK_MS));
  } catch { /* engine unavailable — UI falls back to last known / refPrice */ }
}

function release(symbol: string) {
  const entry = subs.get(symbol);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    try { entry.handle.unsubscribe(); } catch { /* noop */ }
    subs.delete(symbol);
    const timer = snapshots.get(symbol);
    if (timer) { clearInterval(timer); snapshots.delete(symbol); }
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
