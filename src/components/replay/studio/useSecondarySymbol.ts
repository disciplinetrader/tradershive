/**
 * MSYM-1 · load and project one secondary symbol for a display-only pane.
 *
 * The session's own symbol drives the clock and owns every fill. This hook
 * fetches a DIFFERENT instrument over the same absolute time range and hands
 * back only the bars the clock has already reached, using the pure projector
 * in `@/lib/replay/secondary-symbol`.
 *
 * Two decisions worth keeping:
 *
 * **The whole range is fetched once, not per tick.** `getReplayCandles` is the
 * same server function the session itself uses, and the query key is the
 * symbol plus the range — so switching a pane back to a symbol already seen is
 * a cache hit, and the clock advancing never refetches anything. Fetching
 * incrementally as the clock moved would put a network round-trip inside the
 * playback loop and make the projection non-deterministic.
 *
 * **The slice is memoised on `visibleCount`, not on the clock.** At 100x the
 * clock emits a large batch of observations per frame while `visibleCount`
 * changes only when a whole secondary bar opens, which for a coarser secondary
 * timeframe may be every few hundred observations.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReplayCandles } from "@/lib/replay.functions";
import type { Candle, Timeframe } from "@/lib/market-data/types";
import { projectSecondary, type SecondaryProjection } from "@/lib/replay/secondary-symbol";

export interface SecondarySymbolState extends SecondaryProjection {
  /** Bars the clock has reached. Never includes the future. */
  candles: Candle[];
  isLoading: boolean;
  /** Set when the fetch failed — the pane must say so rather than draw empty. */
  error: string | null;
  /** True once loaded and the instrument has no bars in this range at all. */
  empty: boolean;
}

export interface UseSecondarySymbolArgs {
  /** Instrument to display. Null disables the hook entirely. */
  symbol: string | null;
  timeframe: Timeframe;
  /** Absolute session bounds — the same range the primary dataset covers. */
  from: number;
  to: number;
  market?: string;
  /** Open time of the primary session's newest bar. Null before the clock starts. */
  primaryTimeMs: number | null;
}

export function useSecondarySymbol({
  symbol, timeframe, from, to, market, primaryTimeMs,
}: UseSecondarySymbolArgs): SecondarySymbolState {
  const getCandles = useServerFn(getReplayCandles);

  const query = useQuery({
    queryKey: ["replay-secondary-candles", symbol, timeframe, from, to, market ?? null],
    enabled: !!symbol && Number.isFinite(from) && Number.isFinite(to) && to > from,
    // The range is immutable for a session, so this never needs refetching.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: () =>
      getCandles({
        data: { symbol: symbol as string, timeframe, from, to, market },
      }),
  });

  const all = useMemo<readonly Candle[]>(() => {
    const data = query.data as { candles?: Candle[] } | Candle[] | undefined;
    if (!data) return [];
    return (Array.isArray(data) ? data : (data.candles ?? [])) as Candle[];
  }, [query.data]);

  const projection = useMemo(
    () => projectSecondary(all, primaryTimeMs),
    [all, primaryTimeMs],
  );

  const candles = useMemo(
    () => all.slice(0, projection.visibleCount) as Candle[],
    [all, projection.visibleCount],
  );

  return {
    ...projection,
    candles,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    empty: !query.isLoading && !query.error && all.length === 0 && !!symbol,
  };
}
