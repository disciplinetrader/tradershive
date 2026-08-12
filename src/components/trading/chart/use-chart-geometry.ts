import { useEffect, useState, type RefObject } from "react";
import type { ChartAdapter } from "@/lib/chart/adapter";

/**
 * A counter that increments whenever the chart's geometry changes — zoom, pan,
 * price-scale drag, timeframe switch or resize.
 *
 * DOM overlays (position lines, pending-order lines) convert price → pixel via
 * `adapter.priceToY`. That conversion is only valid for the axis as it stood
 * when it ran, so anything caching the result — a `useMemo`, a ref, a piece of
 * state — has to recompute when the axis moves. **Include this value in the
 * dependency list of any memo that holds pixel coordinates.**
 *
 * This existed as a `tick` prop threaded down from `TradingWorkspace`, but the
 * memos that actually held the pixels did not list it, so the overlays kept
 * re-rendering with stale coordinates: after a zoom the stop-loss line stayed
 * at its old screen position and its label reported the price that *used* to
 * live there. A trader could read 64882.8 off a chart whose stop was really at
 * 64082.8. Subscribing here rather than depending on a prop means an overlay
 * cannot be wired up wrong from the outside — it is correct on its own.
 *
 * `subscribeGeometry` is optional on the adapter contract, so the
 * `ResizeObserver` stays as a floor: an adapter without it still re-projects on
 * resize, just not on zoom or pan.
 */
export function useChartGeometry(
  adapter: ChartAdapter | null,
  hostRef: RefObject<HTMLElement | null>,
): number {
  const [geometry, setGeometry] = useState(0);

  useEffect(() => {
    if (!adapter?.subscribeGeometry) return;
    // The adapter coalesces to one rAF and only fires on an actual change, so
    // this is not a per-frame re-render.
    return adapter.subscribeGeometry(() => setGeometry((n) => n + 1));
  }, [adapter]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setGeometry((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hostRef]);

  return geometry;
}
