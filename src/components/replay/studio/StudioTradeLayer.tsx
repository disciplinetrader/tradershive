/**
 * Phase C · chart-native trading for Replay Studio.
 *
 * Renders the canonical execution state directly on the chart, TradingView
 * style: solid entry lines with hover actions, draggable stop / target lines,
 * dashed resting orders with drag + cancel, and a risk/reward tint between
 * the levels.
 *
 * Presentation + intent only. Every mutation goes through the studio context,
 * which delegates to `@/lib/chart/orders/service` — nothing here prices,
 * fills, sizes or persists anything itself.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Shield, X } from "lucide-react";

import type { ChartAdapter } from "@/lib/chart/adapter";
import type { PositionOrder } from "@/lib/chart/orders/model";
import { positionMetricsFor } from "@/lib/chart/orders/service";
import {
  AXIS_INSET, DragTooltip, LineAction, OrderLabel, OrderLine,
} from "@/components/trading/chart/order-line-ui";

import { useReplayStudio } from "./context";

type Handle = "stop" | "target" | "entry";
type DragState = { orderId: string; handle: Handle; kind: "position" | "pending"; price: number };

export interface ArmedOrder {
  direction: "buy" | "sell";
  /** Stop distance as a fraction of price (e.g. 0.002 = 0.2%). */
  stopFraction: number;
  /** Reward multiple applied to the stop distance. */
  rr: number;
}

interface Props {
  adapter: ChartAdapter | null;
  /** Anything that changes when chart geometry moves (cursor, timeframe, size). */
  tick?: number | string;
  decimals: number;
  /** When set, the next chart click places an order at that price. */
  armed?: ArmedOrder | null;
  onPlaced?: () => void;
}

function money(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

export function StudioTradeLayer({ adapter, tick, decimals, armed, onPlaced }: Props) {
  const {
    positions, pending, price, view,
    modifyLevels, modifyPendingLevels, partialClose, breakEven,
    closePositionNow, cancelOrder, placeOrderAt, sizeForRisk,
  } = useReplayStudio();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const live = view?.transport.lifecycle !== "completed";

  // Reproject whenever the chart or the canonical state moves.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { force((n) => n + 1); }, [tick, positions, pending, price]);

  // Drag lifecycle — the line follows the pointer, the commit happens on up.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const el = hostRef.current;
      if (!el || !adapter) return;
      const rect = el.getBoundingClientRect();
      const next = adapter.yToPrice(e.clientY - rect.top);
      if (next == null || !Number.isFinite(next)) return;
      setDrag((d) => (d ? { ...d, price: next } : d));
    };
    const onUp = () => {
      setDrag((d) => {
        if (d) {
          if (d.kind === "position") {
            modifyLevels(d.orderId, d.handle === "stop" ? { stop: d.price } : { target: d.price });
          } else {
            modifyPendingLevels(d.orderId, { [d.handle]: d.price } as { entry?: number; stop?: number; target?: number });
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, adapter, modifyLevels, modifyPendingLevels]);

  const priceOf = (o: PositionOrder, handle: Handle): number => {
    if (drag && drag.orderId === o.id && drag.handle === handle) return drag.price;
    return handle === "stop" ? o.stop : handle === "target" ? o.target : (o.fillPrice ?? o.entry);
  };

  const rows = useMemo(() => {
    if (!adapter) return [];
    return positions.map((p) => {
      const entry = priceOf(p, "entry");
      const stop = priceOf(p, "stop");
      const target = priceOf(p, "target");
      const m = positionMetricsFor(p, price);
      return {
        order: p,
        entry, stop, target,
        entryY: adapter.priceToY(entry),
        stopY: adapter.priceToY(stop),
        targetY: adapter.priceToY(target),
        pnl: m?.totalPnl ?? 0,
        r: m?.floatingR ?? 0,
        qty: m?.remainingQuantity ?? p.size ?? 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, positions, price, drag, tick]);

  const pendingRows = useMemo(() => {
    if (!adapter) return [];
    return pending.map((o) => ({
      order: o,
      entry: priceOf(o, "entry"),
      stop: priceOf(o, "stop"),
      target: priceOf(o, "target"),
      entryY: adapter.priceToY(priceOf(o, "entry")),
      stopY: adapter.priceToY(priceOf(o, "stop")),
      targetY: adapter.priceToY(priceOf(o, "target")),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, pending, drag, tick]);

  const fmt = (v: number) => v.toFixed(decimals);

  const startDrag = (orderId: string, handle: Handle, kind: "position" | "pending", current: number) =>
    (e: React.PointerEvent) => {
      if (!live) return;
      if ((e.target as HTMLElement).closest("[data-line-action]")) return;
      e.preventDefault();
      setDrag({ orderId, handle, kind, price: current });
    };

  // Arm-to-place: one click on the chart drops a full entry / stop / target.
  const onLayerClick = (e: React.MouseEvent) => {
    if (!armed || !adapter || !hostRef.current || !live) return;
    const rect = hostRef.current.getBoundingClientRect();
    const entry = adapter.yToPrice(e.clientY - rect.top);
    if (entry == null || !Number.isFinite(entry)) return;
    const dist = Math.max(Math.abs(entry) * armed.stopFraction, 1e-8);
    const stop = armed.direction === "buy" ? entry - dist : entry + dist;
    const target = armed.direction === "buy" ? entry + dist * armed.rr : entry - dist * armed.rr;
    placeOrderAt(armed.direction, { entry, stop, target }, { size: sizeForRisk(entry, stop) });
    onPlaced?.();
  };

  if (!adapter) return null;

  return (
    <div
      ref={hostRef}
      onClick={onLayerClick}
      className="absolute inset-0 z-10 select-none"
      style={{ pointerEvents: armed ? "auto" : "none", cursor: armed ? "crosshair" : undefined }}
    >
      {rows.map((row) => {
        const { order, entryY, stopY, targetY, pnl, r, qty } = row;
        if (entryY == null) return null;
        const isLong = order.direction === "buy";
        const tone = isLong ? "buy" : "sell";
        const key = order.id;
        const dragging = drag?.orderId === order.id ? drag : null;

        return (
          <div key={key}>
            {targetY != null ? (
              <div
                className="absolute bg-success/[0.06]"
                style={{ left: 0, right: AXIS_INSET, top: Math.min(entryY, targetY), height: Math.abs(targetY - entryY) }}
              />
            ) : null}
            {stopY != null ? (
              <div
                className="absolute bg-danger/[0.06]"
                style={{ left: 0, right: AXIS_INSET, top: Math.min(entryY, stopY), height: Math.abs(stopY - entryY) }}
              />
            ) : null}

            {/* Entry — immutable, with the position actions */}
            <OrderLine y={entryY} tone={tone} solid />
            <OrderLabel
              y={entryY}
              tone={tone}
              draggable={false}
              expanded={hover === `${key}:entry`}
              onMouseEnter={() => setHover(`${key}:entry`)}
              onMouseLeave={() => setHover(null)}
              title={`${isLong ? "Long" : "Short"} ${order.symbol}`}
              label={
                <>
                  <span className="font-semibold">{isLong ? "LONG" : "SHORT"}</span>
                  <span>{qty ? qty.toFixed(2) : "—"}</span>
                  <span className={pnl >= 0 ? "text-success" : "text-danger"}>{money(pnl)}</span>
                  <span className="text-muted-foreground">{r.toFixed(2)}R</span>
                  {live ? (
                    <>
                      <LineAction label="Move stop to break-even" onClick={() => breakEven(order.id)}>
                        <Shield className="h-2.5 w-2.5" />
                      </LineAction>
                      <LineAction label="Close half" onClick={() => partialClose(order.id, 0.5)}>
                        <Scissors className="h-2.5 w-2.5" />
                      </LineAction>
                      <LineAction danger label="Close position" onClick={() => closePositionNow(order.id)}>
                        <X className="h-2.5 w-2.5" />
                      </LineAction>
                    </>
                  ) : null}
                </>
              }
              axis={fmt(row.entry)}
            />

            {/* Stop */}
            {stopY != null ? (
              <>
                <OrderLine y={stopY} tone="stop" active={dragging?.handle === "stop"} />
                <OrderLabel
                  y={stopY}
                  tone="stop"
                  expanded={hover === `${key}:stop` || dragging?.handle === "stop"}
                  onMouseEnter={() => setHover(`${key}:stop`)}
                  onMouseLeave={() => setHover(null)}
                  onPointerDown={startDrag(order.id, "stop", "position", row.stop)}
                  title="Drag to move the stop loss"
                  label={<span className="font-semibold">STOP</span>}
                  axis={fmt(row.stop)}
                />
              </>
            ) : null}

            {/* Target */}
            {targetY != null ? (
              <>
                <OrderLine y={targetY} tone="profit" active={dragging?.handle === "target"} />
                <OrderLabel
                  y={targetY}
                  tone="profit"
                  expanded={hover === `${key}:target` || dragging?.handle === "target"}
                  onMouseEnter={() => setHover(`${key}:target`)}
                  onMouseLeave={() => setHover(null)}
                  onPointerDown={startDrag(order.id, "target", "position", row.target)}
                  title="Drag to move the take profit"
                  label={<span className="font-semibold">TARGET</span>}
                  axis={fmt(row.target)}
                />
              </>
            ) : null}

            {dragging && (dragging.handle === "stop" || dragging.handle === "target") ? (
              <DragTooltip
                y={(dragging.handle === "stop" ? stopY : targetY) ?? entryY}
                tone={dragging.handle === "stop" ? "stop" : "profit"}
                title={dragging.handle === "stop" ? "Stop" : "Target"}
              >
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Price</span>
                  <span>{fmt(dragging.price)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Distance</span>
                  <span>{fmt(Math.abs(dragging.price - (order.fillPrice ?? order.entry)))}</span>
                </div>
              </DragTooltip>
            ) : null}
          </div>
        );
      })}

      {/* Resting orders — dashed, fully draggable, cancellable */}
      {pendingRows.map((row) => {
        const { order, entryY, stopY, targetY } = row;
        if (entryY == null) return null;
        const tone = order.direction === "buy" ? "buy" : "sell";
        const key = order.id;
        const dragging = drag?.orderId === order.id ? drag : null;
        return (
          <div key={key}>
            <OrderLine y={entryY} tone={tone} active={dragging?.handle === "entry"} />
            <OrderLabel
              y={entryY}
              tone={tone}
              expanded={hover === `${key}:entry` || dragging?.handle === "entry"}
              onMouseEnter={() => setHover(`${key}:entry`)}
              onMouseLeave={() => setHover(null)}
              onPointerDown={startDrag(order.id, "entry", "pending", row.entry)}
              title="Drag to re-price the order"
              label={
                <>
                  <span className="font-semibold uppercase">{order.orderType.replace("_", " ")}</span>
                  <span>{order.size ? order.size.toFixed(2) : "—"}</span>
                  {live ? (
                    <LineAction danger label="Cancel order" onClick={() => cancelOrder(order.id)}>
                      <X className="h-2.5 w-2.5" />
                    </LineAction>
                  ) : null}
                </>
              }
              axis={fmt(row.entry)}
            />
            {stopY != null ? (
              <>
                <OrderLine y={stopY} tone="stop" active={dragging?.handle === "stop"} />
                <OrderLabel
                  y={stopY}
                  tone="stop"
                  expanded={hover === `${key}:stop` || dragging?.handle === "stop"}
                  onMouseEnter={() => setHover(`${key}:stop`)}
                  onMouseLeave={() => setHover(null)}
                  onPointerDown={startDrag(order.id, "stop", "pending", row.stop)}
                  title="Drag to move the stop loss"
                  label={<span className="font-semibold">STOP</span>}
                  axis={fmt(row.stop)}
                />
              </>
            ) : null}
            {targetY != null ? (
              <>
                <OrderLine y={targetY} tone="profit" active={dragging?.handle === "target"} />
                <OrderLabel
                  y={targetY}
                  tone="profit"
                  expanded={hover === `${key}:target` || dragging?.handle === "target"}
                  onMouseEnter={() => setHover(`${key}:target`)}
                  onMouseLeave={() => setHover(null)}
                  onPointerDown={startDrag(order.id, "target", "pending", row.target)}
                  title="Drag to move the take profit"
                  label={<span className="font-semibold">TARGET</span>}
                  axis={fmt(row.target)}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
