/**
 * Canvas renderer + hit-testing for chart drawings.
 *
 * Pure functions: they receive the chart's live coordinate converters and
 * paint in media pixels. No DOM, no React, no cached pixel state — that is
 * what keeps every object anchored to time/price under zoom, pan, rescale,
 * resize and timeframe changes.
 */

import type { ChartCoords, Drawing, DrawingPoint } from "./types";

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
      if (!p0) break;
      ctx.beginPath();
      ctx.moveTo(0, p0.y);
      ctx.lineTo(c.width, p0.y);
      ctx.stroke();
      label(ctx, s.text || c.formatPrice(d.points[0].price), c.width - 80, p0.y - 2, s.color);
      break;
    }
    case "horizontal_ray": {
      if (!p0) break;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(c.width, p0.y);
      ctx.stroke();
      label(ctx, c.formatPrice(d.points[0].price), c.width - 80, p0.y - 2, s.color);
      break;
    }
    case "vertical_line": {
      if (!p0) break;
      ctx.beginPath();
      ctx.moveTo(p0.x, 0);
      ctx.lineTo(p0.x, c.height);
      ctx.stroke();
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
      ctx.font = `600 ${s.fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.color;
      ctx.fillText(s.text || "Text", p0.x, p0.y);
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
    ctx.save();
    ctx.setLineDash([]);
    for (const a of anchorsFor(d, c)) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, ANCHOR_R, 0, Math.PI * 2);
      ctx.fillStyle = "#0b0f16";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = s.color;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Interactive anchors for a drawing, in pixels. */
export function anchorsFor(d: Drawing, c: ChartCoords): Anchor[] {
  if (d.locked || d.hidden) return [];
  const out: Anchor[] = [];
  d.points.forEach((p, i) => {
    let x = c.x(p.time);
    const y = c.y(p.price);
    if (d.kind === "horizontal_line") x = c.width * 0.5;
    if (x == null || y == null) return;
    out.push({ id: `p${i}`, x, y });
  });
  if (d.kind === "brush") return [];
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
    case "horizontal_line":
      return !!p0 && Math.abs(py - p0.y) < HIT_TOLERANCE;
    case "horizontal_ray":
      return !!p0 && Math.abs(py - p0.y) < HIT_TOLERANCE && px >= p0.x - HIT_TOLERANCE;
    case "vertical_line":
      return !!p0 && Math.abs(px - p0.x) < HIT_TOLERANCE;
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
    case "text":
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
  return d.points.map((p) => ({ time: p.time + dTime, price: p.price + dPrice }));
}

export function moveAnchor(d: Drawing, anchorId: string, next: DrawingPoint): DrawingPoint[] {
  const idx = Number(anchorId.slice(1));
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
