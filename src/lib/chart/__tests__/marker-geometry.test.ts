import { describe, it, expect } from "vitest";
import {
  aboveBarOffsets,
  markerShapeHeight,
  markerShapeMargin,
  snapMarkerIndex,
} from "../marker-geometry";

const H = 3600_000;
// 1H bars at 12:00, 13:00, 14:00
const barTimes = [
  Date.UTC(2026, 6, 20, 12), Date.UTC(2026, 6, 20, 13), Date.UTC(2026, 6, 20, 14),
];

describe("snapMarkerIndex — the rule that decides whether a marker is clickable", () => {
  it("snaps an off-bar release forward to the next bar, as the renderer does", () => {
    // The reported case: a 12:30 print on an hourly tape. The old exact-match
    // projection returned null here and rendered no hit-target at all.
    expect(snapMarkerIndex(barTimes, Date.UTC(2026, 6, 20, 12, 30))).toBe(1);
  });

  it("uses the bar itself on an exact match", () => {
    expect(snapMarkerIndex(barTimes, barTimes[0])).toBe(0);
    expect(snapMarkerIndex(barTimes, barTimes[2])).toBe(2);
  });

  it("clamps to the last bar once the event is past the end of the tape", () => {
    expect(snapMarkerIndex(barTimes, barTimes[2] + 5 * H)).toBe(2);
  });

  it("snaps a pre-history event onto the first bar rather than dropping it", () => {
    expect(snapMarkerIndex(barTimes, barTimes[0] - 5 * H)).toBe(0);
  });

  it("has no bar to snap to when the series is empty", () => {
    expect(snapMarkerIndex([], barTimes[0])).toBeNull();
  });

  it("agrees with a linear scan across every boundary and gap", () => {
    const scan = (t: number) => {
      if (t > barTimes[barTimes.length - 1]) return barTimes.length - 1;
      return barTimes.findIndex((b) => b >= t);
    };
    for (let t = barTimes[0] - 2 * H; t <= barTimes[2] + 2 * H; t += 60_000) {
      expect(snapMarkerIndex(barTimes, t)).toBe(scan(t));
    }
  });
});

describe("marker sizing — transcribed from the renderer", () => {
  it("clamps bar spacing to [12, 30] before sizing", () => {
    // size() clamps, so anything below 12 or above 30 pins to the same shape.
    expect(markerShapeHeight(2)).toBe(markerShapeHeight(12));
    expect(markerShapeHeight(500)).toBe(markerShapeHeight(30));
  });

  it("produces an even shape height and a margin of at least 3", () => {
    for (const spacing of [1, 6, 12, 17, 23, 30, 90]) {
      expect(markerShapeHeight(spacing) % 2).toBe(0);
      expect(markerShapeMargin(spacing)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("aboveBarOffsets — two events on one bar must not overlap", () => {
  const opts = { barSpacing: 12, fontSize: 12, hasText: true };

  it("starts the first marker at the shape margin", () => {
    expect(aboveBarOffsets(1, opts)[0]).toBe(markerShapeMargin(opts.barSpacing));
  });

  it("separates stacked markers by at least a full shape height", () => {
    const offsets = aboveBarOffsets(4, opts);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i] - offsets[i - 1]).toBeGreaterThanOrEqual(markerShapeHeight(opts.barSpacing));
    }
  });

  it("stacks strictly upward, so order is preserved", () => {
    const offsets = aboveBarOffsets(5, opts);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it("reserves extra room for a label", () => {
    const withText = aboveBarOffsets(2, opts);
    const without = aboveBarOffsets(2, { ...opts, hasText: false });
    expect(withText[1] - withText[0]).toBeGreaterThan(without[1] - without[0]);
    // The label costs exactly one line: fontSize * (1 + 2 * TextMargin).
    expect((withText[1] - withText[0]) - (without[1] - without[0])).toBeCloseTo(opts.fontSize * 1.2, 6);
  });

  it("returns nothing for a bar with no markers", () => {
    expect(aboveBarOffsets(0, opts)).toEqual([]);
  });
});
