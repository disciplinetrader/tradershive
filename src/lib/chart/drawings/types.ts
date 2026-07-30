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
  extendLeft?: boolean;
  extendRight?: boolean;
  /** Show the price/time badge on axis-anchored lines. Defaults to true. */
  showLabel?: boolean;
}

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DrawingPoint[];
  style: DrawingStyle;
  locked?: boolean;
  hidden?: boolean;
  createdAt: number;
}

export const DEFAULT_STYLE: DrawingStyle = {
  color: "#38bdf8",
  width: 2,
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
