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

export function useCandles(
  symbol: string | null | undefined,
  timeframe: Timeframe,
  opts?: { from?: number; to?: number; limit?: number; market?: MarketKind },
) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    marketData.init();
    const to = opts?.to ?? Date.now();
    const from = opts?.from ?? to - 1000 * 60 * 60 * 24 * 60;
    marketData.getCandles({ symbol, timeframe, from, to, limit: opts?.limit }, opts?.market)
      .then((rows) => {
        if (cancelled) return;
        setCandles(rows);
        // No fabrication: an empty response is an explicit unavailable state.
        if (!rows.length) setError("No candles returned for this symbol and timeframe.");
      })
      .catch((e) => { if (!cancelled) { setCandles([]); setError((e as Error).message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeframe, opts?.from, opts?.to, opts?.limit, opts?.market, nonce]);
  return { candles, loading, error, reload };
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
 * screen and the central poller tunes itself to the fastest requested cadence.
 * Automatically pauses when the browser tab is hidden. Pass `enabled=false`
 * to skip the registration entirely — e.g. when the current view only shows
 * crypto (Binance) so no forex/index poller is needed.
 *
 *   useMarketCadence("workspace")           // 12s — active trading
 *   useMarketCadence("watchlist")           // 30s
 *   useMarketCadence("dashboard")           // 45s
 *   useMarketCadence("workspace", isForex)  // skipped when isForex=false
 */
export function useMarketCadence(
  tier: "workspace" | "watchlist" | "dashboard" | "idle",
  enabled: boolean = true,
) {
  const id = useId();
  useEffect(() => {
    if (!enabled) return;
    marketData.init();
    const p = getProvider("twelvedata") as any;
    if (!p || typeof p.requestCadence !== "function") return;
    const ms = tier === "workspace" ? 12_000
             : tier === "watchlist" ? 30_000
             : tier === "dashboard" ? 45_000
             : 60_000;
    return p.requestCadence(`${tier}:${id}`, ms);
  }, [tier, id, enabled]);
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
