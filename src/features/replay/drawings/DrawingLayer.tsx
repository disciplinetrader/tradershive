/**
 * DrawingLayer — canvas overlay that renders and manages drawings on top of
 * the Replay chart. All coordinates roundtrip through the chart adapter so
 * shapes remain aligned after zoom, pan, resize, and rail-resize.
 *
 * Pointer interaction model:
 *   • cursor mode: click to select; drag anchors to move; drag body to translate.
 *   • tool mode: mousedown seeds anchor A; mousemove previews; mouseup commits.
 *   • ESC cancels an in-progress draft.
 *
 * The overlay listens to a rAF loop while the adapter reports it needs a
 * repaint (visible-range changes emit a repaint tick). It never triggers a
 * React re-render on mouse-move; only reducer actions mutate state.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChartAdapter } from "@/lib/chart/adapter";
import { FIB_LEVELS, type Anchor, type Drawing } from "./types";
import { makeId, useDrawings } from "./store";

type Props = {
  adapter: ChartAdapter | null;
  host: HTMLElement | null;
};

type DragMode =
  | { kind: "none" }
  | { kind: "draft"; a: Anchor; b: Anchor }
  | { kind: "move"; id: string; grabT: number; grabP: number; original: Drawing }
  | { kind: "anchor"; id: string; which: "a" | "b" };

export function DrawingLayer({ adapter, host }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragMode>({ kind: "none" });
  const [, forcePaint] = useState(0);
  const {
    tool, drawings, selectedId,
    addDrawing, updateDrawing, removeDrawing, select, setTool,
  } = useDrawings();

  // Repaint on window resize + rAF loop while adapter present (cheap).
  useEffect(() => {
    if (!adapter) return;
    let raf = 0;
    const loop = () => { forcePaint((n) => (n + 1) & 0xffff); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [adapter]);

  // Fit canvas to host (DPR aware).
  useLayoutEffect(() => {
    if (!host || !canvasRef.current) return;
    const cvs = canvasRef.current;
    const ro = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.max(1, Math.floor(rect.width * dpr));
      cvs.height = Math.max(1, Math.floor(rect.height * dpr));
      cvs.style.width = `${rect.width}px`;
      cvs.style.height = `${rect.height}px`;
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [host]);

  // Project a (time, price) anchor to pixels.
  const project = useCallback(
    (a: Anchor): { x: number; y: number } | null => {
      if (!adapter) return null;
      const x = adapter.timeToX(a.t);
      const y = adapter.priceToY(a.p);
      if (x == null || y == null) return null;
      return { x, y };
    },
    [adapter],
  );

  // Convert pointer to (time, price).
  const unproject = useCallback(
    (evt: PointerEvent | React.PointerEvent): Anchor | null => {
      if (!adapter || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (evt as PointerEvent).clientX - rect.left;
      const y = (evt as PointerEvent).clientY - rect.top;
      const t = adapter.xToTime(x);
      const p = adapter.yToPrice(y);
      if (t == null || p == null) return null;
      return { t, p };
    },
    [adapter],
  );

  // ── PAINT ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cvs.width / dpr, cvs.height / dpr);

    for (const d of drawings) drawShape(ctx, d, project, d.id === selectedId);

    if (dragRef.current.kind === "draft" && tool !== "cursor") {
      const draft = draftFromTool(tool, dragRef.current.a, dragRef.current.b);
      if (draft) drawShape(ctx, draft, project, true);
    }
  });

  // ── HIT TEST ──────────────────────────────────────────────────────────
  const hitTest = useCallback(
    (x: number, y: number): { id: string; where: "body" | "a" | "b" } | null => {
      const ANCHOR_R = 8;
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        const pa = "a" in d ? project(d.a) : null;
        const pb = "b" in d ? project(d.b) : null;
        if (pa && Math.hypot(pa.x - x, pa.y - y) < ANCHOR_R) return { id: d.id, where: "a" };
        if (pb && Math.hypot(pb.x - x, pb.y - y) < ANCHOR_R) return { id: d.id, where: "b" };
        if (hitBody(d, x, y, project)) return { id: d.id, where: "body" };
      }
      return null;
    },
    [drawings, project],
  );

  // ── POINTER HANDLING ──────────────────────────────────────────────────
  const onPointerDown = (evt: React.PointerEvent) => {
    if (!adapter) return;
    const anchor = unproject(evt);
    if (!anchor) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    (evt.target as HTMLElement).setPointerCapture(evt.pointerId);

    if (tool === "cursor") {
      const hit = hitTest(x, y);
      if (!hit) { select(null); return; }
      select(hit.id);
      const d = drawings.find((x) => x.id === hit.id)!;
      if (hit.where === "a" || hit.where === "b") {
        dragRef.current = { kind: "anchor", id: d.id, which: hit.where };
      } else {
        dragRef.current = { kind: "move", id: d.id, grabT: anchor.t, grabP: anchor.p, original: d };
      }
      return;
    }
    dragRef.current = { kind: "draft", a: anchor, b: anchor };
  };

  const onPointerMove = (evt: React.PointerEvent) => {
    const anchor = unproject(evt);
    if (!anchor) return;
    const drag = dragRef.current;
    if (drag.kind === "draft") {
      dragRef.current = { ...drag, b: anchor };
    } else if (drag.kind === "anchor") {
      updateDrawing(drag.id, { [drag.which]: anchor } as any);
    } else if (drag.kind === "move") {
      const dt = anchor.t - drag.grabT;
      const dp = anchor.p - drag.grabP;
      const orig = drag.original;
      const patch: any = {};
      if ("a" in orig) patch.a = { t: orig.a.t + dt, p: orig.a.p + dp };
      if ("b" in orig) patch.b = { t: (orig as any).b.t + dt, p: (orig as any).b.p + dp };
      updateDrawing(drag.id, patch);
    }
  };

  const onPointerUp = (evt: React.PointerEvent) => {
    const anchor = unproject(evt);
    const drag = dragRef.current;
    if (drag.kind === "draft" && anchor && tool !== "cursor") {
      const drawing = draftFromTool(tool, drag.a, anchor);
      if (drawing) addDrawing(drawing);
      setTool("cursor");
    }
    dragRef.current = { kind: "none" };
  };

  // ESC cancels draft; Delete removes selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        if (dragRef.current.kind === "draft") { dragRef.current = { kind: "none" }; setTool("cursor"); }
        else if (tool !== "cursor") setTool("cursor");
        else if (selectedId) select(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        removeDrawing(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selectedId, setTool, select, removeDrawing]);

  const cursorClass = useMemo(() => {
    if (tool !== "cursor") return "cursor-crosshair";
    return "cursor-default";
  }, [tool]);

  // When cursor tool is active AND no drawing under pointer, let chart events
  // pass through (pan/zoom). We keep pointer-events on always for hit-testing;
  // the trade-off is that chart panning through the overlay is disabled while
  // the drawing layer is armed. Users toggle back to Cursor to pan the chart
  // freely — matches TradingView's default behaviour.
  const passthrough = tool === "cursor" && !drawings.length;

  return (
    <canvas
      ref={canvasRef}
      aria-label="Drawing overlay"
      className={`absolute inset-0 z-20 ${cursorClass} ${passthrough ? "pointer-events-none" : "pointer-events-auto"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = { kind: "none" }; }}
    />
  );
}

function draftFromTool(tool: string, a: Anchor, b: Anchor): Drawing | null {
  const base = { id: makeId(), createdAt: Date.now() };
  switch (tool) {
    case "trend_line": return { ...base, kind: "trend_line", a, b };
    case "horizontal_ray": return { ...base, kind: "horizontal_ray", a };
    case "rectangle": return { ...base, kind: "rectangle", a, b };
    case "fibonacci": return { ...base, kind: "fibonacci", a, b };
    default: return null;
  }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  project: (a: Anchor) => { x: number; y: number } | null,
  selected: boolean,
) {
  ctx.save();
  const primary = d.color ?? "#60a5fa";
  ctx.strokeStyle = primary;
  ctx.fillStyle = primary;
  ctx.lineWidth = selected ? 2 : 1.25;

  if (d.kind === "trend_line") {
    const pa = project(d.a); const pb = project(d.b);
    if (pa && pb) {
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      if (selected) { anchorDot(ctx, pa); anchorDot(ctx, pb); }
    }
  } else if (d.kind === "horizontal_ray") {
    const pa = project(d.a);
    if (pa) {
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(ctx.canvas.width, pa.y); ctx.stroke();
      if (selected) anchorDot(ctx, pa);
    }
  } else if (d.kind === "rectangle") {
    const pa = project(d.a); const pb = project(d.b);
    if (pa && pb) {
      const x = Math.min(pa.x, pb.x); const y = Math.min(pa.y, pb.y);
      const w = Math.abs(pb.x - pa.x); const h = Math.abs(pb.y - pa.y);
      ctx.globalAlpha = 0.12; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1; ctx.strokeRect(x, y, w, h);
      if (selected) { anchorDot(ctx, pa); anchorDot(ctx, pb); }
    }
  } else if (d.kind === "fibonacci") {
    const pa = project(d.a); const pb = project(d.b);
    if (pa && pb) {
      const range = d.b.p - d.a.p;
      ctx.font = "10px ui-sans-serif, system-ui";
      for (const lvl of FIB_LEVELS) {
        const price = d.a.p + range * lvl;
        const py = project({ t: d.a.t, p: price })?.y;
        if (py == null) continue;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(Math.min(pa.x, pb.x), py); ctx.lineTo(Math.max(pa.x, pb.x), py); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(`${(lvl * 100).toFixed(1)}%`, Math.max(pa.x, pb.x) + 4, py - 2);
      }
      if (selected) { anchorDot(ctx, pa); anchorDot(ctx, pb); }
    }
  }
  ctx.restore();
}

function anchorDot(ctx: CanvasRenderingContext2D, p: { x: number; y: number }) {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#0ea5e9";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function hitBody(d: Drawing, x: number, y: number, project: (a: Anchor) => { x: number; y: number } | null): boolean {
  const TOL = 6;
  if (d.kind === "trend_line" || d.kind === "fibonacci") {
    const pa = project(d.a); const pb = project(d.b);
    if (!pa || !pb) return false;
    return distToSegment(x, y, pa.x, pa.y, pb.x, pb.y) < TOL;
  }
  if (d.kind === "horizontal_ray") {
    const pa = project(d.a);
    if (!pa) return false;
    return Math.abs(y - pa.y) < TOL && x >= pa.x;
  }
  if (d.kind === "rectangle") {
    const pa = project(d.a); const pb = project(d.b);
    if (!pa || !pb) return false;
    const xMin = Math.min(pa.x, pb.x), xMax = Math.max(pa.x, pb.x);
    const yMin = Math.min(pa.y, pb.y), yMax = Math.max(pa.y, pb.y);
    // Edge hit for outline-only rectangle
    const onEdge = (
      (Math.abs(x - xMin) < TOL || Math.abs(x - xMax) < TOL) && y >= yMin - TOL && y <= yMax + TOL
    ) || (
      (Math.abs(y - yMin) < TOL || Math.abs(y - yMax) < TOL) && x >= xMin - TOL && x <= xMax + TOL
    );
    return onEdge;
  }
  return false;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
