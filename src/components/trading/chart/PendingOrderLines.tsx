/**
 * Pending-order overlay — TradingView-style on-chart order editing.
 *
 * Each resting order renders as a thin dashed line across the plot with a
 * compact chip pinned to the price axis. Hovering expands the chip to reveal
 * the order description and inline actions (modify / cancel); dragging
 * re-prices the order and shows a grey ghost line at the original level.
 *
 * Visualization only — all persistence flows through the canonical
 * paper-trading server functions. No order logic lives here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Pencil } from "lucide-react";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { modifyOrder, cancelOrder } from "@/lib/paper-trading.functions";
import { fmtPrice } from "@/lib/trading/plan-math";
import { OrderLine, OrderLabel, LineAction, DragTooltip } from "./order-line-ui";

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
  /** Opens the order ticket for a pending order (optional). */
  onModify?: (id: string) => void;
}

export function PendingOrderLines({ adapter, sym, orders, tick, onModify }: Props) {
  const qc = useQueryClient();
  const modifyFn = useServerFn(modifyOrder);
  const cancelFn = useServerFn(cancelOrder);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [drag, setDrag] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
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
      const original = Number(o.trigger_price);
      const price = overrides[o.id] ?? original;
      return {
        o,
        price,
        y: adapter.priceToY(price),
        ghostY: overrides[o.id] != null ? adapter.priceToY(original) : null,
      };
    });
  }, [adapter, sym, orders, overrides]);

  if (!sym) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10 select-none">
      {rendered.map(({ o, price, y, ghostY }) => {
        if (y == null) return null;
        const isLong = o.direction === "long";
        const tone = isLong ? "buy" : "sell";
        const active = drag === o.id;
        const expanded = active || hover === o.id;
        const kind = o.order_type === "stop_limit" ? "Stop Limit" : o.order_type === "stop" ? "Stop" : "Limit";
        const side = isLong ? "Buy" : "Sell";

        return (
          <div key={o.id}>
            {ghostY != null && active && (
              <div
                className="pointer-events-none absolute h-px opacity-50"
                style={{
                  top: ghostY,
                  left: 0,
                  right: 64,
                  backgroundImage:
                    "repeating-linear-gradient(to right, hsl(var(--muted-foreground)) 0 4px, transparent 4px 8px)",
                }}
              />
            )}
            <OrderLine y={y} tone={tone} active={active} />
            <OrderLabel
              y={y}
              tone={tone}
              expanded={expanded}
              title="Drag to re-price this pending order"
              onMouseEnter={() => setHover(o.id)}
              onMouseLeave={() => setHover((h) => (h === o.id ? null : h))}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-line-action]")) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setDrag(o.id);
              }}
              label={
                <>
                  <span className="font-semibold text-foreground">{side} {kind}</span>
                  <span className="text-muted-foreground">{o.lot_size}</span>
                  {onModify && (
                    <LineAction label="Modify order" onClick={() => onModify(o.id)}>
                      <Pencil className="h-2.5 w-2.5" />
                    </LineAction>
                  )}
                  <LineAction label="Cancel order" danger onClick={() => cancel.mutate(o.id)}>
                    <X className="h-2.5 w-2.5" />
                  </LineAction>
                </>
              }
              axis={<span className="tabular-nums">{fmtPrice(sym, price)}</span>}
            />
            {active && (
              <DragTooltip y={y} tone={tone} title={`Moving ${side} ${kind}`}>
                <Row label="New price" value={fmtPrice(sym, price)} />
                <Row label="Size" value={String(o.lot_size)} />
              </DragTooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-[1px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
