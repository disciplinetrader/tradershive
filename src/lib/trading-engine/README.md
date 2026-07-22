# Trading Engine

A modular, production-oriented broker simulator that sits **on top of** the
existing Yahoo Finance market-data layer. It never fetches prices — callers
push quotes in via `engine.onPrice(symbol, price)` or `engine.onQuotes({...})`.

## Layers

```
Market Data (existing Yahoo Finance)
        │
        ▼
   TradingEngine
   ├─ OrderEngine      (submit / cancel / fill / resting orders)
   ├─ PositionEngine   (open / increase / reduce / partial close / reverse)
   ├─ AccountEngine    (balance / equity / margin / buying power)
   └─ RiskEngine       (validation, margin call, stop-out, liquidation)
        │
        ▼
  Consumers: Trading Workspace, Replay, Journal, Analytics,
             Championships, AI Coach
```

## Files

| File | Owns |
| --- | --- |
| `types.ts` | Public types — `Order`, `Position`, `AccountSnapshot`, `TradingEvent`, `AccountConfig`, `ValidationResult`. |
| `leverage.ts` | `LEVERAGE_PROFILES` — per-asset-class max leverage + maintenance-margin ratios. |
| `costs.ts` | `COST_PROFILES` — spread / commission / slippage / swap per market. |
| `validation.ts` | `validateIntent()` — pre-flight report used by UI and engine. |
| `events.ts` | Tiny typed `EventBus`. |
| `engine.ts` | `TradingEngine` — the orchestrator. |
| `scenarios.ts` | `runScenarios()` — 14 validation scenarios (open/close, partial, reverse, SL/TP, limit, margin, NBP, stop-out, invariants). |
| `index.ts` | Public entry point. |

## Usage

```ts
import { TradingEngine, defaultConfig } from "@/lib/trading-engine";

const engine = new TradingEngine(defaultConfig({ starting_balance: 25_000 }));

engine.bus.onType("position_closed", (e) => {
  // pipe to journal / analytics
});

engine.onPrice("EUR/USD", 1.0891);

const { order, validation } = engine.submitOrder({
  symbol: "EUR/USD", side: "long", kind: "market",
  quantity: 0.10, stop_loss: 1.085, take_profit: 1.100,
});

if (!validation.ok) console.warn(validation.errors);

engine.onPrice("EUR/USD", 1.0920);
const snap = engine.snapshot();
// snap.balance, snap.equity, snap.floating_pnl, snap.used_margin,
// snap.free_margin, snap.margin_level, snap.buying_power, snap.status
```

## Guarantees

- **Invariants** — every snapshot satisfies:
  - `equity = balance + Σ floating_pnl` (0-clamped when NBP on)
  - `free_margin + used_margin = equity`
  - `net_pnl = balance − starting_balance`
- **NBP** — balance can never fall below zero when `negative_balance_protection` is on.
- **Stop-out** — when `margin_level ≤ stop_out_level`, the engine
  liquidates worst-losing positions until margin recovers.
- **Netting** — same-side fills merge with volume-weighted average price;
  opposite-side fills reduce or reverse.
- **Order lifecycle** — `submitted → working → filled/cancelled/rejected`
  with typed events at every step.

## Events

`account_updated`, `order_submitted`, `order_filled`, `order_cancelled`,
`order_rejected`, `position_opened`, `position_modified`, `position_closed`,
`margin_call`, `stop_out`, `liquidation`, `balance_updated`.

## Validation harness

```ts
import { runScenarios } from "@/lib/trading-engine";
const report = runScenarios();
console.log(`${report.passed}/${report.total} passed`);
```

## Integration notes

- The engine is a pure in-memory calculator. Persistence stays in
  `src/lib/paper-trading.functions.ts` (Supabase) — the engine can be
  hydrated from those rows via `engine.hydrate({ balance, positions, orders })`.
- Replay Studio can instantiate its own engine per session and pump
  historical candles through `onPrice` to simulate broker behaviour bar by
  bar.
- Downstream modules (Journal, Analytics, AI Coach) subscribe to
  `bus.onType("position_closed", ...)` rather than reimplementing PnL math.
