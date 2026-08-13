/**
 * Floating, draggable order ticket.
 *
 * Opens where the trader right-clicked the chart and can be dragged anywhere on
 * screen. The body is the SAME `OrderTicket` the right-hand panel renders, so
 * fields, validation, pre-flight and submit are identical by construction —
 * this component owns position and chrome, nothing about trading.
 *
 * The fixed right-panel tab stays exactly as it was; this is an alternative
 * surface, not a replacement.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, GripHorizontal } from "lucide-react";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { cn } from "@/lib/utils";

const WIDTH = 340;
/** Keep at least this much of the window on screen when dragging or resizing. */
const EDGE_MARGIN = 8;
/** Assumed height for the initial clamp, before the DOM has measured itself. */
const ASSUMED_HEIGHT = 460;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function FloatingOrderWindow({
  open,
  originX,
  originY,
  onClose,
}: {
  open: boolean;
  /** Viewport coords of the chart click that opened it. */
  originX: number;
  originY: number;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Grab offset lives in state, not a ref: a ref assignment does not re-render,
  // so the effect below would never re-run to attach the move listeners and the
  // window simply would not move.
  const [grab, setGrab] = useState<{ dx: number; dy: number } | null>(null);
  const winRef = useRef<HTMLDivElement | null>(null);

  const clampToViewport = useCallback((x: number, y: number) => {
    const h = winRef.current?.offsetHeight ?? ASSUMED_HEIGHT;
    return {
      x: clamp(x, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerWidth - WIDTH - EDGE_MARGIN)),
      y: clamp(y, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN)),
    };
  }, []);

  // Place it next to the click each time it opens, not where it was last left:
  // the whole point is that it appears where the trader was looking.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    setPos(clampToViewport(originX + 12, originY + 12));
  }, [open, originX, originY, clampToViewport]);

  /**
   * Re-clamp once the window has a real height.
   *
   * The open-time clamp runs before the DOM exists, so it can only guess the
   * height. If the guess is short the window opens lower than it should, and
   * the first drag snaps it upward to the true limit — which reads as the
   * window jumping out from under the pointer.
   */
  useLayoutEffect(() => {
    if (!open || !pos || !winRef.current) return;
    const fixed = clampToViewport(pos.x, pos.y);
    if (fixed.x !== pos.x || fixed.y !== pos.y) setPos(fixed);
  }, [open, pos, clampToViewport]);

  // The ticket grows as live data and validation rows arrive, which can push
  // the submit button below the fold after the clamp above has already run.
  useEffect(() => {
    const el = winRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setPos((p) => (p ? clampToViewport(p.x, p.y) : p));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!grab) return;
    const onMove = (e: PointerEvent) => {
      setPos(clampToViewport(e.clientX - grab.dx, e.clientY - grab.dy));
    };
    const onUp = () => setGrab(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [grab, clampToViewport]);

  if (!open || !pos || typeof document === "undefined") return null;

  /**
   * Portalled to `document.body` on purpose.
   *
   * Rendered in place it sits inside the chart container, and any ancestor
   * with a transform/filter (framer-motion, backdrop-blur) becomes the
   * containing block for `position: fixed`. The window is then trapped in the
   * chart's box: its coordinates no longer mean viewport coordinates, the
   * viewport clamp computes against the wrong bounds, and it cannot be dragged
   * "anywhere on screen" — which is the entire point of the feature.
   */
  return createPortal(
    <div
      ref={winRef}
      data-testid="floating-order-window"
      data-x={Math.round(pos.x)}
      data-y={Math.round(pos.y)}
      role="dialog"
      aria-label="Order ticket"
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border/60",
        "bg-background/95 shadow-2xl backdrop-blur",
      )}
      // Height is bounded by the room below the window's own top, so it can
      // never run off the bottom of the screen regardless of how tall the
      // ticket grows or when the clamp last measured. The body scrolls inside
      // instead — which keeps the submit button reachable, the failure this
      // replaced: the window rendered 735px tall at y=389 in a 1000px viewport
      // and put Buy at y=1050, off-screen and unclickable.
      style={{
        left: pos.x,
        top: pos.y,
        width: WIDTH,
        maxHeight: Math.max(220, window.innerHeight - pos.y - EDGE_MARGIN),
      }}
    >
      <div
        data-testid="floating-order-window-handle"
        onPointerDown={(e) => {
          // Ignore the close button so it can't start a drag.
          if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
          // Offset from the WINDOW's top-left, not the header's, so the window
          // does not jump when the drag starts.
          const r = winRef.current?.getBoundingClientRect();
          if (!r) return;
          setGrab({ dx: e.clientX - r.left, dy: e.clientY - r.top });
        }}
        className="flex shrink-0 cursor-grab items-center justify-between border-b border-border/50 bg-muted/40 px-2 py-1.5 active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <GripHorizontal className="h-3.5 w-3.5" />
          Order
        </div>
        <button
          data-no-drag
          data-testid="floating-order-window-close"
          type="button"
          aria-label="Close order ticket"
          onClick={onClose}
          className="grid h-5 w-5 place-items-center rounded hover:bg-muted"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <OrderTicket compact />
      </div>
    </div>,
    document.body,
  );
}
