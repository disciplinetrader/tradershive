/**
 * Phase 8B · Studio chart — pure projection of the clock's visible window.
 *
 * The chart never sees future bars: `view.candles` is exactly what the clock
 * has consumed plus the forming bar. No timers, no data fetching, no trading.
 */
import { useEffect, useMemo, useRef } from "react";
import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { ChartSettings } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/replay/types";
import { useReplayStudio } from "./context";

export function StudioChart({ onAdapterReady }: { onAdapterReady?: (a: ChartAdapter | null) => void }) {
  const { view } = useReplayStudio();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const fittedRef = useRef(false);

  const symbol = view?.dataset.label.split(" ")[0] ?? "";
  const timeframe = (view?.dataset.timeframe ?? "5m") as Timeframe;

  const settings: ChartSettings = useMemo(
    () => ({
      chartType: "candles",
      timeframe,
      symbol,
      priceScale: "auto",
      crosshair: "normal",
      showGrid: true,
      showVolume: false,
      sessionShading: false,
      autoScale: true,
      timezone: view?.dataset.timezone ?? "UTC",
    }),
    [symbol, timeframe, view?.dataset.timezone],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const a = createLightweightAdapter({ container: hostRef.current, settings });
    adapterRef.current = a;
    fittedRef.current = false;
    onAdapterReady?.(a);
    return () => {
      a.destroy();
      adapterRef.current = null;
      onAdapterReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = adapterRef.current;
    if (!a || !view) return;
    a.setCandles(view.candles as never);
    if (!fittedRef.current && view.candles.length > 4) {
      a.fitContent();
      fittedRef.current = true;
    }
  }, [view?.candles, view]);

  return <div ref={hostRef} className="absolute inset-0" data-testid="studio-chart" data-studio-chart="" />;
}
