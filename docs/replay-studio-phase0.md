# Replay Studio — Phase 0 ("wire what exists")

State as of 2026-08-17. Phase 0 came out of a competitor study against FX
Replay: three of its "gaps" turned out to be code that already existed but was
unreachable, inert, or absent from Studio specifically. All three are now done.

| # | Item | State |
| --- | --- | --- |
| 3 | Session-open jumps | **Done** — `1286f910`, confirmed in-app |
| 1 | Spread / slippage | **Done** — `ed5b7b38`, confirmed in-app |
| 2 | Right-click trading on the chart | **Done** — `b9df7686`, confirmed in-app |

**Phase 0 is complete.** What follows is kept as the record of how item 2 was
resolved, because the coupling question it answers recurs whenever a second
surface needs an existing chart component.

---

## Item 2 — right-click trading in Replay Studio (DONE)

### What was missing

`ChartContextMenu.tsx` exists and is imported by exactly one file,
`src/components/trading/TradingWorkspace.tsx`. No component under
`src/components/replay/studio/` has an `onContextMenu` handler. Studio can only
be traded through the ticket and the toolbar buttons (Buy / Sell / Buy limit /
Sell limit), which is what a browser check on 2026-08-17 confirmed.

So this is **not** "build order placement". Studio already places orders. It is
mounting a menu on the chart and mapping a click to a price.

### What already exists and must be reused, not rewritten

**Above/below-market inference** — the behaviour FX Replay advertises as
"it detects whether the clicked price is above or below market and offers the
correct Buy/Sell options automatically". Two pieces:

- `src/lib/chart/orders/model.ts` → `inferOrderType(...)`. Given a click price
  and the current market price, returns which of `buy_limit` / `buy_stop` /
  `sell_limit` / `sell_stop` that click means. A buy below market is a limit; a
  buy above it is a stop; and the mirror for sells.
- `src/lib/replay/chart-trading.ts` → `DraftOrder`, which carries
  `typePinned: boolean`. Once the trader picks a type by hand, inference stops
  overriding them. That flag is the whole reason the feature is not annoying,
  and it is already written.

**Placing the order** — `useReplayStudio()` exposes
`placeOrderAt(direction, { entry, stop, target }, opts?)`, which is the chart-
native path (Phase C). It already handles pending vs market. The context menu
should call this, not build its own order.

**Sizing** — `sizeForRisk(entry, stop)` on the same context turns a risk
percentage into units, and `riskPercent` / `setRiskPercent` are already wired
to the toolbar's risk field.

### What had to be built

1. **Click → price.** The adapter exposes `priceToY`; the inverse is what a
   context menu needs. Check `src/lib/chart/adapters/lightweight.ts` for an
   existing `yToPrice` before writing one — `StudioTradeLayer` positions its
   levels through the adapter already.
2. **Mounting.** `StudioChart.tsx` owns the canvas; `StudioTradeLayer.tsx` owns
   the overlay. The menu belongs wherever the pointer events already land.
3. **Deciding whether `ChartContextMenu` is reusable.** It was written against
   `TradingWorkspace` state. If it is coupled, extract the presentational part
   rather than forking it — a second context menu is a second set of order
   semantics, which is the divergence pattern this codebase keeps paying for
   (five session modules, two P&L formulas — see BA-10).

### How it was verified

This is the one Phase 0 item that **cannot be verified from tests alone**; the
other two were pure functions. Verification needs a browser, and the pattern
that worked for items 1 and 3 was:

1. Seed a session against real data. Only `BTC/USDT 5m` and `EUR/USD 15m` have
   stored candles (8,644 and 4,735 rows). BTC covers 2026-07-01 → 2026-07-31
   contiguously. Anything else shows a correct "no historical data" error,
   because local backfill is broken (`SUPABASE_SERVICE_ROLE_KEY` is unset).
2. State the expected numbers BEFORE testing, so there is a real prediction to
   fail. Every ambiguous result this session came from testing without one.
3. Remember a session **resumes** from its autosave snapshot; it does not reset
   on reload. A clean start needs a NEW session id.

---

## Done in Phase 0, and the three bugs found on the way

**Item 3 — session jumps** (`1286f910`). `sessionJumpTargets` offers the next
Sydney / Tokyo / London / New York open, resolved through each centre's own
timezone via `@/lib/market-sessions`, rendered in the transport bar's existing
"Jump to" popover. Unreachable targets are disabled with their reason and still
show the time they would have been. The NYSE bell appears only on equity and
index sessions — it is 09:30 ET against the FX open's 08:00 ET, and noise on a
crypto chart.

**Item 1 — spread and slippage** (`ed5b7b38`). Snapshotted onto
`replay_sessions.spread` / `.slippage` at creation, NOT read from localStorage
at tick time: a replay is reproducible by construction (the dataset is
checksummed), and runtime settings would mean two traders on one session get
different fills. localStorage remains the default for a NEW session only.
Entries transact on their own side of the spread, exits on the closing side, so
a round trip pays it twice; slippage is adverse-only, on market and stop fills.
Measured in the app on BTC at spread 10 / slippage 5: buy filled 63154.01, sell
63134.01, exactly 20.00 apart.

### Bugs found while verifying, all shipped

1. **`sessionJumpTargets` offered a target the cursor was already on.**
   `nextSessionOpen` is inclusive of `from`, which is right for "which session
   is at or after this instant" and wrong for a jump — standing exactly on the
   London open, the button would seek to where the cursor already was. Caught
   by a test, not a review.
2. **Reload resumes, it does not reset** (`loader.ts` → `resumeSession`). Not a
   bug in the code — a bug in what we assumed while testing, and it cost two
   rounds of wrong expectations. Written down here because it will do so again.
3. **A fresh session started 437 bars before its own `range_start`**
   (`c1e6bdf8`). `bootstrapSession`'s `startCursor` was consumed as an
   OBSERVATION index while every caller counted CANDLES. 600 warm-up bars
   passed as 600 observations landed on candle 163 at ~3.68 observations per
   candle. The contract is now `startCursorCandles` and the loader converts via
   `dataset.observationOffsets[i]`. Three regression tests pin the units.

---

## Not Phase 0, still open

- **E2E-1** — the UI suite fails as a suite while its specs pass individually.
  Unrelated to Studio: that was chased to a conclusion this session and the
  "empty DOM" readings were an unhydrated SSR shell plus a session with no
  candles, not a dev-server fault.
- **MS-1** — the session rule has no concept of weekends, so it will offer
  "London open" on a Saturday and labels weekend crypto trades with FX session
  names.
- Phase 1 and beyond from the competitor study: performance calendar, Monte
  Carlo projection, multi-chart replay, economic calendar overlay.

---

## How item 2 actually resolved (2026-08-17)

**Reused directly, not extracted.** `ChartContextMenu` was already
presentational — four props, no workspace context, no hooks, and it binds its
listener to whatever parent it is rendered into. Everything workspace-specific
lived in the caller's `onIntent`. Moved to `components/chart/` and mounted in
`StudioChart`'s `chartWrapRef`, beside `StudioTradeLayer`.

Three duplications were found DURING the work, all pre-existing:

1. The menu inferred order type inline (`state.price < livePrice`) instead of
   calling `inferOrderType`. Folded onto the canonical rule. Edge behaviour
   changed deliberately: a click within one tick of the market now resolves to
   `market` rather than offering a stop where the market already is, and a
   missing live price declines to guess instead of defaulting to stop.
2. Studio's armed click-to-place derived stop/target/size inline. Extracted to
   `bracketFor` in `replay/chart-trading.ts`, now shared with the menu handler.
3. A THIRD `inferOrderType` lives in `replay/chart-trading.ts`. Deliberately
   untouched — it returns a side-agnostic `limit | stop` with a much wider
   tolerance (5% of recent range, not one tick) for the ticket's drag
   interaction. Different consumers and a different type, so not a duplicate to
   collapse; recorded here so the next person does not "fix" it by accident.

Verified in the browser against predictions stated in advance: market 63144.01,
right-click above at 63271.07 → Buy Stop / Sell Limit, below at 61451.78 → Buy
Limit / Sell Stop, and placing produced entry 61451.78 / stop 61328.88 /
target 61697.59 — the 0.2% stop and 2R target exact to the cent.
