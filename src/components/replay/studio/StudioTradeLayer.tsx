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

/**
 * A drag either edits a LIVE order through the store, or edits the
 * uncommitted draft, which exists only in React state. The two commit to
 * completely different places on pointer-up, so they are separate variants
 * rather than an optional `orderId` — `modifyLevels` needs an order id and a
 * draft has no order to modify.
 */
type DragState =
  | { on: "order"; orderId: string; handle: Handle; kind: "position" | "pending"; price: number }
  | { on: "draft"; handle: Handle; price: number };

export interface ArmedOrder {
  direction: "buy" | "sell";
  /** Stop distance as a fraction of price (e.g. 0.002 = 0.2%). */
  stopFraction: number;
  /** Reward multiple applied to the stop distance. */
  rr: number;
}

/**
 * An order the trader is still positioning. Nothing has been placed yet.
 *
 * `stop` and `target` are null until dragged out. They used to arrive
 * pre-computed at a hardcoded 2R, which made the tool issue a recommendation
 * on the trader's behalf; starting unset means the levels are the trader's.
 *
 * Both must be placed before this can be committed — `validateOrder` requires
 * entry, stop and target to be positive, and `sizeForRisk` derives position
 * size from the stop distance. By commit time both are real numbers, which is
 * why nothing in the order model had to become nullable.
 */
export interface DraftOrder {
  direction: "buy" | "sell";
  entry: number;
  stop: number | null;
  target: number | null;
}

/** A draft is only committable once both levels have been positioned. */
export function draftIsComplete(
  d: DraftOrder | null,
): d is DraftOrder & { stop: number; target: number } {
  return !!d && d.stop != null && d.target != null;
}

interface Props {
  adapter: ChartAdapter | null;
  /** Anything that changes when chart geometry moves (cursor, timeframe, size). */
  tick?: number | string;
  decimals: number;
  /** When set, the next chart click STARTS a draft at that price. */
  armed?: ArmedOrder | null;
  /**
   * The uncommitted draft, owned by `StudioChart` so its status bar can host
   * the commit and cancel controls. Only pointer-UP propagates: the in-flight
   * drag price stays local, so a drag is one update up here, not one per frame.
   */
  draft?: DraftOrder | null;
  onDraftChange?: (d: DraftOrder | null) => void;
}

function money(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

export function StudioTradeLayer({ adapter, tick, decimals, armed, draft, onDraftChange }: Props) {
  const {
    positions, pending, price, view,
    modifyLevels, modifyPendingLevels, partialClose, breakEven,
    closePositionNow, cancelOrder,
  } = useReplayStudio();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Read by the pointer-up handler. Keeping the draft out of that effect's deps
  // stops the drag listeners being torn down and re-added mid-gesture.
  const draftRef = useRef<DraftOrder | null>(null);
  draftRef.current = draft ?? null;
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
          if (d.on === "draft") {
            // Nothing exists to modify yet — this writes the positioned level
            // back into the draft, and the order is created only on commit.
            if (draftRef.current) {
              onDraftChange?.({ ...draftRef.current, [d.handle]: d.price } as DraftOrder);
            }
          } else if (d.kind === "position") {
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
  }, [drag, adapter, modifyLevels, modifyPendingLevels, onDraftChange]);

  const priceOf = (o: PositionOrder, handle: Handle): number => {
    if (drag && drag.on === "order" && drag.orderId === o.id && drag.handle === handle) return drag.price;
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
      setDrag({ on: "order", orderId, handle, kind, price: current });
    };

  /** Drag one of the draft's levels. An unplaced one starts from the entry. */
  const startDraftDrag = (handle: Handle, current: number) =>
    (e: React.PointerEvent) => {
      if (!live) return;
      e.preventDefault();
      e.stopPropagation();
      setDrag({ on: "draft", handle, price: current });
    };

  /**
   * Draft geometry. An unplaced level has no price of its own, so its handle
   * parks ON the entry line — zero distance, proposing no ratio, but still
   * grabbable. Rendering nothing would be the honest picture of "unset" and
   * would also leave the trader nothing to drag: the handle IS the control.
   */
  const draftView = useMemo(() => {
    if (!draft || !adapter) return null;
    const at = (handle: Handle, stored: number | null): { price: number | null; y: number | null } => {
      const price = drag?.on === "draft" && drag.handle === handle ? drag.price : stored;
      return { price, y: price != null ? adapter.priceToY(price) : null };
    };
    const entryY = adapter.priceToY(draft.entry);
    const stop = at("stop", draft.stop);
    const target = at("target", draft.target);
    return { entryY, stop, target };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, adapter, drag, tick]);

  /**
   * Arm-to-place: the click sets the ENTRY and nothing else.
   *
   * It used to derive a full 2R bracket and commit the order in the same
   * gesture, so the trader's first sight of their stop and target was as a
   * placed trade at levels the tool chose. Now it opens a draft the trader
   * positions and then confirms; ignored once a draft exists, so a stray click
   * cannot restart one that is half-positioned.
   */
  const onLayerClick = (e: React.MouseEvent) => {
    if (!armed || draft || !adapter || !hostRef.current || !live) return;
    const rect = hostRef.current.getBoundingClientRect();
    const clicked = adapter.yToPrice(e.clientY - rect.top);
    if (clicked == null || !Number.isFinite(clicked)) return;
    onDraftChange?.({ direction: armed.direction, entry: clicked, stop: null, target: null });
  };

  if (!adapter) return null;

  return (
    <div
      ref={hostRef}
      onClick={onLayerClick}
      className="absolute inset-0 z-10 select-none"
      style={{ pointerEvents: armed ? "auto" : "none", cursor: armed ? "crosshair" : undefined }}
    >
      {/* The uncommitted draft. Ghosted so it never reads as a live position. */}
      {draft && draftView && draftView.entryY != null ? (() => {
        const { entryY, stop, target } = draftView;
        const tone = draft.direction === "buy" ? "buy" : "sell";
        const dragHandle = drag?.on === "draft" ? drag.handle : null;
        // An unplaced handle is parked relative to the entry, offset by a fixed
        // number of PIXELS — not a price — so the two never sit on top of each
        // other and both stay grabbable. The chip still reads "—", so no
        // distance is being proposed; only the conventional side is (target
        // beyond the entry, stop behind it), which is a fact about direction
        // rather than a recommendation about size.
        const GHOST_OFFSET = 22;
        const parkedY = (handle: "stop" | "target") => {
          const beyond = draft.direction === "buy" ? -GHOST_OFFSET : GHOST_OFFSET;
          return entryY + (handle === "target" ? beyond : -beyond);
        };
        const level = (
          handle: "stop" | "target",
          y: number | null,
          price: number | null,
          lineTone: "stop" | "profit",
          text: string,
        ) => {
          const placed = price != null;
          const lineY = y ?? parkedY(handle);
          return (
            <>
              <OrderLine
                y={lineY}
                tone={lineTone}
                ghost={!placed}
                active={dragHandle === handle}
              />
              <OrderLabel
                y={lineY}
                tone={lineTone}
                ghost={!placed}
                expanded={hover === `draft:${handle}` || dragHandle === handle}
                onMouseEnter={() => setHover(`draft:${handle}`)}
                onMouseLeave={() => setHover(null)}
                onPointerDown={startDraftDrag(handle, price ?? draft.entry)}
                title={placed ? `Drag to move the ${text.toLowerCase()}` : `Drag to place the ${text.toLowerCase()}`}
                testId={`draft-${handle}`}
                label={
                  <span className="font-semibold">
                    {placed ? text : `${text} · DRAG TO PLACE`}
                  </span>
                }
                axis={placed ? fmt(price) : "—"}
              />
            </>
          );
        };
        return (
          // Sized to the host so it is a real box rather than a zero-height
          // grouping div: the handles inside are absolutely positioned, which
          // left this collapsed and untestable. `pointer-events-none` keeps it
          // from swallowing chart clicks — each handle re-enables its own.
          <div data-testid="studio-draft-order" className="pointer-events-none absolute inset-0">
            {/* Entry first so it sits BENEATH the two draggable handles. All
                three coincide while the levels are unplaced, and the topmost
                element is the one a pointer finds — with entry last, neither
                handle could be grabbed at all. */}
            <OrderLine y={entryY} tone={tone} solid />
            <OrderLabel
              y={entryY}
              tone={tone}
              draggable={false}
              expanded={hover === "draft:entry"}
              onMouseEnter={() => setHover("draft:entry")}
              onMouseLeave={() => setHover(null)}
              title="Draft entry — confirm to place the order"
              testId="draft-entry"
              label={
                <span className="font-semibold">
                  DRAFT {draft.direction === "buy" ? "LONG" : "SHORT"}
                </span>
              }
              axis={fmt(draft.entry)}
            />
            {level("target", target.y, target.price, "profit", "TARGET")}
            {level("stop", stop.y, stop.price, "stop", "STOP")}
          </div>
        );
      })() : null}

      {rows.map((row) => {
        const { order, entryY, stopY, targetY, pnl, r, qty } = row;
        if (entryY == null) return null;
        const isLong = order.direction === "buy";
        const tone = isLong ? "buy" : "sell";
        const key = order.id;
        const dragging = drag?.on === "order" && drag.orderId === order.id ? drag : null;

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
                  {/* No stop means no risk to measure against, so there is no
                      R — not "0.00R", which reads as a real (flat) result. */}
                  <span className="text-muted-foreground">
                    {Number.isFinite(order.stop) ? `${r.toFixed(2)}R` : "—"}
                  </span>
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
        const dragging = drag?.on === "order" && drag.orderId === order.id ? drag : null;
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
