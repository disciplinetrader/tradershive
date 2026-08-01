/**
 * Pending-order overlay — TradingView-style on-chart order editing.
 *
 * Every pending paper order on the active symbol renders as a dashed
 * trigger line with a draggable label. Dragging the label vertically
 * re-prices the order (`modifyOrder`); the × cancels it (`cancelOrder`).
 *
 * Visualization only — all persistence flows through the canonical
 * paper-trading server functions. No order logic lives here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { modifyOrder, cancelOrder } from "@/lib/paper-trading.functions";
import { fmtPrice } from "@/lib/trading/plan-math";
import { cn } from "@/lib/utils";

export type PendingOrderLine = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  order_type: "limit" | "stop" | "stop_limit";
  trigger_price: number;
  lot_size: number;
  status?: string | null;
};

interface Props {
  adapter: ChartAdapter | null;
  sym: SymbolMeta | null;
  orders: PendingOrderLine[];
  tick?: number;
}

export function PendingOrderLines({ adapter, sym, orders, tick }: Props) {
  const qc = useQueryClient();
  const modifyFn = useServerFn(modifyOrder);
  const cancelFn = useServerFn(cancelOrder);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [drag, setDrag] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const modify = useMutation({
    mutationFn: async (v: { id: string; trigger_price: number }) =>
      modifyFn({ data: v }) as unknown as Promise<{ ok: true }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper", "orders"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to modify order"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => cancelFn({ data: { id } }) as unknown as Promise<{ ok: true }>,
    onSuccess: () => {
      toast.success("Pending order cancelled");
      qc.invalidateQueries({ queryKey: ["paper", "orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to cancel order"),
  });

  useEffect(() => {
    if (!hostRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { force((n) => n + 1); }, [tick, orders]);

  useEffect(() => {
    if (!drag) return;
    const id = drag;
    function onMove(e: PointerEvent) {
      if (!adapter || !hostRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      const price = adapter.yToPrice(e.clientY - rect.top);
      if (price == null || !Number.isFinite(price) || price <= 0) return;
      setOverrides((o) => ({ ...o, [id]: price }));
    }
    function onUp() {
      const px = overrides[id];
      if (px != null && px > 0) modify.mutate({ id, trigger_price: px });
      setDrag(null);
      setTimeout(() => setOverrides((o) => { const c = { ...o }; delete c[id]; return c; }), 800);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, adapter, overrides, modify]);

  const rendered = useMemo(() => {
    if (!adapter || !sym) return [];
    return orders.map((o) => {
      const price = overrides[o.id] ?? Number(o.trigger_price);
      return { o, price, y: adapter.priceToY(price) };
    });
  }, [adapter, sym, orders, overrides]);

  if (!sym) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10 select-none">
      {rendered.map(({ o, price, y }) => {
        if (y == null) return null;
        const isLong = o.direction === "long";
        const active = drag === o.id;
        const label = `${isLong ? "BUY" : "SELL"} ${o.order_type === "stop_limit" ? "STOP-LMT" : o.order_type.toUpperCase()}`;
        return (
          <div key={o.id}>
            <div
              className="pointer-events-none absolute left-0 right-16 h-px"
              style={{
                top: y,
                backgroundImage: `repeating-linear-gradient(to right, ${isLong ? "#3b82f6" : "#f59e0b"} 0 4px, transparent 4px 10px)`,
                boxShadow: active
                  ? `0 0 10px ${isLong ? "rgba(59,130,246,0.7)" : "rgba(245,158,11,0.7)"}`
                  : "none",
              }}
            />
            <div
              className="pointer-events-auto absolute left-0 right-16 flex items-center justify-end"
              style={{ top: y - 11, height: 22, cursor: "ns-resize", touchAction: "none" }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-cancel]")) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setDrag(o.id);
              }}
              title="Drag to re-price this pending order"
            >
              <div
                className={cn(
                  "flex select-none items-stretch overflow-hidden rounded-md border shadow-md transition-transform duration-150 hover:scale-105",
                  isLong ? "border-primary/60" : "border-warning/60",
                  active && "scale-110",
                )}
              >
                <div
                  className={cn(
                    "flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
                    isLong ? "bg-primary" : "bg-warning",
                  )}
                >
                  {label}
                </div>
                <div className="flex items-center gap-1.5 bg-background/90 px-1.5 py-0.5 font-mono text-[10px]">
                  <span className="tabular-nums text-foreground">{fmtPrice(sym, price)}</span>
                  <span className="text-border">│</span>
                  <span className="tabular-nums text-muted-foreground">{o.lot_size}</span>
                  <button
                    data-cancel
                    aria-label="Cancel pending order"
                    title="Cancel order"
                    onClick={() => cancel.mutate(o.id)}
                    className="ml-0.5 grid h-4 w-4 place-items-center rounded bg-muted text-muted-foreground transition hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
