import { useEffect, useRef, useState } from "react";
import type { ChartAdapter } from "@/lib/chart/adapter";

export interface OrderLine {
  id: string;
  kind: "entry" | "sl" | "tp";
  price: number;
  label?: string;
  color?: string;
  editable?: boolean;
}

interface Props {
  adapter: ChartAdapter | null;
  lines: OrderLine[];
  onChange?: (id: string, price: number) => void;
  onCommit?: (id: string, price: number) => void;
  /**
   * Tick to force re-projection when adapter internals change (e.g. after
   * candles push, resize, zoom). Pass any value that changes when the chart
   * geometry could have shifted.
   */
  tick?: number | string;
}

const COLORS: Record<OrderLine["kind"], string> = {
  entry: "#3b82f6",
  sl: "#ef4444",
  tp: "#22c55e",
};

/**
 * Renderer-independent DOM overlay for Entry/SL/TP order lines. Uses the
 * adapter's priceToY/yToPrice transforms so it works on any chart engine
 * that implements ChartAdapter — swapping to TradingView Advanced Charts
 * requires no changes here.
 */
export function OrderLinesOverlay({ adapter, lines, onChange, onCommit, tick }: Props) {
  const [, force] = useState(0);
  const dragging = useRef<{ id: string; startY: number; startPrice: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Reproject on resize / zoom / candle updates
  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { force((n) => n + 1); }, [tick, lines]);

  useEffect(() => {
    if (!dragging.current) return;
    function onMove(e: PointerEvent) {
      if (!dragging.current || !adapter) return;
      const price = adapter.yToPrice(e.clientY - (hostRef.current?.getBoundingClientRect().top ?? 0));
      if (price == null) return;
      onChange?.(dragging.current.id, price);
    }
    function onUp() {
      if (dragging.current) onCommit?.(dragging.current.id, priceForId(dragging.current.id));
      dragging.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    function priceForId(id: string) {
      return lines.find((l) => l.id === id)?.price ?? 0;
    }
  });

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10">
      {lines.map((l) => {
        const y = adapter?.priceToY(l.price);
        if (y == null || !Number.isFinite(y)) return null;
        const color = l.color ?? COLORS[l.kind];
        const label = l.label ?? l.kind.toUpperCase();
        return (
          <div
            key={l.id}
            className="absolute left-0 right-16 flex items-center"
            style={{ top: y - 10, height: 20 }}
          >
            <div className="h-px flex-1" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <div
              className="pointer-events-auto ml-2 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase text-white select-none"
              style={{ background: color, borderColor: color, cursor: l.editable === false ? "default" : "ns-resize" }}
              onPointerDown={(e) => {
                if (l.editable === false) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                dragging.current = { id: l.id, startY: e.clientY, startPrice: l.price };
              }}
            >
              {label} · {l.price.toFixed(4)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
