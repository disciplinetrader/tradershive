# Replay Studio — Phase 2 ("the depth phase")

State as of 2026-08-18. Phase 2 is the last three items from the competitor
study. The investigation that opened it changed the phase: **only one of the
three was greenfield.** One was already built and mounted and starved of data;
one was already built against the wrong clock.

| # | Item | State |
| --- | --- | --- |
| 3 | Prop-firm challenge mode | **In progress** — rules exist, bound to the wrong clock |
| 1A | Multi-pane replay (one symbol, N timeframes) | **Approved, not started** |
| 2 | Economic calendar overlay | **Partial by decision** — code done, feeds to be fixed; see EC-1 |
| 1B | Multi-symbol replay | **Parked** — see MSYM-1 |

Approved order: **3 → 1A → 2 (partial)**, 1B parked.

---

## Item 1 — the shape, and why it is two features

The study's "16 charts / 5 assets" is two features sharing a name, an order of
magnitude apart in cost. They were separated before scoping, not after.

### 1A — panes of one symbol at N timeframes (approved)

Mostly already built. `src/lib/replay/aggregate.ts` folds the base dataset into
any higher timeframe deterministically — "never re-fetched, so the chart can
never show a bar the clock has not yet reached" — and `StudioChart` already
drives it through `displayTf` with a working switcher.

One dataset, one checksum, one cursor, one order book. What is missing is
**layout only**: N chart instances reading the same `view.candles` at different
folds. No engine change, no dataset change, no cursor change.

### 1B — independent symbols on one clock (PARKED — MSYM-1)

Blocked at the execution engine, not the chart. The decisive line is
`src/lib/chart/orders/observation.ts:93`: `MarketObservation` is
`{ price, time }` with **no symbol**, and `runEngineTick`
(`chart/orders/service.ts:637`) evaluates `stores.orders.list()` — *every*
order — against that one price. `runManagementTick` iterates every position the
same way. A second symbol's price would fill the first symbol's orders.

This is the CANONICAL engine, shared with live charts. It is single-instrument
by construction.

**Does the dataset checksum extend to a set?** Yes, and cheaply. `datasetId` is
already a composite string (`provider:symbol:timeframe:start:end:checksum`), so
a set identity is an ordered hash of member ids. That is the easy half.

**What breaks in the cursor — the hard half.** `ClockSnapshot.cursor` is an
observation index into ONE dataset. Observations per candle are 2–4 and depend
on each bar's own shape (`observationsFromCandle` collapses duplicate prices, so
a doji yields fewer). Observation index N on EUR/USD and index N on GBP/USD are
therefore **different moments in time**. One cursor cannot drive two datasets.

Two ways out, and the recommendation is recorded here so it does not have to be
re-derived when data exists:

- **N clocks seeked to a shared market time.** `seekForwardTo(timeMs)` already
  exists and replays everything in between. Cursor becomes a map of
  `datasetId → cursor`; snapshot, resume and autosave all widen. This fits the
  existing code.
- **One clock on a merged timeline.** Rejected. Merging two symbols' bars into
  one observation stream means the checksum covers a synthetic construct, and a
  gap in one symbol silently shifts the other.

Either way, `advance()` paces in CANDLES per second (`CANDLES_PER_SECOND_AT_1X`),
not time, so two datasets at different timeframes or with different gaps drift.
Pacing must move to market time.

**The recommended approach when it unparks:** per-symbol order stores and
per-symbol engine instances, NOT adding a symbol field to `MarketObservation`.
Adding the symbol touches the canonical engine that live trading runs on — the
largest blast radius proposed in any phase. Per-symbol instances leave it alone.

**Why it is parked, and it is not about engineering cost.** Measured against
`historical_candles` on 2026-08-18: **2 of the 33 registered symbols have any
bars at all.**

| Symbol | TF | Bars | Range |
| --- | --- | --- | --- |
| BTC/USDT | 5m | 8,644 | 2026-07-01 → 07-31 |
| EUR/USD | 15m | 4,735 | 2026-06-26 → 08-14 |

GBP/USD, USD/JPY, AUD/USD, XAU/USD, every equity and index: zero.
`SUPABASE_SERVICE_ROLE_KEY` is absent from both env files, so backfill cannot
run locally either. A correlated-pairs session cannot be built OR verified
today at any price.

**The user story, recorded for whenever it unparks:** multiple independent
correlated symbols on one clock — watch GBP/USD react while trading EUR/USD.
Explicitly NOT multiple panes of one symbol, which is what 1A covers. 1B is
real future work, not redundant with 1A.

---

## Item 2 — built, mounted, and starved (PARTIAL by decision — EC-1)

`src/lib/economic-calendar/` already exists (types, client API + hook, server
ingest), the cron route exists at `/api/public/hooks/economic-calendar`, and it
is **already mounted** in `StudioChart.tsx:206-240`: markers on the chart,
filtered to the symbol's currencies via `currenciesForSymbol`, restricted to
high/medium impact, gated on `e.timeMs <= marketTime` so it cannot leak
information ahead of the clock, a `nextNews` for a go-to-news jump, and a
visible toggle.

The overlay is done. The gap is data, measured on 2026-08-18:

- `economic_events`: **0 rows**.
- Of the three configured feed URLs, **two return HTTP 404**
  (`ff_calendar_lastweek.json`, `ff_calendar_nextweek.json`). Only
  `ff_calendar_thisweek.json` responds: 96 events, 2026-08-16 → 2026-08-21,
  8 high / 13 medium impact.

**Historical versus structural is not a choice here, it is forced.** The code
already wants historical and is right to. The surviving feed carries one week,
forward-only. The replay data is July 2026. Running the cron right now yields
zero markers on every session that exists, and accumulating from today never
retro-covers a July replay.

**Decision:** fix the two dead URLs so history starts accruing from today, then
stop. Full historical backfill is **EC-1** — blocked on a data-provider
decision that is the product owner's to make, not a Phase 2 code task. It is
logged as its own item and is explicitly NOT folded into "done".

---

## Item 3 — the rules exist, bound to the wrong clock (IN PROGRESS)

Far more complete than the study suggested: `src/lib/prop-challenges/`
(evaluator, presets, active-session), `prop-challenges.functions.ts`, five
components, three live routes under `/replay/prop-firm`. Real fields —
`profit_target_pct`, `max_daily_loss_pct`, `max_total_drawdown_pct`,
`min_trading_days`, `peak_equity`, `breach_reason`.

But it binds to `paper_account_id`, ticks server-side off closed **paper**
trades, and paces on `Date.now()` and calendar days. Nothing under
`src/components/replay/studio/` references it — `ChallengePanel` mounts in
`TradingWorkspace`. The routes sit in the Replay URL namespace while the
feature runs on live paper trading.

### Three collisions found before touching it

1. **A second prop-rule implementation.** `trading-engine/prop-firm-rules.ts`
   (`evaluatePropFirmRules`), reachable only from `scenarios-phase3.ts`, a
   self-test harness that nothing calls. Two implementations of one idea, one
   dead. Collapsed FIRST rather than built on — same decision as BA-10 and the
   `inferOrderType` copies. See below.
2. **A name collision.** `replay_challenges` / `user_replay_challenges` (8 rows:
   `max-3-trades`, `risk-1`, `long-only`…) are gamified discipline challenges
   with XP/coin rewards, unrelated to prop evaluation — and
   `replay_sessions.challenge_id` points at THAT table, not at `prop_challenges`.
3. **A dormant enum.** `SessionPurpose` already includes `"challenge"`, but
   there is no `purpose` column on `replay_sessions`, so `loader.ts:135`
   resolves it to `"practice"` every time.

### What is genuinely missing is smaller than it looks

`AccountHud` already computes balance, equity, open P&L, realized, peak equity
and drawdown live from the canonical stores. It is presentation-only today
("Peak equity is tracked locally only to render the drawdown figure") — which is
exactly the state a breach check needs. The engine already has
`complete(reason)` and the `completeOnExhaustion` precedent, so "end the session
on breach" has a natural home.

Two real pieces of work:

- **Bind the daily reset to replayed market time, not wall clock.** This is
  precisely the bug class Phase 1 fixed — Studio omitted `now` at all four
  manual mutator call sites and stamped replayed trades with today. Use the
  `tick.time` pattern. Do not reintroduce it.
- **The breach moment.** Today the live version's breach is one line in the
  HUD — a silent status flip. The requirement is a real modal / full-screen
  moment carrying the same weight as the Ready?/countdown transitions elsewhere
  in the product: immediate, unambiguous, naming which field breached and by how
  much.

### The collapse (step 1)

Canonical: `src/lib/prop-challenges/evaluator.ts` — the one wired to routes,
components and the database. `trading-engine/prop-firm-rules.ts` is deleted and
its two scenario assertions move into a real vitest suite against the canonical
evaluator, so coverage that lived in a harness nobody runs now executes on every
commit.

Safe to do now because `prop_challenges` and `prop_challenge_days` both hold
**0 rows** — no user's evaluation changes semantics under them.

Two differences surfaced by the collapse, logged rather than silently resolved:

- **PF-1 — trailing versus static drawdown.** The canonical evaluator measures
  max drawdown from **peak equity** (trailing). The deleted one measured it from
  the **starting balance** (static). Both are real prop-firm rule types and the
  presets already mix them — `apex`'s own blurb says "trailing $2.5k drawdown"
  while FTMO's real rule is static from initial balance. Every preset currently
  evaluates as trailing. Modelling both is an extension, deliberately not done
  during a collapse.
- **PF-2 — declared but unenforced preset flags.** `PROP_PRESETS` carries
  `weekend_hold_allowed` and `news_trading_allowed` on every preset; nothing
  reads either. The deleted implementation did enforce weekend-hold, but only
  from dead code, so no behaviour is lost by removing it — the gap is
  pre-existing, not introduced here.

---

## Still open

- **EC-1** — historical economic calendar data. The overlay works; the source
  cannot supply history. Blocked on a provider decision.
- **MSYM-1** — multi-symbol replay (item 1B). Parked on data, not cost. The
  approach and the user story are recorded above so neither needs re-deriving.
- **PF-1** — trailing versus static max drawdown; every preset is trailing today.
- **PF-2** — `weekend_hold_allowed` / `news_trading_allowed` declared on presets
  and enforced nowhere.
- **MC-1** (Phase 1) — Monte Carlo has only ever run on synthetic data.
- **E2E-1** — the UI suite fails as a suite while its specs pass individually.
- **MS-1** — the session rule has no concept of weekends.
