# TradingView-parity Charting

Design tokens for the minimalist 3px look are already in `src/styles.css`. This plan covers the five charting capabilities you selected. Everything reuses the existing `ChartEngine` + `MarketDataEngine` and is scoped to the Trading Workspace so nothing else regresses.

## 1. Multi-chart / multi-timeframe grid

- Extend `ChartSettings` with `panes: Array<{ symbol; timeframe; chartType; indicators }>` and a `layout` picker (1×1, 2×1, 1×2, 2×2, 3×1) in the top toolbar.
- Each pane is an independent `ChartEngine` instance so BTC 1m / BTC 15m / BTC 1H can sit side by side. Active pane is highlighted; toolbar edits target it.
- Persist to `chart_layouts` (already exists).

## 2. Functional drawing tools

- New `DrawingsLayer.tsx` — an absolutely-positioned SVG synced to the adapter's `priceToY` / `timeToX`. Redraws on `visibleRangeChanged` and on tick.
- Tools wired end-to-end: Trend line, Horizontal, Vertical, Ray, Rectangle, Fib Retracement (7 levels), Arrow, Text, Measure.
- Interactions: click-to-place points, drag endpoints, right-click to delete, ESC cancels, Delete key removes selection.
- Persist to `chart_drawings` (already exists) keyed by `(user_id, symbol, timeframe)`; load on mount.

## 3. Multi-pane oscillators

- Rework `lightweight` adapter to support **sub-panes**: RSI, MACD, Stochastic, ADX, CCI, OBV each render in their own stacked pane with independent price scale and shared time axis (via `lightweight-charts` `panes` API).
- Pane heights are resizable via a thin drag handle between panes; state saved to `chart_preferences`.

## 4. Compare symbols overlay

- "+ Compare" button in the chart info bar. Adds a second (or third) symbol as a percentage-normalized line series on the same price pane, colored per symbol with its own legend chip and remove button.
- Base symbol stays as candles; comparisons update live from the MarketDataEngine.

## 5. Object tree + templates

- Right-side collapsible "Objects" panel listing every drawing and indicator on the active pane with visibility toggle, lock, rename, delete, and jump-to.
- "Templates" menu in the Indicators dropdown: Save current indicator set as a named template → stored in `chart_indicator_sets`; one-click apply/replace.

## Technical notes

- No schema changes needed — `chart_drawings`, `chart_layouts`, `chart_indicator_sets`, `chart_preferences`, `chart_templates` all exist.
- All persistence via existing `src/lib/chart/storage.ts` (extend with `saveDrawing`, `listDrawings`, `saveTemplate`, `listTemplates`).
- Adapter contract in `src/lib/chart/adapter.ts` gains: `addPane`, `removePane`, `addCompareSeries(symbol)`, `getPaneCount`, and preserves the swap-in path for the official TradingView library later.
- Keyboard: `Alt+T` trend line, `Alt+H` horizontal, `Alt+F` fib, `Alt+R` rectangle, `Alt+C` compare, `Del` delete selected, `Esc` cursor.

## Out of scope (for this pass)

- Cross-hair sync across panes in the multi-chart grid (nice-to-have, adds later).
- Real TradingView Advanced Charts library swap (loader is already in place at `src/lib/chart/tv-loader.ts`; drops in when the licensed bundle is added to `public/charting_library/`).

Approve and I'll build all five in one pass.
