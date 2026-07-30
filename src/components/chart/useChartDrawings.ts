/**
 * Chart drawing interaction controller.
 *
 * Owns pointer + keyboard handling for the drawing layer and registers the
 * store as the adapter's `DrawingsSource`, so every object is repainted by
 * the chart itself from time/price coordinates. Nothing here caches pixels,
 * which is why drawings stay anchored through zoom, pan, rescale and resize.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { Candle } from "@/lib/market-data/types";
import { DrawingStore, makeDrawing } from "@/lib/chart/drawings/store";
import {
  anchorAt, drawDrawing, hitTest, moveAnchor, translateDrawing,
} from "@/lib/chart/drawings/render";
import {
  FREEHAND_KINDS, SINGLE_CLICK_KINDS,
  type Drawing, type DrawingKind, type DrawingPoint, type DrawingStyle, type ToolId,
} from "@/lib/chart/drawings/types";

export interface DrawingsController {
  store: DrawingStore;
  version: number;
}

interface Options {
  adapter: ChartAdapter | null;
  store: DrawingStore;
  activeTool: ToolId;
  setActiveTool: (t: ToolId) => void;
  /** Keep the tool selected after finishing an object. */
  keepToolActive?: boolean;
  magnet?: boolean;
  candles?: Candle[];
  style?: Partial<DrawingStyle>;
  pricePrecision?: number;
  /** Called when a position tool is completed — lets callers open a ticket. */
  onPositionDrawn?: (d: Drawing) => void;
  enabled?: boolean;
}

const isDrawingKind = (t: ToolId): t is DrawingKind =>
  t !== "cursor" && t !== "crosshair" && t !== "dot";

export function useChartDrawings({
  adapter, store, activeTool, setActiveTool, keepToolActive, magnet,
  candles, style, pricePrecision = 4, onPositionDrawn, enabled = true,
}: Options) {
  // Re-render consumers (toolbars, context menus) when the store changes.
  const version = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.list(),
    () => store.list(),
  );

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const pendingCancelRef = useRef<(() => void) | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const ref = useRef({ activeTool, keepToolActive, magnet, candles, style, onPositionDrawn, setActiveTool });
  ref.current = { activeTool, keepToolActive, magnet, candles, style, onPositionDrawn, setActiveTool };

  // ── Register the paint source ────────────────────────────────────────
  useEffect(() => {
    if (!adapter?.setDrawingsSource) return;
    adapter.setPriceFormatter?.((p) => p.toFixed(pricePrecision));
    adapter.setDrawingsSource({
      draw(ctx, coords) {
        const selectedId = store.selectedIdValue();
        const hoveredId = store.hoveredIdValue();
        for (const d of store.list()) {
          drawDrawing(ctx, coords, d, {
            selected: d.id === selectedId,
            hovered: d.id === hoveredId && d.id !== selectedId,
          });
        }
        if (store.draft) drawDrawing(ctx, coords, store.draft, { ghost: true });
      },
    });
    const unsub = store.subscribe(() => adapter.requestDrawingsRepaint?.());
    adapter.requestDrawingsRepaint?.();
    return () => {
      unsub();
      adapter.setDrawingsSource?.(null);
    };
  }, [adapter, store, pricePrecision]);

  // ── Pointer interaction ──────────────────────────────────────────────
  useEffect(() => {
    if (!adapter || !enabled) return;
    const el = adapter.chartElement?.();
    if (!el) return;

    const rectOf = () => el.getBoundingClientRect();
    const localPoint = (e: PointerEvent) => {
      const r = rectOf();
      return { px: e.clientX - r.left, py: e.clientY - r.top };
    };

    const snap = (pt: DrawingPoint): DrawingPoint => {
      const { magnet: mag, candles: cs } = ref.current;
      if (!mag || !cs?.length) return pt;
      let best = cs[0];
      for (const c of cs) {
        if (Math.abs(c.time - pt.time) < Math.abs(best.time - pt.time)) best = c;
      }
      const levels = [best.open, best.high, best.low, best.close];
      let nearest = levels[0];
      for (const lv of levels) if (Math.abs(lv - pt.price) < Math.abs(nearest - pt.price)) nearest = lv;
      return { time: best.time, price: nearest };
    };

    const toPoint = (px: number, py: number): DrawingPoint | null => {
      const coords = adapter.getCoords?.();
      if (!coords) return null;
      const time = coords.timeAt(px);
      const price = coords.priceAt(py);
      if (time == null || price == null) return null;
      return snap({ time, price });
    };

    type Session =
      | { mode: "create"; kind: DrawingKind; origin: DrawingPoint; moved: boolean; downX: number; downY: number }
      | { mode: "move"; id: string; last: DrawingPoint }
      | { mode: "anchor"; id: string; anchorId: string };

    let session: Session | null = null;
    let pointerId: number | null = null;
    /**
     * Two-click authoring state. After the first click the tool stays armed:
     * the draft follows the cursor and the *next* click commits the second
     * anchor. This is the TradingView behaviour for trend lines, rays,
     * shapes, fibs and measurements.
     */
    let pending: { kind: DrawingKind; origin: DrawingPoint } | null = null;

    const clearPending = () => {
      pending = null;
      store.draft = null;
      adapter.requestDrawingsRepaint?.();
    };
    pendingCancelRef.current = clearPending;

    const finishCreate = (d: Drawing) => {
      pending = null;
      store.draft = null;
      store.add(d);
      if ((d.kind === "long_position" || d.kind === "short_position")) ref.current.onPositionDrawn?.(d);
      if (!ref.current.keepToolActive) ref.current.setActiveTool("cursor");
    };

    const seedPoints = (kind: DrawingKind, a: DrawingPoint, b: DrawingPoint): DrawingPoint[] => {
      if (kind === "long_position" || kind === "short_position") {
        const risk = Math.abs(b.price - a.price) || a.price * 0.002;
        const dir = kind === "long_position" ? 1 : -1;
        return [a, { time: b.time, price: a.price + dir * risk * 2 }, { time: b.time, price: a.price - dir * risk }];
      }
      if (kind === "triangle") {
        return [a, b, { time: a.time, price: b.price }];
      }
      return [a, b];
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { activeTool: tool } = ref.current;
      const { px, py } = localPoint(e);
      const pt = toPoint(px, py);
      if (!pt) return;
      const coords = adapter.getCoords?.();

      // Second click of a two-click object → commit.
      if (pending) {
        e.preventDefault();
        e.stopPropagation();
        const { kind, origin } = pending;
        finishCreate(makeDrawing(kind, seedPoints(kind, origin, pt), ref.current.style));
        return;
      }

      if (isDrawingKind(tool)) {
        e.preventDefault();
        e.stopPropagation();
        pointerId = e.pointerId;
        if (SINGLE_CLICK_KINDS.includes(tool) && tool !== "long_position" && tool !== "short_position") {
          finishCreate(makeDrawing(tool, [pt], ref.current.style));
          return;
        }
        session = { mode: "create", kind: tool, origin: pt, moved: false, downX: px, downY: py };
        store.draft = makeDrawing(
          tool,
          FREEHAND_KINDS.includes(tool) ? [pt] : seedPoints(tool, pt, pt),
          ref.current.style,
        );
        store.commit();
        return;
      }

      // Cursor tool: select / drag existing objects, otherwise let the chart pan.
      if (!coords) return;
      const selectedId = store.selectedIdValue();
      const selected = store.list().find((d) => d.id === selectedId);
      if (selected && !selected.locked) {
        const a = anchorAt(selected, coords, px, py);
        if (a) {
          e.preventDefault();
          e.stopPropagation();
          pointerId = e.pointerId;
          store.beginEdit();
          session = { mode: "anchor", id: selected.id, anchorId: a.id };
          return;
        }
      }
      const list = store.list();
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        if (d.hidden) continue;
        if (hitTest(d, coords, px, py)) {
          e.preventDefault();
          e.stopPropagation();
          pointerId = e.pointerId;
          store.select(d.id);
          if (!d.locked) {
            store.beginEdit();
            session = { mode: "move", id: d.id, last: pt };
          }
          return;
        }
      }
      if (selectedId) store.select(null);
    };

    const onMove = (e: PointerEvent) => {
      const s = session;
      const { px, py } = localPoint(e);

      // Live preview between the first and second click.
      if (!s && pending) {
        const pt = toPoint(px, py);
        if (!pt) return;
        store.draft = makeDrawing(pending.kind, seedPoints(pending.kind, pending.origin, pt), ref.current.style);
        adapter.requestDrawingsRepaint?.();
        return;
      }

      if (!s || (pointerId != null && e.pointerId !== pointerId)) return;
      const pt = toPoint(px, py);
      if (!pt) return;
      e.preventDefault();
      e.stopPropagation();

      if (s.mode === "create") {
        const draft = store.draft;
        if (!draft) return;
        if (Math.abs(px - s.downX) > 3 || Math.abs(py - s.downY) > 3) s.moved = true;
        draft.points = FREEHAND_KINDS.includes(s.kind)
          ? [...draft.points, pt]
          : seedPoints(s.kind, s.origin, pt);
        adapter.requestDrawingsRepaint?.();
        return;
      }
      const d = store.list().find((x) => x.id === s.id);
      if (!d) return;
      if (s.mode === "move") {
        const dTime = pt.time - s.last.time;
        const dPrice = pt.price - s.last.price;
        s.last = pt;
        store.patch(d.id, { points: translateDrawing(d, dTime, dPrice) });
        return;
      }
      store.patch(d.id, { points: moveAnchor(d, s.anchorId, pt) });
    };

    const onUp = (e: PointerEvent) => {
      if (!session || (pointerId != null && e.pointerId !== pointerId)) return;
      const current = session;
      session = null;
      pointerId = null;
      if (current.mode === "create") {
        const draft = store.draft;
        if (!draft) return;
        const isPosition = draft.kind === "long_position" || draft.kind === "short_position";
        if (!current.moved && !isPosition && !FREEHAND_KINDS.includes(draft.kind)) {
          // A click without a drag arms the second anchor instead of guessing
          // one — the object now follows the cursor until the next click.
          pending = { kind: draft.kind, origin: current.origin };
          adapter.requestDrawingsRepaint?.();
          return;
        }
        store.draft = null;
        finishCreate(draft);
        return;
      }
      store.commit();
    };

    const onContext = (e: MouseEvent) => {
      const coords = adapter.getCoords?.();
      if (!coords) return;
      const r = rectOf();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const list = store.list();
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        if (d.hidden) continue;
        if (hitTest(d, coords, px, py)) {
          e.preventDefault();
          e.stopPropagation();
          store.select(d.id);
          setMenu({ id: d.id, x: e.clientX, y: e.clientY });
          return;
        }
      }
    };

    el.addEventListener("pointerdown", onDown, { capture: true });
    el.addEventListener("contextmenu", onContext, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      el.removeEventListener("pointerdown", onDown, { capture: true } as any);
      el.removeEventListener("contextmenu", onContext, { capture: true } as any);
      window.removeEventListener("pointermove", onMove, { capture: true } as any);
      window.removeEventListener("pointerup", onUp, { capture: true } as any);
      pendingCancelRef.current = null;
      store.draft = null;
    };
  }, [adapter, store, enabled]);


  // ── Cursor affordance ────────────────────────────────────────────────
  useEffect(() => {
    const el = adapter?.chartElement?.();
    if (!el) return;
    const previous = el.style.cursor;
    el.style.cursor = isDrawingKind(activeTool) ? "crosshair" : "";
    return () => { el.style.cursor = previous; };
  }, [adapter, activeTool]);

  // ── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        setMenu(null);
        pendingCancelRef.current?.();
        if (store.draft) { store.draft = null; store.commit(); }
        if (store.selectedIdValue()) store.select(null);
        if (isDrawingKind(ref.current.activeTool)) ref.current.setActiveTool("cursor");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && store.selectedIdValue()) {
        e.preventDefault();
        store.remove(store.selectedIdValue()!);
        return;
      }
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo(); else store.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); store.redo(); return; }
      if (meta && e.key.toLowerCase() === "c" && store.selectedIdValue()) {
        store.copy(store.selectedIdValue()!);
        return;
      }
      if (meta && e.key.toLowerCase() === "v" && store.hasClipboard()) {
        e.preventDefault();
        store.paste();
        return;
      }
      if (meta && e.key.toLowerCase() === "d" && store.selectedIdValue()) {
        e.preventDefault();
        store.duplicate(store.selectedIdValue()!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, enabled]);

  return { drawings: version, store, menu, closeMenu };
}
