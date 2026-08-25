/**
 * Click-to-open detail for the economic calendar markers on the replay chart.
 *
 * `StudioChart` draws a coloured square above the bar with the title cut to 42
 * characters and no values, so a trader can see that something happened and
 * not what. This layer makes each of those markers clickable and shows the
 * whole record.
 *
 * ── ANTI-LOOKAHEAD · the one rule this file must not break ─────────────────
 *
 * `events` MUST be the caller's gated list (`visibleNews` in `StudioChart`,
 * i.e. `newsEvents.filter(e => e.timeMs <= marketTime)`), NEVER the raw
 * `newsEvents` query result. Verified 2026-08-24: markers are built from that
 * same gated list, so an event the replay clock has not reached has no marker,
 * nothing to click, and no reachable detail — including its forecast.
 *
 * That is stricter than reality, deliberately. A live trader genuinely does
 * know the calendar ahead: both the schedule and the consensus forecast are
 * published in advance, and only `actual` is unknowable before the release.
 * The strict rule is kept because it costs nothing — unreached events have no
 * marker to attach to — and because loosening it should be a deliberate
 * decision someone makes about replay integrity, not a side effect of adding a
 * popover. See EC-9 in `docs/known-issues.md` for the one place unreached
 * event data does currently reach the UI.
 *
 * Passing an ungated list here would leak a forecast into a session that has
 * not reached the release, which is the same integrity failure the Xoomar
 * look-ahead filter exists to prevent, one layer up.
 *
 * ── Why an overlay and not a chart callback ────────────────────────────────
 *
 * Markers are handed to lightweight-charts through `setExternalMarkers` and
 * drawn into its canvas; no marker identity comes back out, and the adapter
 * exposes projection but no click or hit-test. Making the canvas markers
 * themselves clickable would mean coupling to the charting library's own
 * hit-testing — far more than this feature is worth. So this mirrors
 * `StudioTradeLayer`: an absolutely positioned sibling that projects its own
 * hit-targets and re-renders off a `tick`, because the canvas emits no React
 * updates when it moves.
 *
 * The cost of that choice is that marker PLACEMENT has to be reproduced rather
 * than read. `@/lib/chart/marker-geometry` is that reproduction, transcribed
 * from the renderer with upstream line numbers; this file only decides which
 * events to place. Getting it wrong is invisible — the marker still draws, the
 * target just is not under it — which is exactly how the original miss survived
 * review. `DrawingLayer` still has the projection half of that bug: see EC-10.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChartAdapter } from "@/lib/chart/adapter";
import { aboveBarOffsets, markerShapeHeight, snapMarkerIndex } from "@/lib/chart/marker-geometry";
import type { Candle } from "@/lib/market-data/types";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { formatEventClock, formatValue, timezoneAbbrev } from "@/lib/economic-calendar/format";
import { ImpactDots } from "@/components/economic-calendar/ImpactDots";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { detectTimezone } from "@/lib/analytics/periods";
import { cn } from "@/lib/utils";

interface Props {
  adapter: ChartAdapter | null;
  /**
   * ALREADY GATED by the replay clock. See the header — this is not the place
   * to filter, it is the place that trusts the caller to have filtered.
   */
  events: EconomicEvent[];
  /**
   * The bars the SERIES currently holds — i.e. the folded array `StudioChart`
   * pushed via `setCandles`, not the raw base-timeframe tape. Markers snap to
   * these bars, so a mismatch here puts every hit-target on the wrong bar.
   */
  candles: Candle[];
  /** Anything that changes when chart geometry moves (cursor, timeframe, size). */
  tick?: number | string;
  /**
   * The chart axis's timezone. Shown as the PRIMARY clock so the popover and
   * the axis under it never read as two different times for one bar.
   */
  chartTimezone: string;
}

/** One published figure. Identical null handling to the calendar page. */
function Figure({ label, value }: { label: string; value: string | null }) {
  const shown = formatValue(value);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", shown === "—" ? "text-muted-foreground/60" : "text-foreground")}>
        {shown}
      </span>
    </div>
  );
}

export function StudioNewsLayer({ adapter, events, candles, tick, chartTimezone }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const localTimezone = useMemo(() => detectTimezone(), []);

  // Reproject whenever the chart moves. Same reason as StudioTradeLayer: the
  // chart is a canvas and does not re-render React when it pans or resizes.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { force((n) => n + 1); }, [tick, events]);

  // An event that scrolls out of view — or falls off the gated list as the
  // session is rewound — must not leave a popover open over nothing.
  useEffect(() => {
    if (openId && !events.some((e) => e.id === openId)) setOpenId(null);
  }, [events, openId]);

  /**
   * Hit-targets placed exactly where the canvas markers are drawn.
   *
   * Three things have to agree with the renderer or the target lands somewhere
   * the marker is not, and the click silently does nothing:
   *
   *  · SNAP. A marker is bound to a BAR, not to its own timestamp. This walks
   *    the same `snapMarkerIndex` rule and then projects the BAR's time, which
   *    is what the canvas draws at. Projecting the raw event time through
   *    `adapter.timeToX` is what broke: that path is exact-match and returns
   *    null for any release not landing on a bar open — which is most of them,
   *    since the big ones print at :30 on an hourly tape.
   *  · VERTICAL. `aboveBar` tracks the bar's high; there is no fixed strip.
   *  · STACKING. Two releases on one bar are offset, and must be offset here
   *    by the same amounts, in the same order.
   *
   * `getCoords().x` interpolates (and extrapolates past the last bar), so it
   * survives a bar time the exact-match path would reject.
   */
  const placed = useMemo(() => {
    const coords = adapter?.getCoords?.() ?? null;
    const layout = adapter?.markerLayout?.() ?? null;
    if (!adapter || !coords || !layout || !candles.length) return [];

    const barTimes = candles.map((c) => c.time);
    const shapeHeight = markerShapeHeight(layout.barSpacing);

    // Group by bar, preserving the caller's time-ascending order: the
    // renderer's stack offset is order-sensitive, so the second event on a bar
    // must be the second one here too.
    const byBar = new Map<number, EconomicEvent[]>();
    for (const event of events) {
      const idx = snapMarkerIndex(barTimes, event.timeMs);
      if (idx == null) continue;
      const group = byBar.get(idx);
      if (group) group.push(event);
      else byBar.set(idx, [event]);
    }

    const out: Array<{ event: EconomicEvent; x: number; y: number; size: number }> = [];
    for (const [idx, group] of byBar) {
      const bar = candles[idx];
      const x = coords.x(bar.time);
      const highY = adapter.priceToY(bar.high);
      if (x == null || highY == null || !Number.isFinite(x) || !Number.isFinite(highY)) continue;
      // Studio's markers always carry a label (`${currency} ${title}`), which
      // widens the stack spacing — see `aboveBarOffsets`.
      const offsets = aboveBarOffsets(group.length, {
        barSpacing: layout.barSpacing,
        fontSize: layout.fontSize,
        hasText: true,
      });
      group.forEach((event, i) => {
        out.push({ event, x, y: highY - shapeHeight / 2 - offsets[i], size: shapeHeight });
      });
    }
    return out;
    // `tick` is in the dep list because projection depends on chart geometry,
    // which React cannot observe directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, events, candles, tick]);

  if (!adapter) return null;

  const sameZone = chartTimezone === localTimezone;

  return (
    // z-20 puts the targets above the trade layer's tint but below its
    // draggable order lines' actions, which are the more frequent interaction.
    // `pointer-events-none` on the host with `auto` on each target keeps the
    // rest of the chart clickable — order placement still works underneath.
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-20">
      {placed.map(({ event, x, y, size }) => (
        <Popover
          key={event.id}
          open={openId === event.id}
          onOpenChange={(o) => setOpenId(o ? event.id : null)}
        >
          <PopoverAnchor asChild>
            {/* Centred on the marker the canvas drew underneath. Sized to the
                renderer's own shape height so the target is the marker rather
                than a band that happens to contain it — this stays transparent
                and merely catches the click. */}
            <button
              type="button"
              aria-label={`${event.currency} ${event.title}`}
              onClick={() => setOpenId((cur) => (cur === event.id ? null : event.id))}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` }}
            />
          </PopoverAnchor>
          {/* Opens UPWARD: the anchor now sits on the marker itself, just above
              the bar's high, so `bottom` would drop the panel straight over the
              price action it is describing. Radix flips it back when there is
              no room above, and gives outside-click and Escape dismissal for
              free — which is why this is a Popover and not a hand-rolled panel. */}
          <PopoverContent side="top" align="center" sideOffset={8} collisionPadding={8} className="w-72 space-y-2 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded-sm bg-background/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                {event.currency}
              </span>
              <ImpactDots impact={event.impact} className="mt-1.5 shrink-0" />
              {/* Untruncated — the 42-character cut on the canvas marker is a
                  drawing constraint, and reading the full name is the reason
                  this popover exists. */}
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{event.title}</span>
            </div>

            <div className="space-y-0.5 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Chart time</span>
                <span className="font-mono tabular-nums">
                  {formatEventClock(event.timeMs, chartTimezone)}
                  <span className="ml-1 text-muted-foreground">{timezoneAbbrev(chartTimezone, event.timeMs)}</span>
                </span>
              </div>
              {/* Only when it differs — repeating one clock twice under two
                  labels reads as a bug. */}
              {sameZone ? null : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">Your time</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatEventClock(event.timeMs, localTimezone)}
                    <span className="ml-1">{timezoneAbbrev(localTimezone, event.timeMs)}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-0.5 border-t border-border/60 pt-2 text-xs">
              <Figure label="Previous" value={event.previous} />
              <Figure label="Forecast" value={event.forecast} />
              <Figure label="Actual" value={event.actual} />
            </div>

            <div className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {event.source}
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
