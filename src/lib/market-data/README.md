# Market Data Engine

The single source of truth for quotes and candles across Paper Trading,
Charts, Replay, AI Coach and the Dashboard.

## Design

Providers implement `MarketDataProvider` (`types.ts`) exposing
`subscribeQuote(symbol, cb)` and `getCandles(query)`. The **engine**
(`engine.ts`) is a client-side orchestrator that:

1. Routes each symbol to the correct provider (Binance for crypto,
   Twelve Data for forex/metals/indices, Mock as a dev fallback).
2. Deduplicates subscribers so N components watching `BTCUSDT` = one
   upstream websocket.
3. Caches recent candles in `cache.ts` with a per-timeframe TTL.
4. Emits provider errors instead of silently fabricating data — the UI
   shows the last-known price rather than a fake tick.

## Files

- `types.ts` — `MarketDataProvider`, `Quote`, `Candle`, `Timeframe`.
- `engine.ts` — Client orchestrator (`marketData` singleton).
- `providers/` — Provider implementations (Binance WS, Twelve Data REST,
  Mock deterministic feed).
- `cache.ts` — In-memory TTL cache keyed by `symbol|tf|from|to`.
- `sessions.ts` — Trading session boundaries (Asia / London / New York)
  used by session indicators.
- `descriptors.ts` — Human-readable metadata for provider health UI.
- `credentials.server.ts` + `crypto.server.ts` — Admin-managed API keys,
  encrypted at rest with AES-256-GCM.
- `historical/` — Backfill jobs (Dukascopy / Binance / Stooq) with
  aggregation from 1m → higher timeframes.
- `tv-datafeed.ts` — TradingView Datafeed adapter (`resolveSymbol`,
  `getBars`, `subscribeBars`) — plug the engine into TV Advanced Charts.
- `hooks.ts` — React hooks (`useQuote`, `useCandles`) wired to the engine.

## Rules

- Never call a provider directly from a component — go through `marketData`.
- Never fabricate ticks. Missing config = visible error, not silent mock.
- Historical import jobs are admin-only (RLS restricted).
