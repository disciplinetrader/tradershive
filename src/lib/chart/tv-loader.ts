/**
 * Loader for TradingView Advanced Charts (private library).
 *
 * TradingView's Advanced Charting Library is not distributed on npm. When a
 * licensed copy is dropped under `public/charting_library/`, this loader
 * exposes it and wires our MarketDataEngine-backed datafeed into it, giving
 * TradersHIVE Arena a drop-in TradingView experience without changing any
 * consumer.
 *
 * Until then, the ChartEngine falls back to `lightweight-charts` — see
 * `src/components/chart/ChartEngine.tsx`. All datafeed logic already lives in
 * `src/lib/market-data/tv-datafeed.ts` and stays unchanged.
 */
export type TVLibrary = { widget: new (opts: unknown) => unknown };

export async function loadTradingViewLibrary(): Promise<TVLibrary | null> {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { TradingView?: TVLibrary };
  if (w.TradingView?.widget) return w.TradingView;
  try {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/charting_library/charting_library.standalone.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("tv_not_installed"));
      document.head.appendChild(s);
    });
    return (window as unknown as { TradingView?: TVLibrary }).TradingView ?? null;
  } catch {
    return null;
  }
}
