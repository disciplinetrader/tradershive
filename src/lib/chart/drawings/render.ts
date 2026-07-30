/**
 * Canvas renderer + hit-testing for chart drawings.
 *
 * Pure functions: they receive the chart's live coordinate converters and
 * paint in media pixels. No DOM, no React, no cached pixel state — that is
 * what keeps every object anchored to time/price under zoom, pan, rescale,
 * resize and timeframe changes.
 */

import { axisLockFor, TEXT_LIMITS, textLines } from "./types";
import type { ChartCoords, Drawing, DrawingPoint } from "./types";

/** Line height multiplier shared by the renderer and the inline editor. */
export const TEXT_LINE_HEIGHT = 1.25;

/**
 * Shared offscreen context used only to measure text during hit-testing.
 * Created lazily and reused, so hover never allocates a canvas per frame.
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    measureCtx = typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  } catch { measureCtx = null; }
  return measureCtx;
}


export const textFontSize = (size: number | undefined) =>
  Math.min(TEXT_LIMITS.maxFontSize, Math.max(TEXT_LIMITS.minFontSize, Number(size) || 12));

export const textFont = (size: number) =>
  `600 ${size}px ui-sans-serif, system-ui, sans-serif`;

/**
 * Pixel box of a text drawing, measured from the same font the renderer uses.
 * Selection, hover and hit-testing all read this, so a one-word label is not
 * clickable across 140px of empty chart and a long label stays fully grabbable.
 */
export function textBox(d: Drawing, c: ChartCoords, ctx?: CanvasRenderingContext2D | null) {
  const x = c.x(d.points[0]?.time ?? NaN);
  const y = c.y(d.points[0]?.price ?? NaN);
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const lines = textLines(d.style.text);
  const rows = lines.length ? lines : ["Text"];
  const size = textFontSize(d.style.fontSize);
  let widest = 0;
  if (ctx) {
    const prev = ctx.font;
    ctx.font = textFont(size);
    for (const line of rows) widest = Math.max(widest, ctx.measureText(line).width);
    ctx.font = prev;
  } else {
    // Headless fallback (tests / no canvas): approximate advance width.
    for (const line of rows) widest = Math.max(widest, line.length * size * 0.58);
  }
  const height = rows.length * size * TEXT_LINE_HEIGHT;
  const align = d.style.textAlign ?? "left";
  const left = align === "center" ? x - widest / 2 : align === "right" ? x - widest : x;
  return { left, top: y - height / 2, width: widest, height, x, y };
}


/**
 * Axis-anchored helpers.
 *
 * A Horizontal Line stores a price and nothing else that matters, so its
 * pixel row is derived from `c.y(price)` alone — the stored time is never
 * consulted. A Vertical Line is the mirror image: only `c.x(time)` matters.
 * That is what makes them immune to price-scale changes / timeframe swaps
 * on the axis they don't own.
 */
function rowOf(d: Drawing, c: ChartCoords): number | null {
  const y = c.y(d.points[0]?.price ?? NaN);
  return y == null || !Number.isFinite(y) ? null : y;
}

function columnOf(d: Drawing, c: ChartCoords): number | null {
  const x = c.x(d.points[0]?.time ?? NaN);
  return x == null || !Number.isFinite(x) ? null : x;
}

function formatTimeLabel(timeMs: number) {
  const dt = new Date(timeMs);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString(undefined, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}


export interface Anchor {
  id: string;
  x: number;
  y: number;
}

const HIT_TOLERANCE = 6;
const ANCHOR_R = 3.5;

const FIB_RETRACEMENT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXTENSION = [0, 0.618, 1, 1.272, 1.618, 2.618];

function withAlpha(color: string, alpha: number) {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function dash(ctx: CanvasRenderingContext2D, style: number) {
  ctx.setLineDash(style === 1 ? [6, 4] : style === 2 ? [2, 3] : []);
}

/** Project a drawing's points; returns null when a point can't be mapped. */
function project(d: Drawing, c: ChartCoords) {
  const pts = d.points.map((p) => {
    const x = c.x(p.time);
    const y = c.y(p.price);
    return x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y };
  });
  return pts;
}

function lineThroughEdges(x1: number, y1: number, x2: number, y2: number, width: number) {
  const dx = x2 - x1;
  if (Math.abs(dx) < 0.0001) return { ax: x1, ay: -1e5, bx: x2, by: 1e5 };
  const slope = (y2 - y1) / dx;
  return { ax: 0, ay: y1 + slope * (0 - x1), bx: width, by: y1 + slope * (width - x1) };
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11) {
  ctx.save();
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(10, 13, 20, 0.82)";
  ctx.beginPath();
  const rx = x, ry = y - size - 4, rw = w + 10, rh = size + 8;
  const r = 3;
  ctx.moveTo(rx + r, ry);
  ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
  ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
  ctx.arcTo(rx, ry + rh, rx, ry, r);
  ctx.arcTo(rx, ry, rx + rw, ry, r);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, rx + 5, ry + rh / 2);
  ctx.restore();
}

export function drawDrawing(
  ctx: CanvasRenderingContext2D,
  c: ChartCoords,
  d: Drawing,
  opts: { selected?: boolean; hovered?: boolean; ghost?: boolean } = {},
) {
  if (d.hidden) return;
  const pts = project(d, c);
  const s = d.style;
  ctx.save();
  ctx.globalAlpha = opts.ghost ? 0.7 : 1;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  // Active/hover affordance: a soft glow in the object's own colour plus a
  // slightly heavier stroke. Never applied to idle objects, so the chart
  // stays calm until the pointer actually touches something.
  if (opts.selected || opts.hovered) {
    ctx.shadowColor = withAlpha(s.color, opts.selected ? 0.9 : 0.6);
    ctx.shadowBlur = opts.selected ? 10 : 7;
  }
  ctx.lineWidth = s.width + (opts.selected ? 1 : opts.hovered ? 0.75 : 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  dash(ctx, s.lineStyle);

  const p0 = pts[0];
  const p1 = pts[1];

  switch (d.kind) {
    case "horizontal_line": {
      // Price-only anchor: derived from y(price), never from the stored time.
      const y = rowOf(d, c);
      if (y == null) break;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(c.width, y);
      ctx.stroke();
      if (s.showLabel !== false) {
        label(ctx, s.text || c.formatPrice(d.points[0].price), c.width - 80, y - 2, s.color, s.fontSize);
      }
      break;
    }
    case "horizontal_ray": {
      if (!p0) break;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(c.width, p0.y);
      ctx.stroke();
      if (s.showLabel !== false) {
        label(ctx, c.formatPrice(d.points[0].price), c.width - 80, p0.y - 2, s.color);
      }
      break;
    }
    case "vertical_line": {
      // Time-only anchor: derived from x(time), never from the stored price.
      const x = columnOf(d, c);
      if (x == null) break;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, c.height);
      ctx.stroke();
      if (s.showLabel !== false) {
        const text = s.text || formatTimeLabel(d.points[0].time);
        if (text) label(ctx, text, x + 4, c.height - 6, s.color, s.fontSize);
      }
      break;
    }

    case "trend_line":
    case "ray":
    case "extended_line":
    case "arrow": {
      if (!p0 || !p1) break;
      ctx.beginPath();
      if (d.kind === "extended_line") {
        const e = lineThroughEdges(p0.x, p0.y, p1.x, p1.y, c.width);
        ctx.moveTo(e.ax, e.ay);
        ctx.lineTo(e.bx, e.by);
      } else if (d.kind === "ray") {
        const dx = p1.x - p0.x;
        const scale = dx === 0 ? 1 : (dx > 0 ? c.width - p0.x : -p0.x) / dx;
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p0.x + dx * scale, p0.y + (p1.y - p0.y) * scale);
      } else {
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
      ctx.stroke();
      if (d.kind === "arrow") {
        const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const h = 10 + s.width * 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - h * Math.cos(ang - Math.PI / 7), p1.y - h * Math.sin(ang - Math.PI / 7));
        ctx.lineTo(p1.x - h * Math.cos(ang + Math.PI / 7), p1.y - h * Math.sin(ang + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "rectangle": {
      if (!p0 || !p1) break;
      const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
      ctx.fillStyle = withAlpha(s.color, s.fillOpacity);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      if (!p0 || !p1) break;
      const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(s.color, s.fillOpacity);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "triangle": {
      if (!p0 || !p1) break;
      ctx.beginPath();
      ctx.moveTo((p0.x + p1.x) / 2, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p0.x, p1.y);
      ctx.closePath();
      ctx.fillStyle = withAlpha(s.color, s.fillOpacity);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "brush": {
      const valid = pts.filter(Boolean) as { x: number; y: number }[];
      if (valid.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(valid[0].x, valid[0].y);
      for (let i = 1; i < valid.length; i++) ctx.lineTo(valid[i].x, valid[i].y);
      ctx.stroke();
      break;
    }
    case "text": {
      if (!p0) break;
      const lines = textLines(s.text);
      // An empty text object is never persisted, but a legacy row could still
      // carry one — render the placeholder so it stays selectable/deletable.
      const rows = lines.length ? lines : ["Text"];
      const size = textFontSize(s.fontSize);
      ctx.font = textFont(size);
      ctx.textBaseline = "middle";
      ctx.textAlign = s.textAlign ?? "left";
      ctx.fillStyle = s.color;
      const lh = size * TEXT_LINE_HEIGHT;
      // Anchor is the vertical centre of the block, so multi-line text grows
      // symmetrically around the clicked price instead of drifting downward.
      const top = p0.y - ((rows.length - 1) * lh) / 2;
      rows.forEach((line, i) => ctx.fillText(line, p0.x, top + i * lh));
      ctx.textAlign = "left";
      break;
    }

    case "price_label": {
      if (!p0) break;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p0.x + 14, p0.y);
      ctx.stroke();
      label(ctx, s.text || c.formatPrice(d.points[0].price), p0.x + 16, p0.y + 6, s.color, s.fontSize);
      break;
    }
    case "fib_retracement":
    case "fib_extension": {
      if (!p0 || !p1) break;
      const levels = d.kind === "fib_retracement" ? FIB_RETRACEMENT : FIB_EXTENSION;
      const a = d.points[0].price, b = d.points[1].price;
      const left = Math.min(p0.x, p1.x);
      const right = s.extendRight === false ? Math.max(p0.x, p1.x) : c.width;
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      let prevY: number | null = null;
      levels.forEach((lvl, i) => {
        const price = a + (b - a) * lvl;
        const y = c.y(price);
        if (y == null) return;
        if (prevY != null && s.fillOpacity > 0) {
          ctx.fillStyle = withAlpha(s.color, i % 2 === 0 ? s.fillOpacity * 0.4 : s.fillOpacity * 0.15);
          ctx.fillRect(left, Math.min(prevY, y), right - left, Math.abs(y - prevY));
        }
        ctx.strokeStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = s.color;
        ctx.textBaseline = "bottom";
        ctx.fillText(`${lvl.toFixed(3)}  ${c.formatPrice(price)}`, left + 4, y - 2);
        prevY = y;
      });
      ctx.lineWidth = s.width;
      dash(ctx, s.lineStyle);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      break;
    }
    case "measure":
    case "price_range":
    case "date_range": {
      if (!p0 || !p1) break;
      const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
      const up = d.points[1].price >= d.points[0].price;
      const tone = up ? "#22c55e" : "#ef4444";
      ctx.fillStyle = withAlpha(tone, 0.12);
      ctx.strokeStyle = tone;
      if (d.kind !== "date_range") ctx.fillRect(x, y, w, h);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, w, Math.max(h, 1));
      ctx.setLineDash([]);
      const diff = d.points[1].price - d.points[0].price;
      const pct = d.points[0].price ? (diff / d.points[0].price) * 100 : 0;
      const bars = Math.abs(d.points[1].time - d.points[0].time);
      const mins = Math.round(bars / 60000);
      const parts: string[] = [];
      if (d.kind !== "date_range") parts.push(`${diff >= 0 ? "+" : ""}${c.formatPrice(diff)} (${pct.toFixed(2)}%)`);
      if (d.kind !== "price_range") parts.push(mins >= 1440 ? `${(mins / 1440).toFixed(1)}d` : mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`);
      label(ctx, parts.join("  ·  "), x + w / 2 - 50, y - 4, "#e2e8f0");
      break;
    }
    case "long_position":
    case "short_position": {
      const entry = pts[0], target = pts[1], stop = pts[2];
      if (!entry || !target || !stop) break;
      const x1 = entry.x;
      const x2 = Math.max(target.x, x1 + 40);
      const green = "#22c55e";
      const red = "#ef4444";
      const rewardTone = green;
      const riskTone = red;
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha(rewardTone, 0.16);
      ctx.fillRect(x1, Math.min(entry.y, target.y), x2 - x1, Math.abs(target.y - entry.y));
      ctx.fillStyle = withAlpha(riskTone, 0.16);
      ctx.fillRect(x1, Math.min(entry.y, stop.y), x2 - x1, Math.abs(stop.y - entry.y));

      const line = (y: number, color: string, dashed: boolean) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 1 : 1.6;
        ctx.setLineDash(dashed ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      };
      line(entry.y, s.color, false);
      line(target.y, rewardTone, true);
      line(stop.y, riskTone, true);
      ctx.setLineDash([]);

      const risk = Math.abs(d.points[0].price - d.points[2].price);
      const reward = Math.abs(d.points[1].price - d.points[0].price);
      const rr = risk > 0 ? reward / risk : 0;
      label(ctx, `${d.kind === "long_position" ? "LONG" : "SHORT"} · ${c.formatPrice(d.points[0].price)}`, x1 + 4, entry.y - 3, "#e2e8f0");
      label(ctx, `TP ${c.formatPrice(d.points[1].price)}`, x1 + 4, target.y - 3, green);
      label(ctx, `SL ${c.formatPrice(d.points[2].price)}`, x1 + 4, stop.y - 3, red);
      label(ctx, `R:R  1 : ${rr.toFixed(2)}`, x2 - 90, Math.min(entry.y, target.y) - 3, "#e2e8f0");
      break;
    }
  }

  ctx.restore();

  if (opts.selected) {
    // Locked objects still show their handles, but greyed out so it's obvious
    // why dragging does nothing.
    const handles = anchorsFor(d, c, { includeLocked: true });
    ctx.save();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    for (const a of handles) {
      const r = ANCHOR_R + 1;
      ctx.beginPath();
      ctx.rect(a.x - r, a.y - r, r * 2, r * 2);
      ctx.fillStyle = d.locked ? "#94a3b8" : "#0b0f16";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = d.locked ? "#64748b" : s.color;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Interactive anchors for a drawing, in pixels. */
export function anchorsFor(d: Drawing, c: ChartCoords, opts: { includeLocked?: boolean } = {}): Anchor[] {
  if (d.hidden) return [];
  if (d.locked && !opts.includeLocked) return [];
  if (d.kind === "brush") return [];
  // Axis-anchored lines get a single mid-viewport handle on the axis they own,
  // so the handle is always reachable regardless of the other axis.
  if (d.kind === "horizontal_line") {
    const y = rowOf(d, c);
    return y == null ? [] : [{ id: "p0", x: c.width * 0.5, y }];
  }
  if (d.kind === "vertical_line") {
    const x = columnOf(d, c);
    return x == null ? [] : [{ id: "p0", x, y: c.height * 0.5 }];
  }
  const out: Anchor[] = [];
  d.points.forEach((p, i) => {
    const x = c.x(p.time);
    const y = c.y(p.price);
    if (x == null || y == null) return;
    out.push({ id: `p${i}`, x, y });
  });
  return out;
}


function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  const nx = x1 + t * dx, ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

function nearRect(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
  const inside = px >= left && px <= right && py >= top && py <= bottom;
  if (inside) return true;
  return (
    distToSegment(px, py, left, top, right, top) < HIT_TOLERANCE ||
    distToSegment(px, py, right, top, right, bottom) < HIT_TOLERANCE ||
    distToSegment(px, py, right, bottom, left, bottom) < HIT_TOLERANCE ||
    distToSegment(px, py, left, bottom, left, top) < HIT_TOLERANCE
  );
}

export function hitTest(d: Drawing, c: ChartCoords, px: number, py: number): boolean {
  if (d.hidden) return false;
  const pts = project(d, c);
  const p0 = pts[0], p1 = pts[1], p2 = pts[2];
  switch (d.kind) {
    case "horizontal_line": {
      const y = rowOf(d, c);
      return y != null && Math.abs(py - y) < HIT_TOLERANCE;
    }
    case "horizontal_ray":
      return !!p0 && Math.abs(py - p0.y) < HIT_TOLERANCE && px >= p0.x - HIT_TOLERANCE;
    case "vertical_line": {
      const x = columnOf(d, c);
      return x != null && Math.abs(px - x) < HIT_TOLERANCE;
    }

    case "trend_line":
    case "arrow":
    case "measure":
      return !!p0 && !!p1 && distToSegment(px, py, p0.x, p0.y, p1.x, p1.y) < HIT_TOLERANCE;
    case "ray":
    case "extended_line": {
      if (!p0 || !p1) return false;
      const e = lineThroughEdges(p0.x, p0.y, p1.x, p1.y, c.width);
      return distToSegment(px, py, e.ax, e.ay, e.bx, e.by) < HIT_TOLERANCE;
    }
    case "rectangle":
    case "ellipse":
    case "triangle":
    case "price_range":
    case "date_range":
    case "fib_retracement":
    case "fib_extension":
      return !!p0 && !!p1 && nearRect(px, py, p0.x, p0.y, p1.x, p1.y);
    case "brush": {
      const valid = pts.filter(Boolean) as { x: number; y: number }[];
      for (let i = 1; i < valid.length; i++) {
        if (distToSegment(px, py, valid[i - 1].x, valid[i - 1].y, valid[i].x, valid[i].y) < HIT_TOLERANCE) return true;
      }
      return false;
    }
    case "text": {
      // Measured box, so a short label isn't clickable across dead chart space
      // and a long / multi-line one stays fully grabbable.
      const box = textBox(d, c, getMeasureCtx());
      if (!box) return false;
      return (
        px >= box.left - HIT_TOLERANCE && px <= box.left + box.width + HIT_TOLERANCE &&
        py >= box.top - HIT_TOLERANCE && py <= box.top + box.height + HIT_TOLERANCE
      );
    }
    case "price_label":
      return !!p0 && Math.abs(py - p0.y) < 12 && px >= p0.x - 6 && px <= p0.x + 140;

    case "long_position":
    case "short_position": {
      if (!p0 || !p1 || !p2) return false;
      const x2 = Math.max(p1.x, p0.x + 40);
      return nearRect(px, py, p0.x, Math.min(p1.y, p2.y), x2, Math.max(p1.y, p2.y));
    }
    default:
      return false;
  }
}

export function anchorAt(d: Drawing, c: ChartCoords, px: number, py: number): Anchor | null {
  for (const a of anchorsFor(d, c)) {
    if (Math.hypot(px - a.x, py - a.y) <= 8) return a;
  }
  return null;
}

export function translateDrawing(d: Drawing, dTime: number, dPrice: number): DrawingPoint[] {
  // Axis-locked objects ignore movement on the axis they don't own, so a
  // Horizontal Line only ever slides vertically and a Vertical Line only
  // ever slides horizontally.
  const lock = axisLockFor(d.kind);
  const dt = lock === "price" ? 0 : dTime;
  const dp = lock === "time" ? 0 : dPrice;
  return d.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
}

export function moveAnchor(d: Drawing, anchorId: string, next: DrawingPoint): DrawingPoint[] {
  const idx = Number(anchorId.slice(1));
  const lock = axisLockFor(d.kind);
  if (lock !== "both") {
    const base = d.points[idx] ?? d.points[0];
    const constrained: DrawingPoint = lock === "price"
      ? { time: base.time, price: next.price }
      : { time: next.time, price: base.price };
    return d.points.map((p, i) => (i === idx ? constrained : { ...p }));
  }
  const points = d.points.map((p, i) => (i === idx ? { ...next } : { ...p }));

  if (d.kind === "long_position" || d.kind === "short_position") {
    // Entry drag carries stop/target with it; TP/SL drags keep the shared end time.
    if (idx === 0) {
      const dPrice = next.price - d.points[0].price;
      const dTime = next.time - d.points[0].time;
      return d.points.map((p, i) => (i === 0 ? { ...next } : { time: p.time + dTime, price: p.price + dPrice }));
    }
    const endTime = next.time;
    points[1] = { ...points[1], time: endTime };
    points[2] = { ...points[2], time: endTime };
  }
  return points;
}
