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
import { isTypingTarget } from "@/lib/chart/keyboard";
import type { Candle } from "@/lib/market-data/types";
import { DrawingStore, makeDrawing } from "@/lib/chart/drawings/store";
import {
  anchorAt, drawDrawing, hitTest, moveAnchor, pickDrawingAt, translateDrawing,
} from "@/lib/chart/drawings/render";
import {
  FREEHAND_KINDS, SINGLE_CLICK_KINDS, sanitizeDrawingText, tickFromPrecision,
  type Drawing, type DrawingKind, type DrawingPoint, type DrawingStyle, type ToolId,
} from "@/lib/chart/drawings/types";

/**
 * Inline text authoring session. `id` is present when an existing drawing is
 * being edited; absent while a brand-new label is being typed (nothing is
 * added to the store until the text is confirmed and non-empty).
 */
export interface TextEditorState {
  id: string | null;
  point: DrawingPoint;
  /** Anchor position in chart-element pixels, for placing the input. */
  x: number;
  y: number;
  value: string;
  fontSize: number;
  align: "left" | "center" | "right";
}


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

/** Default reward-to-risk applied to a freshly created position tool. */
const DEFAULT_POSITION_RR = 2;
const ATR_PERIOD = 14;

/**
 * ATR of the loaded candles — the preferred seed for a position tool's stop
 * distance, so the initial box is sized to the instrument's real volatility
 * instead of an arbitrary percentage.
 */
function averageTrueRange(candles?: Candle[]): number | null {
  if (!candles || candles.length < 2) return null;
  const slice = candles.slice(-(ATR_PERIOD + 1));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1], cur = slice[i];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    if (Number.isFinite(tr) && tr > 0) { sum += tr; n++; }
  }
  return n ? sum / n : null;
}


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
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const pendingCancelRef = useRef<(() => void) | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // The pointer layer reads this synchronously to know an editor is open.
  const textEditorRef = useRef<TextEditorState | null>(null);
  textEditorRef.current = textEditor;

  const ref = useRef({ activeTool, keepToolActive, magnet, candles, style, onPositionDrawn, setActiveTool });
  ref.current = { activeTool, keepToolActive, magnet, candles, style, onPositionDrawn, setActiveTool };

  // Tick size for price-handle snapping — read synchronously during drags so
  // a precision change never needs to rebuild the pointer listeners.
  const tickRef = useRef(tickFromPrecision(pricePrecision));
  /** Live Ctrl-drag rubber band, in canvas pixels. Painted by the draw source. */
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  tickRef.current = tickFromPrecision(pricePrecision);

  /** Discard an in-flight text session without touching the store. */
  const cancelTextEditor = useCallback(() => {
    setTextEditor(null);
    if (isDrawingKind(ref.current.activeTool)) ref.current.setActiveTool("cursor");
  }, []);

  /**
   * Confirm a text session. Empty (or whitespace-only) input never creates a
   * drawing and deletes the one being edited, so the chart can't accumulate
   * invisible objects. Text is sanitised and clamped before it is stored.
   */
  const commitTextEditor = useCallback(
    (raw: string) => {
      const session = textEditorRef.current;
      if (!session) return;
      const text = sanitizeDrawingText(raw);
      setTextEditor(null);
      if (session.id) {
        if (!text) { store.remove(session.id); }
        else {
          const existing = store.list().find((d) => d.id === session.id);
          if (existing) {
            store.beginEdit();
            store.patch(session.id, { style: { ...existing.style, text } });
            store.commit();
          }
        }
      } else if (text) {
        store.add(
          makeDrawing("text", [session.point], {
            ...ref.current.style,
            text,
            fontSize: session.fontSize,
            textAlign: session.align,
          }),
        );
      }
      if (!ref.current.keepToolActive && isDrawingKind(ref.current.activeTool)) {
        ref.current.setActiveTool("cursor");
      }
    },
    [store],
  );

  /** Style tweaks applied live from the editor toolbar. */
  const updateTextEditor = useCallback((patch: Partial<TextEditorState>) => {
    setTextEditor((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);



  // ── Register the paint source ────────────────────────────────────────
  useEffect(() => {
    if (!adapter?.setDrawingsSource) return;
    adapter.setPriceFormatter?.((p) => p.toFixed(pricePrecision));
    adapter.setDrawingsSource({
      draw(ctx, coords) {
        const hoveredId = store.hoveredIdValue();
        for (const d of store.list()) {
          const selected = store.isSelected(d.id);
          drawDrawing(ctx, coords, d, {
            selected,
            hovered: d.id === hoveredId && !selected,
          });
        }
        if (store.draft) drawDrawing(ctx, coords, store.draft, { ghost: true });
        const m = marqueeRef.current;
        if (m) {
          const x = Math.min(m.x1, m.x2);
          const y = Math.min(m.y1, m.y2);
          const w = Math.abs(m.x2 - m.x1);
          const h = Math.abs(m.y2 - m.y1);
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
          ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
        }
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
      | { mode: "anchor"; id: string; anchorId: string }
      | { mode: "marquee"; downX: number; downY: number };

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

    /** Median bar step of the loaded series — used for default time spans. */
    const barStep = () => {
      const cs = ref.current.candles;
      if (!cs || cs.length < 2) return 60_000;
      const step = cs[cs.length - 1].time - cs[cs.length - 2].time;
      return step > 0 ? step : 60_000;
    };

    /**
     * Intelligent defaults for a fresh position tool, expressed purely in
     * chart-domain units — never pixels:
     *   • span — 30 bars of the loaded series, clamped so the box never
     *     exceeds 80% of the visible time range on a very tight viewport.
     *   • risk — max(1 × ATR, 2% of the visible price range), falling back to
     *     0.5% of price when neither is available.
     * These are read once at creation time and then owned by the user — no
     * redraw ever recomputes them.
     */
    const DEFAULT_POSITION_BARS = 30;

    const positionDefaults = (entryPrice: number) => {
      const coords = adapter.getCoords?.();
      let span = barStep() * DEFAULT_POSITION_BARS;
      let visibleRange = 0;
      if (coords) {
        const t0 = coords.timeAt(0);
        const t1 = coords.timeAt(coords.width);
        if (t0 != null && t1 != null && t1 > t0) span = Math.min(span, (t1 - t0) * 0.8);
        const top = coords.priceAt(0);
        const bottom = coords.priceAt(coords.height);
        if (top != null && bottom != null) visibleRange = Math.abs(top - bottom);
      }
      const atr = averageTrueRange(ref.current.candles) ?? 0;
      let risk = Math.max(atr, visibleRange * 0.02);
      if (!(risk > 0)) risk = Math.abs(entryPrice) * 0.005;
      return { span: span > 0 ? span : barStep() * DEFAULT_POSITION_BARS, risk };
    };

    const seedPoints = (kind: DrawingKind, a: DrawingPoint, b: DrawingPoint): DrawingPoint[] => {
      if (kind === "long_position" || kind === "short_position") {
        const { span, risk } = positionDefaults(a.price);
        const dir = kind === "long_position" ? 1 : -1;
        // The end anchor is a *timestamp*, never a pixel width. The second
        // click sets the span explicitly once it clears ~3 bars; anything
        // shorter keeps the intelligent default so the preview is usable
        // from the very first mouse move.
        const dragged = b.time - a.time;
        const end = dragged > barStep() * 3 ? b.time : a.time + span;

        return [
          { time: a.time, price: a.price },
          { time: end, price: a.price + dir * risk * DEFAULT_POSITION_RR },
          { time: end, price: a.price - dir * risk },
        ];
      }
      if (kind === "triangle") {
        return [a, b, { time: a.time, price: b.price }];
      }
      return [a, b];
    };


    /** Open the inline editor for a new label, or an existing one. */
    const openTextEditor = (pt: DrawingPoint, px: number, py: number, existing?: Drawing) => {
      setTextEditor({
        id: existing?.id ?? null,
        point: existing ? existing.points[0] : pt,
        x: px,
        y: py,
        value: existing?.style.text ?? "",
        fontSize: existing?.style.fontSize ?? ref.current.style?.fontSize ?? 14,
        align: existing?.style.textAlign ?? "left",
      });
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { activeTool: tool } = ref.current;
      const { px, py } = localPoint(e);
      const pt = toPoint(px, py);
      if (!pt) return;
      const coords = adapter.getCoords?.();

      // A click anywhere while typing confirms the label first — the click is
      // consumed so it can't also drop a second label underneath.
      if (textEditorRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

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
        // Text is authored in an inline editor: nothing is committed to the
        // store until the trader confirms non-empty content.
        if (tool === "text") {
          pointerId = null;
          openTextEditor(pt, px, py);
          return;
        }
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

      // Ctrl / ⌘ + drag starts a marquee: everything inside is selected so it
      // can be deleted in one keystroke.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        pointerId = e.pointerId;
        session = { mode: "marquee", downX: px, downY: py };
        marqueeRef.current = { x1: px, y1: py, x2: px, y2: py };
        adapter.requestDrawingsRepaint?.();
        return;
      }

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

    /**
     * Cursor + hover affordance so the trader always knows what the next
     * click will do: crosshair while authoring, resize over an endpoint,
     * move over the body of a drawing, default over empty chart.
     */
    const setCursor = (value: string) => {
      if (el.style.cursor !== value) el.style.cursor = value;
    };

    /** Cursor hint matching the axis a drawing is allowed to move on. */
    const dragCursor = (d: Drawing) =>
      d.kind === "horizontal_line" ? "ns-resize" : d.kind === "vertical_line" ? "ew-resize" : "move";

    const updateHover = (px: number, py: number, inside: boolean) => {
      if (session) return;
      const tool = ref.current.activeTool;
      if (!inside) { store.setHovered(null); return; }
      if (isDrawingKind(tool) || pending) { store.setHovered(null); setCursor("crosshair"); return; }
      const coords = adapter.getCoords?.();
      if (!coords) return;
      const selected = store.selected();
      if (selected && !selected.locked && anchorAt(selected, coords, px, py)) {
        store.setHovered(selected.id);
        setCursor(dragCursor(selected) === "move" ? "nwse-resize" : dragCursor(selected));
        return;
      }
      const list = store.list();
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        if (d.hidden) continue;
        if (hitTest(d, coords, px, py)) {
          store.setHovered(d.id);
          setCursor(d.locked ? "not-allowed" : dragCursor(d));
          return;
        }
      }
      store.setHovered(null);
      setCursor(tool === "crosshair" ? "crosshair" : "");
    };


    const onMove = (e: PointerEvent) => {
      const s = session;
      const { px, py } = localPoint(e);
      const r = rectOf();
      updateHover(px, py, px >= 0 && py >= 0 && px <= r.width && py <= r.height);

      // Live preview between the first and second click.
      if (!s && pending) {
        const pt = toPoint(px, py);
        if (!pt) return;
        store.draft = makeDrawing(pending.kind, seedPoints(pending.kind, pending.origin, pt), ref.current.style);
        adapter.requestDrawingsRepaint?.();
        return;
      }


      if (!s || (pointerId != null && e.pointerId !== pointerId)) return;

      // Ctrl-drag marquee: purely a pixel-space rubber band, no chart data.
      if (s.mode === "marquee") {
        e.preventDefault();
        e.stopPropagation();
        marqueeRef.current = { x1: s.downX, y1: s.downY, x2: px, y2: py };
        adapter.requestDrawingsRepaint?.();
        return;
      }

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
        store.patch(d.id, { points: translateDrawing(d, dTime, dPrice, { tick: tickRef.current }) });
        return;
      }
      store.patch(d.id, { points: moveAnchor(d, s.anchorId, pt, { tick: tickRef.current }) });
    };

    const onUp = (e: PointerEvent) => {
      if (!session || (pointerId != null && e.pointerId !== pointerId)) return;
      const current = session;
      session = null;
      pointerId = null;

      if (current.mode === "marquee") {
        const m = marqueeRef.current;
        marqueeRef.current = null;
        const coords = adapter.getCoords?.();
        if (!m || !coords) { adapter.requestDrawingsRepaint?.(); return; }
        const left = Math.min(m.x1, m.x2), right = Math.max(m.x1, m.x2);
        const top = Math.min(m.y1, m.y2), bottom = Math.max(m.y1, m.y2);
        // A stray ctrl-click shouldn't wipe the selection with a 1px box.
        if (right - left < 4 && bottom - top < 4) { store.clearSelection(); return; }
        const hits = store.list().filter((d) => {
          if (d.hidden) return false;
          return d.points.some((p) => {
            const x = coords.x(p.time);
            const y = coords.y(p.price);
            if (x == null || y == null) return false;
            return x >= left && x <= right && y >= top && y <= bottom;
          });
        });
        store.selectMany(hits.map((d) => d.id));
        return;
      }

      if (current.mode === "create") {

        const draft = store.draft;
        if (!draft) return;
        // Position tools follow the same two-click contract as trend lines:
        // click one fixes Entry, the preview follows the cursor, click two
        // fixes the time span (SL/TP come from the risk defaults).
        if (!current.moved && !FREEHAND_KINDS.includes(draft.kind)) {

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
      // Default browser menu is suppressed ONLY when a drawing is actually
      // hit, so right-clicking empty chart space keeps native behaviour.
      const d = pickDrawingAt(store.list(), coords, px, py);
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      store.select(d.id);
      // clientX/clientY are viewport coordinates — the menu is `position:
      // fixed`, so no scroll/canvas-offset correction is needed.
      setMenu({ id: d.id, x: e.clientX, y: e.clientY });
    };

    /** Double-click a text label to edit it in place. */
    const onDoubleClick = (e: MouseEvent) => {
      const coords = adapter.getCoords?.();
      if (!coords || textEditorRef.current) return;
      const r = rectOf();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const list = store.list();
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        if (d.hidden || d.locked || d.kind !== "text") continue;
        if (hitTest(d, coords, px, py)) {
          e.preventDefault();
          e.stopPropagation();
          store.select(d.id);
          const x = coords.x(d.points[0].time);
          const y = coords.y(d.points[0].price);
          openTextEditor(d.points[0], x ?? px, y ?? py, d);
          return;
        }
      }
    };

    el.addEventListener("pointerdown", onDown, { capture: true });
    el.addEventListener("contextmenu", onContext, { capture: true });
    el.addEventListener("dblclick", onDoubleClick, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      el.removeEventListener("pointerdown", onDown, { capture: true } as any);
      el.removeEventListener("contextmenu", onContext, { capture: true } as any);
      el.removeEventListener("dblclick", onDoubleClick, { capture: true } as any);
      window.removeEventListener("pointermove", onMove, { capture: true } as any);
      window.removeEventListener("pointerup", onUp, { capture: true } as any);
      pendingCancelRef.current = null;
      store.draft = null;
      store.setHovered(null);
      el.style.cursor = "";
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
      // Two independent guards: the focused element, and an open text session.
      // Either one means the trader is typing, so Delete/Backspace must never
      // remove the selected drawing and Escape belongs to the editor.
      if (isTypingTarget(e.target)) return;
      if (textEditorRef.current) return;
      const meta = e.metaKey || e.ctrlKey;


      if (e.key === "Escape") {
        setMenu(null);
        store.setHovered(null);
        pendingCancelRef.current?.();
        if (store.draft) { store.draft = null; store.commit(); }
        store.clearSelection();
        if (isDrawingKind(ref.current.activeTool)) ref.current.setActiveTool("cursor");
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = store.selectionIds();
        if (!ids.length) return;
        e.preventDefault();
        store.removeMany(ids);
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

  return {
    drawings: version, store, menu, closeMenu,
    textEditor, commitTextEditor, cancelTextEditor, updateTextEditor,
  };

}
