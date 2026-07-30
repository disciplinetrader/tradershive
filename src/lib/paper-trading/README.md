# Paper Trading

Simulated trading module. Provides realistic pip/lot/PnL math so users can
practice without risking capital.

## Files

- `symbols.ts` — Symbol catalog (forex/crypto/stocks/indices/metals) with
  `pipSize`, `pipValuePerLot`, `contractSize`, `decimals`, lot bounds,
  seed price and mock-feed volatility. All calculators read from here.
- `calculations.ts` — Pure math: `pnl`, `pipsBetween`, `lotForRisk`,
  `directionSign`, `roundPrice`. Zero side effects, safe to memoize.
- `live-quotes.ts` — Live price hook. Subscribes to the Market Data
  Engine (`src/lib/market-data/engine.ts`) which routes to Binance for
  crypto and Twelve Data for forex/metals/indices. **No local ticker
  fabrication** — missing providers surface as clear errors rather than
  fake candles.
- `screenshots.ts` — Client helper for chart screenshot capture on trade
  close (feeds Journal auto-drafts).

## Server functions

`src/lib/paper-trading.functions.ts` — order lifecycle
(`openOrder`, `closeOrder`, `updateStopTake`, `listOpenTrades`,
`listClosedTrades`). All are `requireSupabaseAuth`-gated.

## Invariants

- P/L formula: `((exit - entry) / pipSize) * side * pipValuePerLot * lot`.
- Lot sizing: `riskAmount / (pipsBetween(entry, sl) * pipValuePerLot)`.
- All prices are rounded to symbol decimals before persisting.
- Closing a trade fires the `create_journal_draft_from_trade` trigger
  which auto-creates a Journal draft (see migrations).
