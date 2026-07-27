import { useEffect, useId, useState } from "react";
import { marketData } from "./engine";
import { getProvider } from "./providers/registry";
import { twelveDataCandles } from "./twelvedata.functions";
import type { Candle, MarketKind, Quote, Timeframe } from "./types";

export function useLiveQuote(symbol: string | null | undefined, market?: MarketKind) {
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    if (!symbol) return;
    marketData.init();
    const sub = marketData.subscribe(symbol, setQuote, market);
    return () => sub.unsubscribe();
  }, [symbol, market]);
  return quote;
}

export function useCandles(symbol: string | null | undefined, timeframe: Timeframe, opts?: { from?: number; to?: number; limit?: number; market?: MarketKind }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    marketData.init();
    const to = opts?.to ?? Date.now();
    const from = opts?.from ?? to - 1000 * 60 * 60 * 24 * 60;
    marketData.getCandles({ symbol, timeframe, from, to, limit: opts?.limit }, opts?.market)
      .then((rows) => { if (!cancelled) setCandles(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeframe, opts?.from, opts?.to, opts?.limit, opts?.market]);
  return { candles, loading };
}

export function useMarketStatus(market: MarketKind) {
  const [status, setStatus] = useState<string>("closed");
  useEffect(() => {
    marketData.init();
    let cancelled = false;
    const tick = () => marketData.getMarketStatus(market).then((s) => { if (!cancelled) setStatus(s.status); });
    tick();
    const t = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [market]);
  return status;
}

/**
 * Register a poll cadence with the Twelve Data provider. Mount this once per
 * screen (dashboard, watchlist, workspace) and the central poller will tune
 * itself to the fastest requested cadence. Automatically pauses when the
 * browser tab is hidden.
 *
 *   useMarketCadence("workspace")   // 7s  — active trading
 *   useMarketCadence("watchlist")   // 20s
 *   useMarketCadence("dashboard")   // 30s
 */
export function useMarketCadence(tier: "workspace" | "watchlist" | "dashboard" | "idle") {
  const id = useId();
  useEffect(() => {
    marketData.init();
    const p = getProvider("twelvedata") as any;
    if (!p || typeof p.requestCadence !== "function") return;
    const ms = tier === "workspace" ? 7_000
             : tier === "watchlist" ? 20_000
             : tier === "dashboard" ? 30_000
             : 60_000;
    return p.requestCadence(`${tier}:${id}`, ms);
  }, [tier, id]);
}

/**
 * Preload historical candles for a Replay session before opening the workspace.
 * Returns `{ ready, progress, error }`. If the window is already in cache the
 * promise resolves near-instantly.
 */
export function usePreloadReplay(
  symbol: string | null,
  timeframe: Timeframe,
  from: number | null,
  to: number | null,
) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!symbol || !from || !to) return;
    let cancelled = false;
    setReady(false); setProgress(0.1); setError(null);
    (async () => {
      try {
        const res = (await twelveDataCandles({
          data: { symbol, timeframe, from, to, buffer: true },
        })) as any;
        if (cancelled) return;
        if (res?.error) { setError(res.error); return; }
        setProgress(1);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe, from, to]);
  return { ready, progress, error };
}
