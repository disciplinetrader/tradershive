/**
 * Chart drawing model.
 *
 * Every drawing is stored ONLY in chart coordinates (time in ms + price).
 * Nothing is stored in pixels — pixel positions are derived at paint time
 * from the chart's own coordinate converters, which is why objects stay
 * glued to their candles while zooming, panning and rescaling.
 */

export type DrawingKind =
  | "trend_line"
  | "ray"
  | "extended_line"
  | "horizontal_line"
  | "horizontal_ray"
  | "vertical_line"
  | "arrow"
  | "fib_retracement"
  | "fib_extension"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "brush"
  | "text"
  | "price_label"
  | "measure"
  | "price_range"
  | "date_range"
  | "long_position"
  | "short_position";

export type CursorKind = "cursor" | "crosshair" | "dot";

export type ToolId = DrawingKind | CursorKind;

/** A point anchored to the chart: time in epoch-ms, price in quote units. */
export interface DrawingPoint {
  time: number;
  price: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
  /** 0 solid · 1 dashed · 2 dotted */
  lineStyle: 0 | 1 | 2;
  fillOpacity: number;
  fontSize: number;
  text?: string;
  /** Horizontal alignment of a text drawing relative to its anchor. */
  textAlign?: "left" | "center" | "right";
  extendLeft?: boolean;
  extendRight?: boolean;
  /** Show the price/time badge on axis-anchored lines. Defaults to true. */
  showLabel?: boolean;
}

/**
 * Hard bounds for text drawings. A pasted novel must never be able to blow up
 * the canvas, stall a repaint or push the chart off screen — it is clamped on
 * the way in (editor) and again on the way out (renderer).
 */
export const TEXT_LIMITS = {
  maxChars: 500,
  maxLines: 8,
  maxLineChars: 80,
  minFontSize: 8,
  maxFontSize: 48,
} as const;

/**
 * Normalises text before it is stored on a drawing.
 * Strips control characters, normalises newlines, clamps line count and
 * length. Returns "" for anything that is effectively empty — callers treat
 * that as "cancel / delete", never as a blank drawing.
 */
export function sanitizeDrawingText(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    // Control characters (except newline) can corrupt canvas measurement.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .slice(0, TEXT_LIMITS.maxChars);
  const lines = cleaned
    .split("\n")
    .slice(0, TEXT_LIMITS.maxLines)
    .map((l) => l.slice(0, TEXT_LIMITS.maxLineChars).trimEnd());
  // Drop trailing blank lines so "text\n\n\n" doesn't render as a tall ghost.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const out = lines.join("\n");
  return out.trim().length ? out : "";
}

/** Lines a text drawing should paint, already clamped. */
export function textLines(text: string | undefined): string[] {
  const safe = sanitizeDrawingText(text);
  return safe ? safe.split("\n") : [];
}


export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DrawingPoint[];
  style: DrawingStyle;
  locked?: boolean;
  hidden?: boolean;
  createdAt: number;
  /**
   * Position Tool order link (Phase 2). Present once the drawing has been
   * confirmed as a pending order; purely descriptive — geometry, anchoring
   * and dragging behaviour are unchanged.
   */
  orderId?: string;
  /** Short badge painted on the tool, e.g. "Buy Limit · Pending". */
  orderBadge?: string;
  /**
   * Completed-trade stamp (Phase 4). Present once the position behind this
   * drawing has closed. Purely canonical values — time + price — so the
   * markers stay anchored through zoom, pan, resize and timeframe changes.
   * Its presence flips the renderer from "live position" to "historical
   * trade", which is how a closed trade is visually distinguishable.
   */
  closedTrade?: ClosedTradeStamp;
  /**
   * Execution tape stamp (Phase 6). Canonical time + price anchors for every
   * fill on the position behind this drawing — open, scale-in, partial close,
   * take-profit, stop-out, final exit — plus protective-level moves. Because
   * the marks are stored as chart coordinates (never pixels) they stay glued
   * to the candles through zoom, pan, resize, refresh, replay and timeframe
   * switches, exactly like the position geometry itself.
   */
  executionMarks?: ExecutionMark[];

}

export interface ExecutionMark {
  id: string;
  seq: number;
  time: number;
  price: number;
  /** Mirrors ExecutionKind from the order layer (kept structural to avoid a cycle). */
  kind: string;
  quantity: number;
  realizedR: number;
  label?: string;
}

export interface ClosedTradeStamp {
  tradeId: string;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  direction: "buy" | "sell";
  netPnl: number;
  realizedR: number;
  closeReason: "manual" | "stop_loss" | "take_profit";
  outcome: "win" | "loss" | "breakeven";
}



export const DEFAULT_STYLE: DrawingStyle = {
  color: "#38bdf8",
  width: 3,

  lineStyle: 0,
  fillOpacity: 0.12,
  fontSize: 12,
  showLabel: true,
};

/**
 * Axis lock per kind.
 * `price` → the object is anchored to a price only; time is meaningless and
 * must never change while dragging (Horizontal Line).
 * `time` → anchored to a timestamp only; price never changes (Vertical Line).
 */
export type AxisLock = "price" | "time" | "both";

export const AXIS_LOCKS: Partial<Record<DrawingKind, AxisLock>> = {
  horizontal_line: "price",
  vertical_line: "time",
};

export function axisLockFor(kind: DrawingKind): AxisLock {
  return AXIS_LOCKS[kind] ?? "both";
}

/** Kinds that expose a label-visibility toggle. */
export const LABELLED_KINDS: DrawingKind[] = [
  "horizontal_line",
  "horizontal_ray",
  "vertical_line",
  "price_label",
];

/** Kinds that finish with a single click instead of a drag. */
export const SINGLE_CLICK_KINDS: DrawingKind[] = [
  "horizontal_line",
  "horizontal_ray",
  "vertical_line",
  "text",
  "price_label",
  "long_position",
  "short_position",
];

/** Kinds captured as a freehand stream of points. */
export const FREEHAND_KINDS: DrawingKind[] = ["brush"];

/**
 * Position tools (Long / Short).
 *
 * Domain model — the persisted values are authoritative and are never
 * recomputed from pixels during ordinary redraws:
 *   points[0] = { time: START anchor, price: ENTRY }
 *   points[1] = { time: END anchor,   price: TARGET }
 *   points[2] = { time: END anchor,   price: STOP }
 * Both end-anchored points always share the same timestamp; helpers below
 * are the only writers, so the invariant cannot drift.
 */
export const POSITION_KINDS: DrawingKind[] = ["long_position", "short_position"];

export function isPositionKind(kind: DrawingKind): boolean {
  return kind === "long_position" || kind === "short_position";
}

/** Tick size implied by a symbol's price precision (e.g. 4 → 0.0001). */
export function tickFromPrecision(precision: number): number {
  const p = Number.isFinite(precision) ? Math.min(10, Math.max(0, Math.trunc(precision))) : 2;
  return Number(Math.pow(10, -p).toFixed(10));
}

/**
 * Snap a price to the symbol tick without accumulating rounding drift —
 * the result is rounded at the tick's own precision, so repeated snapping
 * of an already-snapped value is a no-op.
 */
export function snapPrice(price: number, tick?: number): number {
  if (!tick || !Number.isFinite(tick) || tick <= 0 || !Number.isFinite(price)) return price;
  const decimals = Math.max(0, Math.round(-Math.log10(tick)));
  return Number((Math.round(price / tick) * tick).toFixed(decimals));
}


export const KIND_LABELS: Record<DrawingKind, string> = {
  trend_line: "Trend Line",
  ray: "Ray",
  extended_line: "Extended Line",
  horizontal_line: "Horizontal Line",
  horizontal_ray: "Horizontal Ray",
  vertical_line: "Vertical Line",
  arrow: "Arrow",
  fib_retracement: "Fibonacci Retracement",
  fib_extension: "Fibonacci Extension",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  brush: "Brush",
  text: "Text",
  price_label: "Price Label",
  measure: "Measure",
  price_range: "Price Range",
  date_range: "Date Range",
  long_position: "Long Position",
  short_position: "Short Position",
};

/** Chart-native coordinate converters handed to the renderer each frame. */
export interface ChartCoords {
  x(timeMs: number): number | null;
  y(price: number): number | null;
  timeAt(x: number): number | null;
  priceAt(y: number): number | null;
  width: number;
  height: number;
  formatPrice(price: number): string;
}
