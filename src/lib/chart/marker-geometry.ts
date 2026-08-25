/**
 * Mirror of lightweight-charts' series-marker placement, for DOM overlays that
 * need hit-targets on top of markers drawn into the chart's canvas.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `createSeriesMarkers` draws into the canvas and hands no geometry back: no
 * marker identity, no coordinates, no hit-test. An overlay that wants a
 * clickable marker therefore has to reproduce the library's placement rather
 * than read it. That is only safe if the reproduction is exact, which is what
 * this module is — a transcription of `fillSizeAndY` and its helpers, with the
 * upstream line numbers recorded so a version bump can be re-checked against
 * them (lightweight-charts 5.x, `dist/lightweight-charts.development.mjs`).
 *
 * Getting this wrong is not a cosmetic miss: the overlay's targets end up
 * somewhere the markers are not, and every click silently does nothing, which
 * is exactly the bug this replaced: markers drew fine and no popover opened.
 *
 * ── The three rules being mirrored ─────────────────────────────────────────
 *
 * 1. A marker SNAPS to a bar. The library resolves `marker.time` with
 *    `timeToIndex(time, true)` — nearest, not exact — so a release at 12:30
 *    on a 1H tape is drawn on a real bar rather than dropped. An overlay that
 *    projects the RAW event time instead lands between bars, or (via
 *    `timeToCoordinate`, which is exact-match) gets null and renders nothing.
 * 2. `aboveBar` is NOT a fixed strip at the top of the chart. Its y is
 *    `priceToCoordinate(bar.high) - halfSize - offset`, so it tracks the bar.
 * 3. Markers sharing a bar STACK, via an offset that resets per bar.
 */

/** `ceiledOdd` — upstream :4073. */
function ceiledOdd(x: number): number {
  const ceiled = Math.ceil(x);
  return ceiled % 2 === 0 ? ceiled - 1 : ceiled;
}

/** `ceiledEven` — upstream :4069. */
function ceiledEven(x: number): number {
  const ceiled = Math.ceil(x);
  return ceiled % 2 !== 0 ? ceiled - 1 : ceiled;
}

/** `size` — upstream :15388. Bar spacing clamped to [12, 30], then scaled. */
function scaledSize(barSpacing: number, coeff: number): number {
  return ceiledOdd(Math.min(Math.max(barSpacing, 12), 30) * coeff);
}

/** `calculateShapeHeight` — upstream :15403. The marker's vertical extent. */
export function markerShapeHeight(barSpacing: number): number {
  return ceiledEven(scaledSize(barSpacing, 1));
}

/** `shapeMargin` — upstream :15406. Also the FIRST marker's offset on a bar. */
export function markerShapeMargin(barSpacing: number): number {
  return Math.max(scaledSize(barSpacing, 0.1), 3);
}

/**
 * Index of the bar a marker at `timeMs` is drawn on.
 *
 * Mirrors `timeToIndex(time, true)` (upstream :6037): the first bar at or
 * AFTER the event, falling back to the last bar once the event is past the end
 * of the tape. Note this rounds up — a 12:30 release on 1H bars is drawn on
 * the 13:00 bar, not the 12:00 one. That is the library's choice; the point
 * here is to agree with it, not to improve on it, because the canvas marker is
 * the thing the trader is aiming at.
 *
 * `barTimes` must be ascending, which is what the chart is fed.
 */
export function snapMarkerIndex(barTimes: readonly number[], timeMs: number): number | null {
  if (!barTimes.length) return null;
  if (timeMs > barTimes[barTimes.length - 1]) return barTimes.length - 1;
  // lowerBound: first index whose time is >= timeMs.
  let lo = 0;
  let hi = barTimes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid] < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Vertical offsets for `count` markers sharing one bar, in draw order.
 *
 * Mirrors the `aboveBar` arm of `fillSizeAndY` (upstream :15701-15712) and the
 * per-bar reset in the layout loop (:15820-15824). Read the result as
 *   `y = priceToY(bar.high) - shapeHeight / 2 - offsets[i]`.
 *
 * `hasText` matters: a marker with a label reserves a text line ABOVE itself,
 * so a labelled stack is spaced further apart than an unlabelled one. Studio's
 * news markers always carry text, but the flag is explicit rather than assumed
 * so this stays a faithful mirror rather than a Studio-shaped one.
 */
export function aboveBarOffsets(
  count: number,
  opts: { barSpacing: number; fontSize: number; hasText: boolean },
): number[] {
  const shapeHeight = markerShapeHeight(opts.barSpacing);
  const margin = markerShapeMargin(opts.barSpacing);
  const out: number[] = [];
  let offset = margin;
  for (let i = 0; i < count; i++) {
    out.push(offset);
    // TextMargin is 0.1 upstream; the label consumes fontSize * (1 + 2 * 0.1).
    if (opts.hasText) offset += opts.fontSize * 1.2;
    offset += shapeHeight + margin;
  }
  return out;
}
