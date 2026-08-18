# Replay Studio — Phase 2 ("the depth phase")

State as of 2026-08-18. Phase 2 is the last three items from the competitor
study. The investigation that opened it changed the phase: **only one of the
three was greenfield.** One was already built and mounted and starved of data;
one was already built against the wrong clock.

| # | Item | State |
| --- | --- | --- |
| 3 | Prop-firm challenge mode | **Done** — `3d7bdbbb`, `68e15c5f`, `47a134c0`, `af39cbcf`, confirmed in a real browser |
| 1A | Multi-pane replay (one symbol, N timeframes) | **Done** — `cfd472dd`, confirmed in a real browser |
| 2 | Economic calendar overlay | **Done as scoped** — `3d910110`; overlay was already built, feed fixed. Full backfill is EC-1 |
| 1B | Multi-symbol replay | **Parked** — see MSYM-1 |

Approved order was **3 → 1A → 2 (partial)**, 1B parked.

**Phase 2 is complete** as scoped. Everything left is a decision or an
operation, not code: EC-1 (provider), MSYM-1 (parked on data), and scheduling
the calendar cron — nothing accrues until that runs.

---

## Item 1 — the shape, and why it is two features

The study's "16 charts / 5 assets" is two features sharing a name, an order of
magnitude apart in cost. They were separated before scoping, not after.

### 1A — panes of one symbol at N timeframes (DONE)

Mostly already built. `src/lib/replay/aggregate.ts` folds the base dataset into
any higher timeframe deterministically — "never re-fetched, so the chart can
never show a bar the clock has not yet reached" — and `StudioChart` already
drove it through `displayTf` with a working switcher.

One dataset, one checksum, one cursor, one order book. What was missing was
**layout only**: N chart instances reading the same `view.candles` at different
folds. No engine change, no dataset change, no cursor change — which is exactly
why this was the cheap half of item 1.

**Two things are deliberately not per-pane**, and the first is a correctness
requirement rather than a preference:

- **The drawing store.** A `DrawingStore` persists to `localStorage` under its
  scope, and `StudioChart` created one per instance while scoping it to the
  session. Four panes would have been four writers of one key, with the last to
  persist silently erasing what another drew. `StudioPanes` passes one store to
  every pane. `setScope` already no-ops on an unchanged scope, so each pane
  calling it is safe. Sharing is also what a trader wants: drawings anchor in
  absolute time and price, so they mean the same thing on every fold.
- **The focused-chart controls.** Indicators, drawing rail, risk and Buy/Sell
  stay on pane 1. One account and one position sit behind all four panes; four
  Buy buttons are four ways to ask one question.

`defaultPaneLadder` derives the opening folds from `aggregatableFrom` rather
than a fixed list, because a 1H session cannot show a 15m pane — those bars
were never loaded and folding cannot invent them. When the ladder runs out (1D
has only 1D and 1W above it) the highest repeats: a pane must show something,
and repeating is more honest than dropping to a fold we do not have.

**Verified in a real browser** against predictions derived from
`aggregatableFrom` rather than from the app, all correct on the first run:

| Layout | Predicted folds | Rendered |
| --- | --- | --- |
| 1 pane | `["5m"]` | `["5m"]` |
| 2 panes | `["5m","15m"]` | `["5m","15m"]` |
| 4 panes | `["5m","15m","30m","1H"]` | `["5m","15m","30m","1H"]` |

Plus: four canvases all drawing; exactly one Indicators / Buy / Sell across four
panes; a hand-set 4H surviving a change of layout, because widening the grid
must not reset a fold the trader chose; and the layout persisting across a
reload. The stored layout is read after mount rather than during render — the
server has no `localStorage`, and a layout that differs between the SSR pass
and the client is a hydration mismatch, not a restored preference.

Eleven unit tests pin the ladder and the fold arithmetic: thirty 5m bars make
ten 15m bars, the forming bar stays partial rather than waiting to complete,
and bucketing is absolute so starting mid-hour does not shift the buckets.

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

## Item 2 — built, mounted, and starved (DONE as scoped — EC-1 remains)

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

### The fix (done)

The two dead URLs were **removed, not replaced** — there is nothing to replace
them with. Probed 2026-08-18 across every plausible variant: `lastweek`,
`nextweek`, `thismonth`, `nextmonth`, `lastmonth`, `today`, `tomorrow`,
`yesterday` all 404 on `nfs.faireconomy.media`, in `.json` and in `.xml`;
`cdn-nfs.faireconomy.media` does not resolve; and forexfactory.com answers 403
to a direct fetch. Exactly one window is published: `ff_calendar_thisweek`.

That also fixes a signal problem. Every run was recording two errors and
returning `ok: false`, so the job reported failure permanently — and a job that
always fails is one nobody reads the status of.

**A finding that contradicted the plan, caught before it shipped.** The first
version of this fix documented "run daily so the `actual` values published
during the week get captured". That is false. Measured against the live
payload: the feed carries only `title, country, date, impact, forecast,
previous` — **there is no `actual` field at all**, and 0 of 96 items had one,
including the 30 whose release time had already passed. The overlay can show
what was scheduled and what was expected, never what came out. The comment was
corrected rather than shipped, and the limitation is now part of EC-1.

Daily cadence is still right, for the reasons that survive: a window missed is
a window lost for ever, a failed run then costs a day rather than a week, and
`forecast` / `previous` are revised during the week. Not more often than daily
— the host rate-limits, measured: a short burst earned an HTTP 429 with an HTML
body. Both failure modes were already handled (non-OK throws, HTML fails
`res.json()`), so a rate-limited day is a no-op rather than a corruption.

`syncEconomicCalendar` now also returns `windowFrom` / `windowTo` /
`withActual`, because "412 upserted" cannot tell an operator whether the job is
accumulating history or rewriting one week. `withActual` is a canary: expected
to stay 0 with this provider, and non-zero the day one supplies outcomes.

Verified by running the production parser over the real captured payload: 96
raw → 96 parsed, 0 dropped, window 2026-08-16T22:30Z → 2026-08-21T14:00Z,
impacts 75 low / 13 medium / 8 high, 21 of which the overlay would draw, and 96
unique `(event_time, currency, title)` upsert keys — no collisions. Eleven unit
tests cover the parser, which had none; the timezone case is asserted to the
minute because the overlay gates on `timeMs <= marketTime`, so an offset error
would not draw a wrong marker but leak one the clock has not reached.

**What remains operational, not code:** the cron must be scheduled (daily) with
`CRON_SECRET` set on the deployment. Nothing accrues until it runs.

---

## Item 3 — the rules exist, bound to the wrong clock (DONE)

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
**0 rows** — no user's evaluation changes semantics under them. Checked, not
assumed.

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

One thing was carried FORWARD from the deleted file rather than lost with it:
its breaches reported `observed` and `limit`. `ChallengeProgress` clamps
`usedPct` to 100 for its progress bars, so it cannot express a breach's size —
and a breach moment has to say by how much. Both envelopes now also return
`usedAmount` / `limitAmount`, unclamped.

### How it was built (steps 2–4)

**The clock.** `evaluateReplayChallenge` folds the session's canonical
`ClosedTrade` tape into the day rows `evaluateChallenge` already consumes and
hands them over. No rule is restated. `evaluateChallenge` gained a `now`
parameter defaulting to `Date.now()` — the same shape as every mutator in
`chart/orders/service`, and for the same reason. A test pins it: first trade
2026-07-05, cursor 2026-07-07 10:00, `daysElapsed` must be 2. Wall-clock reads
~44 there because the suite runs in August, so the guard fails loudly.

Three decisions worth keeping:

- The current market day always gets a row, even with no trade on it. The daily
  rule measures against the last row's opening equity, so without it a fresh
  day is judged against yesterday's open and the daily allowance can be spent
  twice over.
- `duration_days` is 0. A replay is bounded by its tape, not a calendar, so
  `daysRemaining` must not imply a deadline that does not exist.
- Peak equity is carried by the caller, not recomputed. Floating equity is not
  in the trade tape, so a peak touched while a position was open and then given
  back is unrecoverable; a resumed session restarts from its realised peak.
  That only ever makes a resumed trailing drawdown more forgiving.

**The moment.** `ChallengeBreachOverlay` carries the weight of
`BattleStartIntro`'s countdown — full viewport, backdrop blur, one thing to
read — and differs in refusing to dismiss itself: a prelude may be skipped, a
failed evaluation must be acknowledged. `ChallengeEnvelopeBar` is the half that
changes behaviour, showing room left in amounts rather than percentages while
there is still room. Both read one `useChallengeMonitor`, which owns the equity
peak and the fires-once guard.

**The entry point.** The wizard takes a preset and moves the balance to match
it; `createReplaySession` resolves the numbers server-side. A preset ID crosses
the wire, never a set of limits — a client that could post its own
`max_daily_loss_pct` could post an easier challenge.

### The bug this feature exposed

`persistSnapshot` wrote `settings` as a whole new object:

```ts
settings: { [SNAPSHOT_SETTINGS_KEY]: snapshot }
```

A plain UPDATE replaces the entire JSONB document, so **every autosave deleted
every other key under it**. Invisible while the engine snapshot was the only
tenant, and fatal the moment a second arrived: the challenge worked, autosaved
once, and had no rules on the next load. `updateReplaySession` now merges at the
top level — callers own whole keys, never fragments of one.

Found by predicting the reopen and being wrong. The prediction was suspected
first and survived: a ruleset SHOULD outlive a save. The feature did not.

Second behaviour from the same investigation: reopening a failed challenge no
longer throws the modal over the chart again. The breach is history by then and
the trader is there to read the tape, so the envelope renders its final state
and the moment stays suppressed.

### Verified in a real browser, against numbers stated first

100k account, 5% daily on a day opening at 100,000, seeded trades of −6,000:

| | Predicted | Rendered |
| --- | --- | --- |
| Which rule | Daily loss limit | Daily loss limit |
| Limit | $5,000 | $5,000 |
| Reached | $6,000 | $6,000 |
| Over by | $1,000 | $1,000 |
| Daily left | $0 | $0 |
| Drawdown left | $4,000 | $4,000 |

Naming the rule is load-bearing, not a label nit: the total-drawdown envelope
still had $4,000 in it, so the daily rule had to fire and the other had not.
A control at −4,000 must NOT fire, and does not: $1,000 left, no overlay. The
session's status is polled to `completed` rather than trusting that a modal
appeared over it — "ends the session" has to mean the session ended.

Seeded rows are deleted in `afterAll` and the database was verified back as
found. Because the trades are seeded, what this proves is the WATCHER: tape →
market-time evaluation → session ended → moment on screen. Order placement has
its own specs. The wizard test drives the real entry point.

---

## Still open

- **EC-1** — economic calendar data, blocked on a provider decision (the
  product owner's, not a code task). The overlay works and the feed is fixed;
  the SOURCE has two limits that no amount of code removes:
  1. **No history.** One week is published, forward only. Sessions replaying
     dates before the cron's first run will correctly show nothing.
  2. **No results.** The feed has no `actual` field — measured 0 of 96,
     including 30 already-released events. A trader sees what was scheduled and
     forecast, never the outcome.

  A provider with history and actuals fixes both; nothing else does.
- **EC-2 — the calendar cron is not scheduled.** Operational, not code. Until
  it runs, `economic_events` stays empty and the overlay correctly draws
  nothing. Runbook below.
- **MSYM-1** — multi-symbol replay (item 1B). Parked on data, not cost. The
  approach and the user story are recorded above so neither needs re-deriving.
- **PF-1** — trailing versus static max drawdown; every preset is trailing today.
- **PF-2** — `weekend_hold_allowed` / `news_trading_allowed` declared on presets
  and enforced nowhere.
- **MC-1** (Phase 1) — Monte Carlo has only ever run on synthetic data.
- **E2E-1** — the UI suite fails as a suite while its specs pass individually.
- **MS-1** — the session rule has no concept of weekends.

---

## EC-2 apply runbook — schedule the calendar cron

Same mechanism as BA-3's `battle-tick`: pg_cron calls the public hook over
`net.http_post` and the endpoint authenticates on a shared secret. Nothing here
is new infrastructure; only the job is.

### 1 · Auth it needs

`checkCronAuth` (`src/lib/cron-guard.ts`) reads **`CRON_SECRET`** from the
server environment, falling back to `HISTORICAL_SYNC_CRON_SECRET`. It accepts
the value as either an `x-cron-secret` header or `Authorization: Bearer …`.

It **fails closed**: 503 when the variable is unset, 401 when the value is
wrong. So this is the same secret `battle-tick` already authenticates with — if
that job is returning 200, nothing new needs setting. **No `VITE_` prefix**, or
the secret compiles into the client bundle and every `/api/public/hooks/*`
endpoint becomes world-callable.

### 2 · Schedule it

Daily at 05:17 UTC. Daily because a window missed is lost for ever and a failed
run then costs a day rather than a week; not more often because the host
rate-limits. 05:17 rather than the top of an hour keeps it clear of the jobs
that cluster there, and it lands after the previous US session and before the
European releases, so each run picks up a full day of `forecast` / `previous`
revisions.

`unschedule` first so the statement is safe to re-run. It errors if the job
does not exist yet — ignore that on the first application.

```sql
select cron.unschedule('economic-calendar-daily');

select cron.schedule(
  'economic-calendar-daily',
  '17 5 * * *',
  $$
  select net.http_post(
    url     := 'https://project--237f7325-035a-4d38-a67f-36c64e02b573.lovable.app/api/public/hooks/economic-calendar',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

The host is the one BA-3 proved against; if the deployment has since moved to
`tradershive.lovable.app`, use that instead — it must be the origin actually
serving `/api/public/hooks/*`.

### 3 · Verify

```sql
select id, status_code, error_msg, created
  from net._http_response order by created desc limit 5;
```

Expect `200`. A `503` means `CRON_SECRET` is unset on the server; a `401` means
the header value does not match it.

Then confirm rows actually landed — a 200 with an empty table would mean the
upstream feed failed inside a successful request:

```sql
select count(*), min(event_time), max(event_time) from public.economic_events;
```

Expect roughly 90–100 rows spanning the current week. The response body also
carries `windowFrom` / `windowTo` / `withActual`; `withActual` is expected to be
**0** with this provider and is a canary, not a fault (EC-1).

### 4 · What it will and will not show

History accrues from this first run forward. Every existing replay session
predates it, so their charts will keep showing no events — correctly. Only
sessions replaying dates from now on get an overlay, until EC-1 is decided.
