/**
 * Canvas renderer + hit-testing for chart drawings.
 *
 * Pure functions: they receive the chart's live coordinate converters and
 * paint in media pixels. No DOM, no React, no cached pixel state — that is
 * what keeps every object anchored to time/price under zoom, pan, rescale,
 * resize and timeframe changes.
 */

import { axisLockFor, isPositionKind, snapPrice, TEXT_LIMITS, textLines } from "./types";
import { compact, positionMetrics, tickFromFormatter, type PositionMetrics } from "./position";
import type { ChartCoords, ClosedTradeStamp, Drawing, DrawingPoint } from "./types";

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
      drawPosition(ctx, c, d, opts);
      break;
    }


  }

  ctx.restore();

  if (opts.selected || (opts.hovered && isPositionKind(d.kind))) {
    // Locked objects still show their handles, but greyed out so it's obvious
    // why dragging does nothing.
    const handles = anchorsFor(d, c, { includeLocked: true });
    const round = isPositionKind(d.kind);
    ctx.save();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    for (const a of handles) {
      const r = ANCHOR_R + (round ? 1.5 : 1);
      ctx.beginPath();
      if (round) ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      else ctx.rect(a.x - r, a.y - r, r * 2, r * 2);
      ctx.fillStyle = d.locked ? "#94a3b8" : "#0b0f16";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = d.locked ? "#64748b" : round ? "#cbd5e1" : s.color;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ── Position tool ──────────────────────────────────────────────────── */

const POS_GREEN = "#26a69a";
const POS_RED = "#ef5350";
const POS_INK = "#e6edf6";
const POS_PANEL = "rgba(11, 15, 22, 0.88)";
const POS_FONT = (size: number, weight = 600) =>
  `${weight} ${size}px ui-sans-serif, -apple-system, system-ui, sans-serif`;

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) {
  const rad = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Rounded pill vertically centred on `y`, anchored left at `x`. */
function pill(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  fg: string, bg: string, size = 10.5,
) {
  ctx.save();
  ctx.font = POS_FONT(size);
  const w = ctx.measureText(text).width + 12;
  const h = size + 9;
  roundRect(ctx, x, y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y + 0.5);
  ctx.restore();
  return w;
}

/**
 * TradingView-style Long / Short position.
 *
 * Everything painted here is derived from the drawing's stored prices and
 * timestamps on this frame only — no pixel state is kept between redraws.
 */
/**
 * Completed-trade visualization (Phase 4).
 *
 * Replaces the live position rendering once the trade is closed: no live P/L,
 * no active zones, muted historical geometry, and explicit entry / exit
 * markers joined by a trade span. Everything is derived from the canonical
 * time + price anchors on the stamp, so the markers survive zoom, pan,
 * resize, refresh, fullscreen, timeframe changes and replay.
 */
function drawClosedTrade(
  ctx: CanvasRenderingContext2D,
  c: ChartCoords,
  d: Drawing,
  t: ClosedTradeStamp,
  opts: { selected?: boolean; hovered?: boolean },
) {
  const ex = c.x(t.entryTime);
  const ey = c.y(t.entryPrice);
  const xx = c.x(t.exitTime);
  const xy = c.y(t.exitPrice);
  const active = !!(opts.selected || opts.hovered);
  const tone = t.outcome === "win" ? POS_GREEN : t.outcome === "loss" ? POS_RED : POS_INK;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineJoin = "miter";

  // Historical geometry — dashed and heavily muted so it can never be
  // mistaken for a pending order or a live position.
  const g = positionGeometry(d, c);
  if (g) {
    const { entryY, targetY, stopY } = separateRows(g);
    const top = Math.min(entryY, targetY, stopY);
    const bottom = Math.max(entryY, targetY, stopY);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(tone, active ? 0.4 : 0.22);
    ctx.fillStyle = withAlpha(tone, 0.05);
    ctx.fillRect(g.x1, top, g.x2 - g.x1, Math.max(bottom - top, 1));
    ctx.strokeRect(g.x1 + 0.5, top + 0.5, g.x2 - g.x1 - 1, Math.max(bottom - top, 1));
    ctx.setLineDash([]);
  }

  if (ex != null && ey != null && xx != null && xy != null) {
    // Trade span — entry to exit.
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(tone, active ? 1 : 0.8);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(xx, xy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Entry marker — hollow, direction-coded.
    ctx.lineWidth = 2;
    ctx.strokeStyle = t.direction === "buy" ? POS_GREEN : POS_RED;
    ctx.fillStyle = POS_PANEL;
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Exit marker — filled, outcome-coded.
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(xx, xy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Result badge — realized only. Live P/L is never painted after closure.
  const sign = t.netPnl > 0 ? "+" : "";
  // An em-dash where R would go, not "0.00R": a trade with no stop has a real
  // P/L and no risk to measure it against, and a printed zero reads as a
  // genuine flat result. Same call as the position label (Stage A').
  const rText = t.realizedR == null
    ? "—"
    : `${t.realizedR >= 0 ? "+" : ""}${t.realizedR.toFixed(2)}R`;
  const label = `${t.direction === "buy" ? "Long" : "Short"} · ${sign}${t.netPnl.toFixed(2)} · ${rText} · ${CLOSE_REASON_TEXT[t.closeReason]}`;
  const anchorX = xx ?? ex ?? (g ? g.x2 : 0);
  const anchorY = xy ?? ey ?? (g ? g.entryY : 0);
  ctx.font = POS_FONT(10, 700);
  pill(ctx, label, anchorX + 10, anchorY - 12, tone, POS_PANEL, 10);

  // The full execution tape stays visible after closure — scale-ins, partial
  // exits and trailing steps are the record of how the trade was managed.
  drawExecutionMarks(ctx, c, d, t.direction, active);

  ctx.restore();
}


const CLOSE_REASON_TEXT: Record<ClosedTradeStamp["closeReason"], string> = {
  manual: "Manual",
  stop_loss: "Stop",
  take_profit: "Target",
};

function drawPosition(

  ctx: CanvasRenderingContext2D,
  c: ChartCoords,
  d: Drawing,
  opts: { selected?: boolean; hovered?: boolean; ghost?: boolean },
) {
  // Closed trades retire the live rendering entirely — no live P/L, no
  // active order affordances, only the historical record.
  if (d.closedTrade) { drawClosedTrade(ctx, c, d, d.closedTrade, opts); return; }
  const g = positionGeometry(d, c);
  if (!g) return;

  const m = positionMetrics(d, { tick: tickFromFormatter(c.formatPrice) });
  if (!m) return;
  const { x1, x2 } = g;
  const { entryY, targetY, stopY } = separateRows(g);
  const width = x2 - x1;
  const active = !!(opts.selected || opts.hovered);

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.lineJoin = "miter";

  // Zones — reward above/below entry, risk on the opposite side.
  const zone = (from: number, to: number, tone: string) => {
    const top = Math.min(from, to);
    const h = Math.max(Math.abs(to - from), 1);
    ctx.fillStyle = withAlpha(tone, active ? 0.2 : 0.14);
    ctx.fillRect(x1, top, width, h);
  };
  zone(entryY, targetY, POS_GREEN);
  zone(entryY, stopY, POS_RED);

  // Zone outlines.
  const boxTop = Math.min(targetY, stopY);
  const boxBottom = Math.max(targetY, stopY);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(POS_GREEN, active ? 0.85 : 0.6);
  ctx.strokeRect(x1 + 0.5, Math.min(entryY, targetY) + 0.5, width - 1, Math.max(Math.abs(targetY - entryY), 1));
  ctx.strokeStyle = withAlpha(POS_RED, active ? 0.85 : 0.6);
  ctx.strokeRect(x1 + 0.5, Math.min(entryY, stopY) + 0.5, width - 1, Math.max(Math.abs(stopY - entryY), 1));

  // Entry line — the only solid, full-weight line in the tool.
  ctx.strokeStyle = active ? "#f1f5f9" : "rgba(226, 232, 240, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, entryY);
  ctx.lineTo(x2, entryY);
  ctx.stroke();

  // Level labels — rounded pills, stacked so near-identical prices stay legible.
  const rows = stackLabels([
    { y: entryY, text: `${m.long ? "Long" : "Short"} · ${c.formatPrice(m.entry)}`, color: POS_INK },
    { y: targetY, text: `Target ${c.formatPrice(m.target)}`, color: POS_GREEN },
    { y: stopY, text: `Stop ${c.formatPrice(m.stop)}`, color: POS_RED },
  ]);
  for (const r of rows) pill(ctx, r.text, x1 + 6, r.y, r.color, POS_PANEL);

  // Pending-order badge (Phase 2). Painted above the box; purely a label —
  // it never participates in geometry or hit-testing.
  if (d.orderBadge) {
    ctx.font = POS_FONT(10, 700);
    pill(ctx, d.orderBadge, x1 + 6, boxTop - 11, m.long ? POS_GREEN : POS_RED, POS_PANEL);
  }

  // Compact R:R badge always visible; the full metrics panel on hover/select.
  const rrText = `R:R 1 : ${m.rr.toFixed(2)}`;
  if (!active) {
    ctx.font = POS_FONT(10.5);
    const w = ctx.measureText(rrText).width + 12;
    pill(ctx, rrText, Math.max(x1 + 6, x2 - w - 6), boxTop - 11, POS_INK, POS_PANEL);
  } else {
    drawMetricsPanel(ctx, c, m, x2, boxTop, boxBottom, rrText);
  }

  drawExecutionMarks(ctx, c, d, m.long ? "buy" : "sell", active);

  ctx.restore();
}

/**
 * Execution tape markers (Phase 6).
 *
 * Entries are hollow, exits are filled, level moves are small ticks. Every
 * mark is placed from its own canonical time + price, so the geometry is
 * recomputed from chart coordinates on every frame and stays anchored through
 * zoom, pan, resize, replay, refresh and timeframe switches.
 */
function drawExecutionMarks(
  ctx: CanvasRenderingContext2D,
  c: ChartCoords,
  d: Drawing,
  direction: "buy" | "sell",
  active: boolean,
) {
  const marks = d.executionMarks;
  if (!marks?.length) return;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.lineJoin = "miter";

  const entryTone = direction === "buy" ? POS_GREEN : POS_RED;
  let prev: { x: number; y: number } | null = null;

  for (const mk of marks) {
    const x = c.x(mk.time);
    const y = c.y(mk.price);
    if (x == null || y == null) continue;

    if (mk.kind === "stop_move" || mk.kind === "target_move") {
      // Protection moves — a short horizontal tick, never a fill dot.
      ctx.strokeStyle = withAlpha(mk.kind === "stop_move" ? POS_RED : POS_GREEN, active ? 0.9 : 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.stroke();
      continue;
    }

    const isEntry = mk.kind === "open" || mk.kind === "scale_in";
    const tone = isEntry
      ? entryTone
      // No R means no verdict, so the marker takes the neutral-positive tone
      // rather than being painted red for a loss it cannot know about.
      : (mk.realizedR ?? 0) >= 0
        ? POS_GREEN
        : POS_RED;

    // Route line between consecutive fills — the visual story of the trade.
    if (prev) {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(POS_INK, active ? 0.45 : 0.22);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    prev = { x, y };

    ctx.lineWidth = 1.75;
    ctx.strokeStyle = tone;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    if (isEntry) {
      ctx.fillStyle = POS_PANEL;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = tone;
      ctx.fill();
    }

    // Labels only while the tool is engaged, so idle charts stay calm.
    if (active && mk.label) {
      ctx.font = POS_FONT(9.5, 700);
      pill(ctx, mk.label, x + 8, y - 9, tone, POS_PANEL, 9.5);
    }
  }

  ctx.restore();
}


/** Live metrics panel — pinned to the right edge of the tool. */
function drawMetricsPanel(
  ctx: CanvasRenderingContext2D,
  c: ChartCoords,
  m: PositionMetrics,
  x2: number,
  boxTop: number,
  boxBottom: number,
  rrText: string,
) {
  const rows: Array<[string, string, string]> = [
    ["Entry", c.formatPrice(m.entry), POS_INK],
    ["Target", c.formatPrice(m.target), POS_GREEN],
    ["Stop", c.formatPrice(m.stop), POS_RED],
    ["Reward", `${c.formatPrice(m.reward)} · ${m.rewardPct.toFixed(2)}%`, POS_GREEN],
    ["Risk", `${c.formatPrice(m.risk)} · ${m.riskPct.toFixed(2)}%`, POS_RED],
    ["Ticks", `${m.rewardTicks} / ${m.riskTicks}`, POS_INK],
    ["Points", `${compact(m.reward, 2)} / ${compact(m.risk, 2)}`, POS_INK],
    ["Size", m.size == null ? "—" : compact(m.size, 2), "rgba(203, 213, 225, 0.75)"],
  ];

  ctx.save();
  ctx.font = POS_FONT(10.5, 500);
  let labelW = 0;
  let valueW = 0;
  for (const [k, v] of rows) {
    labelW = Math.max(labelW, ctx.measureText(k).width);
    valueW = Math.max(valueW, ctx.measureText(v).width);
  }
  ctx.font = POS_FONT(11, 700);
  const headW = ctx.measureText(rrText).width;

  const padX = 9;
  const rowH = 15;
  const headH = 20;
  const w = Math.max(labelW + valueW + 22, headW) + padX * 2;
  const h = headH + rows.length * rowH + 8;

  // Keep the panel inside the viewport; flip to the left of the tool when
  // there is no room on the right.
  let x = x2 + 8;
  if (x + w > c.width - 4) x = Math.max(4, x2 - w - 8);
  let y = (boxTop + boxBottom) / 2 - h / 2;
  y = Math.max(4, Math.min(y, c.height - h - 4));

  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = POS_PANEL;
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.font = POS_FONT(11, 700);
  ctx.fillStyle = m.long ? POS_GREEN : POS_RED;
  ctx.fillText(rrText, x + padX, y + headH / 2 + 2);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.beginPath();
  ctx.moveTo(x + padX, y + headH);
  ctx.lineTo(x + w - padX, y + headH);
  ctx.stroke();

  rows.forEach(([k, v, color], i) => {
    const ry = y + headH + 4 + i * rowH + rowH / 2;
    ctx.font = POS_FONT(10.5, 500);
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    ctx.fillText(k, x + padX, ry);
    ctx.font = POS_FONT(10.5, 600);
    ctx.fillStyle = color;
    ctx.fillText(v, x + w - padX - ctx.measureText(v).width, ry);
  });
  ctx.restore();
}


/**
 * Interaction padding (pixels). Purely a hit-testing affordance: when a tool
 * is zoomed out until its real span collapses to a couple of pixels the
 * grab area is inflated so it stays clickable. Painted geometry and the
 * stored timestamps are never touched.
 */
const POSITION_MIN_HIT_PX = 10;
/** Minimum painted gap between Entry / TP / SL rows. Visual only. */
const POSITION_MIN_ROW_GAP = 3;
/** Sideways offset applied to price handles that would otherwise overlap. */
const POSITION_HANDLE_OFFSET = 16;

/**
 * Pixel geometry of a position tool, derived fresh from its domain anchors
 * on every paint. Nothing here is cached or fed back into the model, which
 * is what keeps Entry/SL/TP and the time anchors numerically stable through
 * zoom, pan, price-scale changes, resize and fullscreen toggles.
 *
 * `x2` is always `x(endTime)` — the box width is the time span and nothing
 * else. Degenerate spans are handled by `positionHitBox`, not here.
 */
export function positionGeometry(d: Drawing, c: ChartCoords) {
  if (d.points.length < 3) return null;
  const startX = c.x(d.points[0].time);
  const endX = c.x(positionEndTime(d));
  const entryY = c.y(d.points[0].price);
  const targetY = c.y(d.points[1].price);
  const stopY = c.y(d.points[2].price);
  if (startX == null || endX == null || entryY == null || targetY == null || stopY == null) return null;
  if (![startX, endX, entryY, targetY, stopY].every(Number.isFinite)) return null;
  const x1 = Math.min(startX, endX);
  const x2 = Math.max(startX, endX);
  return { x1, x2, entryY, targetY, stopY, rawWidth: x2 - x1 };
}

/**
 * Grab area for a position tool. Identical to the painted box unless the
 * span has collapsed below `POSITION_MIN_HIT_PX`, in which case it is
 * inflated symmetrically so the user can still select and drag it.
 */
export function positionHitBox(g: { x1: number; x2: number }) {
  const width = g.x2 - g.x1;
  if (width >= POSITION_MIN_HIT_PX) return { x1: g.x1, x2: g.x2 };
  const pad = (POSITION_MIN_HIT_PX - width) / 2;
  return { x1: g.x1 - pad, x2: g.x2 + pad };
}


/** Canonical end anchor — both end-anchored points share this timestamp. */
export function positionEndTime(d: Drawing): number {
  return d.points[1]?.time ?? d.points[0]?.time ?? 0;
}

/**
 * Painted rows for Entry / TP / SL. Identical prices would otherwise collapse
 * into one line; this pushes them apart by a few pixels for legibility while
 * leaving every stored price untouched.
 */
function separateRows(g: { entryY: number; targetY: number; stopY: number }) {
  const rows = [
    { key: "targetY" as const, y: g.targetY },
    { key: "entryY" as const, y: g.entryY },
    { key: "stopY" as const, y: g.stopY },
  ].sort((a, b) => a.y - b.y);
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].y - rows[i - 1].y;
    if (gap < POSITION_MIN_ROW_GAP) rows[i].y = rows[i - 1].y + POSITION_MIN_ROW_GAP;
  }
  const out = { ...g };
  for (const r of rows) out[r.key] = r.y;
  return out;
}

/** Stack labels top-to-bottom so near-identical prices stay readable. */
function stackLabels(items: Array<{ y: number; text: string; color: string }>) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const GAP = 17;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < GAP) sorted[i].y = sorted[i - 1].y + GAP;
  }
  return sorted;
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
  if (isPositionKind(d.kind)) {
    const g = positionGeometry(d, c);
    if (!g) return [];
    const rows = separateRows(g);
    const mid = (g.x1 + g.x2) / 2;
    // Price handles sit mid-span (price-only drags); the two edge handles
    // move the time anchors and never touch Entry / SL / TP. When two levels
    // are within grabbing distance the handles fan out horizontally so each
    // one stays independently clickable.
    const tight = (a: number, b: number) => Math.abs(a - b) < POSITION_HANDLE_OFFSET;
    const crowded =
      tight(rows.entryY, rows.targetY) || tight(rows.entryY, rows.stopY) || tight(rows.targetY, rows.stopY);
    const off = crowded ? POSITION_HANDLE_OFFSET : 0;
    // Edge handles use the padded hit box so a collapsed span still offers two
    // separately grabbable edges; the timestamps they write remain exact.
    const hit = positionHitBox(g);
    return [
      { id: "p0", x: mid, y: rows.entryY },
      { id: "p1", x: mid - off, y: rows.targetY },
      { id: "p2", x: mid + off, y: rows.stopY },
      { id: "tStart", x: hit.x1, y: rows.entryY },
      { id: "tEnd", x: hit.x2, y: rows.entryY },
    ];
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

/**
 * Topmost-wins pick used by selection and the right-click context menu.
 * Hidden drawings are skipped; the last drawing in paint order (visually on
 * top) is returned so the menu always targets what the user sees.
 */
export function pickDrawingAt(
  list: Drawing[], c: ChartCoords, px: number, py: number,
): Drawing | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (d.hidden) continue;
    if (hitTest(d, c, px, py)) return d;
  }
  return null;
}

export function hitTest(d: Drawing, c: ChartCoords, px: number, py: number): boolean {
  if (d.hidden) return false;
  const pts = project(d, c);
  const p0 = pts[0], p1 = pts[1];
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
      const g = positionGeometry(d, c);
      if (!g) return false;
      const top = Math.min(g.entryY, g.targetY, g.stopY);
      const bottom = Math.max(g.entryY, g.targetY, g.stopY);
      // Hit box only — a collapsed span stays grabbable without the painted
      // box or the stored timestamps being widened.
      const hit = positionHitBox(g);
      return nearRect(px, py, hit.x1, top, hit.x2, bottom);
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

export interface MutateOptions {
  /** Symbol tick size — price edits snap to it (no pixel rounding involved). */
  tick?: number;
}

export function translateDrawing(
  d: Drawing,
  dTime: number,
  dPrice: number,
  opts: MutateOptions = {},
): DrawingPoint[] {
  // Axis-locked objects ignore movement on the axis they don't own, so a
  // Horizontal Line only ever slides vertically and a Vertical Line only
  // ever slides horizontally.
  const lock = axisLockFor(d.kind);
  const dt = lock === "price" ? 0 : dTime;
  let dp = lock === "time" ? 0 : dPrice;
  if (isPositionKind(d.kind) && opts.tick) {
    // Snap the *delta*, not each level: distances between Entry / SL / TP —
    // and therefore R:R — survive a whole-tool drag exactly.
    dp = snapPrice(dp, opts.tick);
  }
  return d.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
}

export function moveAnchor(
  d: Drawing,
  anchorId: string,
  next: DrawingPoint,
  opts: MutateOptions = {},
): DrawingPoint[] {
  const lock = axisLockFor(d.kind);

  if (isPositionKind(d.kind)) {
    const points = d.points.map((p) => ({ ...p }));
    const start = points[0].time;
    const end = positionEndTime(d);

    // Time handles move only the anchor they own; Entry / SL / TP stay put.
    if (anchorId === "tStart") {
      points[0] = { ...points[0], time: Math.min(next.time, end - 1) };
      return points;
    }
    if (anchorId === "tEnd") {
      const t = Math.max(next.time, start + 1);
      points[1] = { ...points[1], time: t };
      points[2] = { ...points[2], time: t };
      return points;
    }

    // Price handles are price-only: the time anchors are never touched, and
    // the other two levels keep their own prices.
    const idx = Number(anchorId.slice(1));
    if (idx >= 0 && idx < points.length) {
      points[idx] = { ...points[idx], price: snapPrice(next.price, opts.tick) };
    }
    return points;
  }

  const idx = Number(anchorId.slice(1));
  if (lock !== "both") {
    const base = d.points[idx] ?? d.points[0];
    const constrained: DrawingPoint = lock === "price"
      ? { time: base.time, price: next.price }
      : { time: next.time, price: base.price };
    return d.points.map((p, i) => (i === idx ? constrained : { ...p }));
  }
  return d.points.map((p, i) => (i === idx ? { ...next } : { ...p }));
}
