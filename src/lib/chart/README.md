# Chart Engine

Chart rendering + indicator library. Wraps `lightweight-charts` behind a
`ChartAdapter` interface so the rendering backend can be swapped
(TradingView Advanced Charts is the intended migration).

## Files

- `adapter.ts` — `ChartAdapter` interface (mount/destroy, setCandles,
  applySettings, addPriceLine, setExternalMarkers, screenshot, …).
- `adapters/lightweight.ts` — The concrete `lightweight-charts` adapter.
  Handles OKLCH → RGB resolution (via canvas paint bridge), theme
  reactivity (`MutationObserver` on `<html>`) and indicator overlays.
- `indicators.ts` — Pure vectorised indicators. Safe to memoize.
  - Trend: SMA, EMA, VWAP, Ichimoku, SuperTrend
  - Volatility: Bollinger, ATR, Donchian
  - Momentum: RSI, MACD
  - Structure: Support/Resistance, Fibonacci
  - Sessions: Asia/London/NY histograms
  - SMC/ICT: BOS, CHoCH, Fair Value Gaps, Order Blocks
  - Chart types: Heikin Ashi transform
- `types.ts` — `ChartSettings`, `ChartType`, `IndicatorConfig`.
- `storage.ts` — Persist per-user chart preferences.
- `tv-loader.ts` — Optional loader for TradingView Advanced Charts.
- `constants.ts` — Timeframes, defaults.

## Rules

- Components import from `@/components/chart/ChartEngine` — never
  `lightweight-charts` directly.
- Colors come from CSS tokens (`--primary`, `--success`, `--danger`,
  `--muted-foreground`) and are resolved through the canvas bridge to
  survive `oklch()` serialization.
- `setCandles` fits content only on first push; subsequent updates
  preserve the user's zoom/pan.
