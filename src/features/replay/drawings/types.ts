/**
 * Drawing types for Replay chart overlay.
 *
 * All anchors are stored in **chart coordinates** (timeMs + price) so shapes
 * survive zoom, pan, resize, and timeframe reload. Pixel space is only used
 * transiently for rendering and hit-testing.
 */

export type DrawingTool =
  | "cursor"
  | "trend_line"
  | "horizontal_ray"
  | "rectangle"
  | "fibonacci";

export type Anchor = { t: number; p: number };

interface Base {
  id: string;
  createdAt: number;
  color?: string;
}

export interface TrendLine extends Base {
  kind: "trend_line";
  a: Anchor;
  b: Anchor;
}

export interface HorizontalRay extends Base {
  kind: "horizontal_ray";
  a: Anchor;
}

export interface Rectangle extends Base {
  kind: "rectangle";
  a: Anchor;
  b: Anchor;
}

export interface FibRetracement extends Base {
  kind: "fibonacci";
  a: Anchor;
  b: Anchor;
}

export type Drawing = TrendLine | HorizontalRay | Rectangle | FibRetracement;

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
