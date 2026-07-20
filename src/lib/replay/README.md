# Replay Studio

TradingView-style session replay for deliberate practice. Users load a
symbol/timeframe/date, step through candles at variable speed, place
simulated trades, tick a pre-trade checklist, drop bookmarks, take notes,
and receive a discipline score at the end.

## Files

- `types.ts` — `Candle`, `Timeframe`, `ReplaySession`, `ReplayTrade`,
  `ReplayChecklistItem`, `ReplayBookmark`.
- `market-data.ts` — `MarketDataProvider` abstraction + deterministic
  synthetic provider (seeded RNG → reproducible sessions).
- `score.ts` — `computeReplayScore` combining:
  - Discipline (% checklist ticked)
  - Risk (all trades had SL)
  - Execution (win rate + expectancy on closed trades)
  - Patience (bookmarks vs churn ratio)
  - Consistency (variance across trades)
  - Journal completion (notes count, journal linked)
- `storage.ts` — Screenshot / snapshot storage helpers.
- `constants.ts` — Timeframe map, playback speeds.

## Server functions

`src/lib/replay-studio.functions.ts` + `replay.functions.ts` — session
CRUD, trade recording, review generation.

## UI notes

The Replay chart (`src/components/replay/ReplayChart.tsx`) uses the same
`ChartAdapter` as the Trading Workspace so theme, zoom/pan, crosshair
tooltip and indicators are inherited — no duplicate chart code.
