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

/**
 * A trend line whose endpoints sit at arbitrary times, deliberately NOT on any
 * round bar boundary. That is the whole point: after a fold the coarse grid
 * will not contain these instants, and the projection has to interpolate to
 * place them.
 */
function trendLine(): Drawing {
  return makeDrawing("trend_line", [
    { time: T0 + 7 * MIN, price: 1900 },
    { time: T0 + 43 * MIN, price: 1950 },
  ]);
}

/**
 * Project, or fail loudly.
 *
 * `ChartCoords.x` and `.y` are typed `number | null`, and a null is not a
 * curiosity here — it is precisely the failure that made a chart overlay's
 * hit-targets silently stop existing while the thing they sat on still drew.
 * Swallowing it with `?? 0` would let that regression pass as a hit at the
 * origin, so it throws instead.
 */
function must(v: number | null, what: string): number {
  if (v == null) throw new Error(`projection returned null for ${what}`);
  return v;
}

/** Midpoint of a two-point drawing in pixels, via the stub's own converters. */
function midpoint(d: Drawing, c: ChartCoords) {
  const [a, b] = d.points;
  return {
    x: (must(c.x(a.time), "a.time") + must(c.x(b.time), "b.time")) / 2,
    y: (must(c.y(a.price), "a.price") + must(c.y(b.price), "b.price")) / 2,
  };
}

describe("trend line survives a timeframe fold", () => {
  /**
   * A fold changes the bar grid under drawings that are already on the chart.
   * In coordinate terms that is a different pixels-per-ms (bars get wider, so
   * the same span maps elsewhere) plus the viewport translation the fold's
   * restore applies. Both are simulated by swapping the converters, which is
   * what this file exists to do.
   *
   * SCOPE, stated so this is not read as more than it is: this asserts
   * `render.ts` behaves correctly GIVEN a ChartCoords that interpolates. It
   * does not exercise the real adapter's `buildCoords().x`. That integration
   * gap is deliberate — covering it means sampling pixels out of the chart
   * canvas, which was judged disproportionate for a path already shown correct.
   */
  const base = () => coords({ scaleX: 0.001, offsetX: 0 });
  const folded = () => coords({ scaleX: 0.00025, offsetX: -120 });

  it("still hit-tests on the line after the fold", () => {
    const d = trendLine();
    const before = base();
    const after = folded();

    const mBefore = midpoint(d, before);
    expect(hitTest(d, before, mBefore.x, mBefore.y)).toBe(true);

    const mAfter = midpoint(d, after);
    expect(hitTest(d, after, mAfter.x, mAfter.y)).toBe(true);
  });

  it("actually moves on screen, so the fold is not being simulated as a no-op", () => {
    // Without this the suite above could pass while asserting nothing: if the
    // two coord sets projected identically, "survives the fold" would be
    // vacuously true.
    const d = trendLine();
    const mBefore = midpoint(d, base());
    const mAfter = midpoint(d, folded());
    expect(mAfter.x).not.toBeCloseTo(mBefore.x, 1);
  });

  it("keeps its stored times and prices across the fold", () => {
    const d = trendLine();
    const before = snapshot(d);
    midpoint(d, folded());
    hitTest(d, folded(), 0, 0);
    expect(snapshot(d)).toBe(before);
  });

  it("places endpoints that fall between bars of the coarser grid", () => {
    // The EC-10 class of failure: an exact-match projection returns null for a
    // timestamp that is not a bar's own open, the drawing is not painted, and
    // it silently stops being selectable. Both endpoints here are off-grid.
    const d = trendLine();
    const c = folded();
    for (const pt of d.points) {
      const x = c.x(pt.time);
      const y = c.y(pt.price);
      // Not null and not NaN: the two shapes "this point has no coordinate"
      // takes, either of which loses the drawing.
      expect(x).not.toBeNull();
      expect(y).not.toBeNull();
      expect(Number.isFinite(x as number)).toBe(true);
      expect(Number.isFinite(y as number)).toBe(true);
      expect(hitTest(d, c, x as number, y as number)).toBe(true);
    }
  });

  it("still misses where the line is not, after the fold", () => {
    // Guards the opposite regression: a projection collapsing to a constant
    // would make every probe "hit" and the suite above would pass regardless.
    const d = trendLine();
    const c = folded();
    const m = midpoint(d, c);
    expect(hitTest(d, c, m.x, m.y + 400)).toBe(false);
    expect(hitTest(d, c, m.x - 600, m.y)).toBe(false);
  });

  it("is not selectable once hidden, fold or no fold", () => {
    const d = { ...trendLine(), hidden: true };
    const c = folded();
    const m = midpoint(d, c);
    expect(hitTest(d, c, m.x, m.y)).toBe(false);
    expect(pickDrawingAt([d], c, m.x, m.y)).toBeNull();
  });
});
