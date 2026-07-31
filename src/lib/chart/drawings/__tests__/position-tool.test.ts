/**
 * Position tool — chart-coordinate anchoring regressions.
 *
 * The persisted domain values (start/end timestamps, Entry, SL, TP) are
 * authoritative. These tests simulate zoom, pan, price-scale changes,
 * resize and timeframe switches by swapping the coordinate converters and
 * assert the stored values never move.
 */
import { describe, expect, it } from "vitest";
import { makeDrawing } from "../store";
import { moveAnchor, positionGeometry, translateDrawing, anchorsFor, hitTest, pickDrawingAt } from "../render";
import { snapPrice, tickFromPrecision, type ChartCoords, type Drawing } from "../types";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function coords(opts: {
  scaleX?: number; offsetX?: number; scaleY?: number; offsetY?: number;
  width?: number; height?: number;
} = {}): ChartCoords {
  const { scaleX = 0.001, offsetX = 0, scaleY = 10, offsetY = 0, width = 800, height = 600 } = opts;
  return {
    x: (t) => (t - T0) * scaleX + offsetX,
    y: (p) => (2000 - p) * scaleY + offsetY,
    timeAt: (x) => T0 + (x - offsetX) / scaleX,
    priceAt: (y) => 2000 - (y - offsetY) / scaleY,
    width,
    height,
    formatPrice: (p) => p.toFixed(2),
  };
}

function position(): Drawing {
  return makeDrawing("long_position", [
    { time: T0, price: 1900 },
    { time: T0 + 20 * MIN, price: 1950 },
    { time: T0 + 20 * MIN, price: 1880 },
  ]);
}

const snapshot = (d: Drawing) => JSON.stringify(d.points);

describe("position tool anchoring", () => {
  it("keeps stored domain values unchanged across zoom, pan, rescale and resize", () => {
    const d = position();
    const before = snapshot(d);
    const views = [
      coords(),
      coords({ scaleX: 0.01 }),               // zoom in (time)
      coords({ scaleX: 0.0001 }),             // zoom out (time)
      coords({ offsetX: -5000 }),             // pan
      coords({ scaleY: 40 }),                 // price-scale zoom
      coords({ height: 220 }),                // bottom panel opened
      coords({ width: 1920, height: 1080 }),  // fullscreen
    ];
    for (const c of views) {
      const g = positionGeometry(d, c);
      expect(g).not.toBeNull();
      expect(g!.x2).toBeGreaterThan(g!.x1);
    }
    expect(snapshot(d)).toBe(before);
  });

  it("does not drift after 100 zoom cycles", () => {
    const d = position();
    const before = snapshot(d);
    for (let i = 0; i < 100; i++) {
      positionGeometry(d, coords({ scaleX: 0.001 * (1 + i), scaleY: 10 + i }));
      positionGeometry(d, coords());
    }
    expect(snapshot(d)).toBe(before);
  });

  it("renders again when the anchor scrolls back into view", () => {
    const d = position();
    const off = coords({ offsetX: -100_000 });
    const g = positionGeometry(d, off);
    expect(g).not.toBeNull();          // extrapolated, not clamped
    expect(g!.x1).toBeLessThan(0);
    expect(snapshot(d)).toBe(snapshot(position()));
  });

  it("drags Entry as a price-only edit, snapped to tick", () => {
    const d = position();
    const tick = tickFromPrecision(2);
    const pts = moveAnchor(d, "p0", { time: T0 + 999 * MIN, price: 1901.234 }, { tick });
    expect(pts[0].price).toBe(1901.23);
    expect(pts[0].time).toBe(T0);            // time anchor untouched
    expect(pts[1]).toEqual(d.points[1]);     // TP untouched
    expect(pts[2]).toEqual(d.points[2]);     // SL untouched
  });

  it("drags TP and SL without moving the time anchors", () => {
    const d = position();
    const tp = moveAnchor(d, "p1", { time: T0 + 99 * MIN, price: 1975 });
    expect(tp[1]).toEqual({ time: T0 + 20 * MIN, price: 1975 });
    expect(tp[0]).toEqual(d.points[0]);
    const sl = moveAnchor(d, "p2", { time: T0 - 99 * MIN, price: 1870 });
    expect(sl[2]).toEqual({ time: T0 + 20 * MIN, price: 1870 });
  });

  it("time handles move only their own anchor", () => {
    const d = position();
    const left = moveAnchor(d, "tStart", { time: T0 - 5 * MIN, price: 1234 });
    expect(left[0]).toEqual({ time: T0 - 5 * MIN, price: 1900 });
    expect(left[1]).toEqual(d.points[1]);
    const right = moveAnchor(d, "tEnd", { time: T0 + 60 * MIN, price: 1234 });
    expect(right[1].time).toBe(T0 + 60 * MIN);
    expect(right[2].time).toBe(T0 + 60 * MIN);
    expect(right[1].price).toBe(1950);
    expect(right[0]).toEqual(d.points[0]);
  });

  it("whole-tool drag preserves level distances and R:R", () => {
    const d = position();
    const pts = translateDrawing(d, 5 * MIN, 12.5, { tick: tickFromPrecision(2) });
    expect(pts[0].price - pts[2].price).toBeCloseTo(20, 10);
    expect(pts[1].price - pts[0].price).toBeCloseTo(50, 10);
    expect(pts[1].time - pts[0].time).toBe(20 * MIN);
  });

  it("snapPrice is idempotent", () => {
    const once = snapPrice(1901.23456, 0.01);
    expect(snapPrice(once, 0.01)).toBe(once);
  });

  it("exposes five handles and hit-tests the body", () => {
    const d = position();
    const c = coords();
    const ids = anchorsFor(d, c).map((a) => a.id);
    expect(ids).toEqual(["p0", "p1", "p2", "tStart", "tEnd"]);
    const g = positionGeometry(d, c)!;
    expect(hitTest(d, c, (g.x1 + g.x2) / 2, g.entryY)).toBe(true);
  });
});

describe("context-menu hit-test", () => {
  it("targets the topmost position drawing under the cursor", () => {
    const c = coords();
    const below = position();
    const above = { ...position(), id: "on-top" };
    const g = positionGeometry(above, c)!;
    const picked = pickDrawingAt([below, above], c, (g.x1 + g.x2) / 2, g.entryY);
    expect(picked?.id).toBe("on-top");
  });

  it("skips hidden drawings and returns null on empty chart space", () => {
    const c = coords();
    const d = position();
    const g = positionGeometry(d, c)!;
    expect(pickDrawingAt([{ ...d, hidden: true }], c, (g.x1 + g.x2) / 2, g.entryY)).toBeNull();
    // far away from the tool → no hit, so the native browser menu is kept
    expect(pickDrawingAt([d], c, g.x1 - 400, g.entryY + 400)).toBeNull();
  });
});
