# Known issues

Open defects found during investigation but deliberately left unfixed, with
enough detail to pick up cold. Remove an entry when it ships a fix.

> **Building anything that places an order? Read
> [BA-9](#ba-9--size-is-validated-as-lots-and-consumed-as-units) first.**
> `PositionOrder.size` is validated as lots and consumed as units. Passing lots
> does not error — it understates P&L by `contractSize`, which is 1 for crypto
> and 100,000 for forex, so it tests clean and ships wrong. Two callers convert
> explicitly today; a third would inherit the bug.

> **Sizing a position from a stop distance? Read
> [RS-5](#rs-5--position-size-is-computed-against-the-click-price-the-stop-is-not)
> before trusting the number.**
> Size is computed against the price under the cursor at click time, while the
> stop is set independently and does not move when the fill lands elsewhere.
> Measured 2026-08-26 on one BTC fill: an intended **1%** of equity opened
> carrying **1.57%**. Nothing errors, and the blotter reports the position as
> correctly sized, because it shows the fill price rather than the price the
> size was derived from.

> **Unparking Battle Arena? Read
> [BA-11](#ba-11--battle-replay-writes-pl-that-never-reaches-balance-or-statistics)
> before touching the replay writer, and fix it in the same pass.**
> `submitBattleReplayTrade` inserts a finished `paper_trades` row and never
> updates `paper_accounts.balance`, never writes `account_statistics`, and never
> applies the negative-balance clamp. Measured on the demo account 2026-08-12:
> five battle rows worth **+$180.10** reached neither, while three trades written
> by `closeTrade` moved both to the cent. It is an unclamped writer into the
> table the dashboard, journal and every report read — so the damage lands
> outside battle-arena even though the defect is inside it.

---

## BA-1 — Matchmaking creates battles with no participants

**Area:** Battle Arena · **Found:** 2026-08-07 · **Status:** open — **ARMED
2026-08-20, urgency raised**

> **This code has begun executing.** Until 2026-08-20 the matchmaking block had
> never run once: it lives in `tick_battles()` (plural), and the only caller
> was a browser polling `tick_battle(uuid)` (singular), which does not contain
> it. Scheduling `battle-tick-every-minute` that day (EC-7) means
> `tick_battles()` now runs **every minute**, matchmaking block included.
>
> `matchmaking_queue` was measured at **0** immediately before the swap, so
> nothing fired and nothing is broken yet. But the defect is no longer
> dormant — the next user to enter the queue triggers it, and a second user
> entering completes the pair. Two players then get "Match Found!" for a battle
> neither is joined to, and both are removed from the queue.
>
> This was a known and accepted condition of the swap, not a surprise. It does
> change the calculus: BA-1 was unassigned because it could not fire.

`tick_battles()` ends with a matchmaking block that pairs two queued players,
inserts a `battles` row, deletes both from `matchmaking_queue`, and sends both a
"Match Found!" notification — but **never joins either player to the battle**.
The code says so itself:

```sql
-- Join both users
-- We need to mock auth context for public.join_battle or just insert manually
-- Since this is inside tick_battles (service role), we can insert manually
-- Actually, we'll just remove them from queue and they will see the notification
DELETE FROM public.matchmaking_queue WHERE user_id IN (v_user_1, v_user_2);
```

See `supabase/migrations/20260807102317_battle_arena_state_machine.sql`, the
matchmaking loop in `tick_battles()` (carried over verbatim from
`20260805094542_a841c48b-...sql:267-311`).

### Why it matters

1. **It is a standing orphan-battle source.** Every matchmaking pairing produces
   a `battles` row with zero `battle_participants`. This matters beyond tidiness
   because orphan counts have been used as diagnostic evidence for unrelated
   failures — see the create-battle investigation, where "battles with no
   participants" was initially read as a signal that `createBattle` was
   partially failing. Any future diagnosis that leans on that signal will be
   confounded by this. **That is the reason this is written down rather than
   left in a commit message.**
2. **Players are dropped from the queue with nothing to show for it.** Both are
   removed from `matchmaking_queue` and told a match was found. Neither is in
   the battle. The queue no longer holds them, so nothing retries.
3. **The orphaned battle is publicly joinable.** It is inserted with
   `status = 'open'`, `visibility = 'public'`, so `listBattles` surfaces it in
   the lobby and `joinRandom` scans it as a matchmaking candidate — meaning an
   unrelated player can wander into a match created for two other people.
4. **`v_user_2` selection is unguarded.** `SELECT … WHERE user_id != v_user_1
   LIMIT 1` has no `ORDER BY`, so pairing is arbitrary rather than ELO-adjacent,
   despite `matchmaking_queue.elo_at_join` being recorded for exactly that
   purpose.

### Why it wasn't fixed inline

The block was carried through the state-machine repair verbatim to keep that
change scoped to "battles never start". Fixing it properly means deciding how a
service-role context creates participant rows, since `join_battle()` is
`SECURITY DEFINER` and reads `auth.uid()` — it cannot be called on behalf of
another user as written.

### Sketch of a fix

Split the participant-creation half of `join_battle()` into an internal
`_join_battle_as(_battle_id uuid, _user_id uuid)` that takes an explicit user id
and does no auth check. `join_battle()` becomes a thin wrapper passing
`auth.uid()`; the matchmaking loop calls the internal form directly for both
players. Then either drop the notification or send it only after both joins
succeed.

Until then, matchmaking should be considered non-functional rather than
partially working.

---

## MD-4 — Two writers fill `historical_candles`, and only one is visible

**Area:** Market data · **Found:** 2026-08-20 · **Status:** **superseded
2026-08-21 by [MD-8](#md-8--the-charts-candle-cache-has-never-written-a-single-row)**
— the probe was run and the answer was that the second writer does not write at
all. MD-2's purge is cancelled, not merely unblocked.

> **The table below is wrong and kept for the record.** `historical_candles`
> has ONE working writer, not two. The chart cache-through row describes an
> intention: its upsert names a conflict target the table does not have, the
> result was never inspected, and it has never persisted a row.

`historical_candles` has two independent writers:

| | Path | Records a job? | Chunking | On conflict |
|---|---|---|---|---|
| Importer | `historical/pipeline.server.ts:159` | yes, `historical_import_jobs` | paged, 250 ms between pages | `symbol,timeframe,provider_code,ts` |
| Chart load | `twelvedata.functions.ts:446-464` | **no** | 500-row slices, no delay | `symbol,timeframe,ts` |

The second is a cache-through backfill inside `twelveDataCandles`: loading a
chart for an uncached window fetches from Twelve Data and writes the result.
It creates **no** `historical_import_jobs` row and its failures are swallowed
into `console.warn` (`:462`).

### Why this matters for MD-2

EUR/USD's 4,735 poisoned rows were almost certainly written by the CHART path,
not the importer. The evidence, measured 2026-08-20:

- All 4,735 rows landed in a **13-second window** (13:41:08 → 13:41:21). The
  importer sleeps 250 ms between pages; 500-row slices with no delay match
  `:457` exactly.
- **No `historical_import_jobs` row exists for EUR/USD.** The only jobs found
  were two cron-triggered GBP/USD attempts. The chart path records nothing, so
  its writes leave no trace anywhere except the rows themselves.
- It stamps `provider_code: "twelvedata"` (`:454`), which is the value seen.

So "re-import EUR/USD" and "someone opened a EUR/USD chart" are the same
event, and MD-2's purge cannot be reasoned about as though only the importer
fills this table.

### The unresolved part — do not purge before answering it

Every row was written **2026-08-14 13:41 UTC**, which is *after* the timezone
fix `08f52e13` was committed (2026-08-13 09:45 UTC) — and the rows are still
shifted, with 672 Saturday bars in a market that closes Friday 22:00 UTC.

Both writers in the CURRENT tree pin `timezone: "UTC"`
(`providers.server.ts:249` and `:311`, `twelvedata.functions.ts:428`), so the
code as it stands is correct. That leaves the deployed build lagging the repo
as the leading explanation — this project publishes by hand — but **it has not
been established**, and a third writer has not been ruled out by anything
stronger than a grep.

**Probe before purging.** GBP/USD holds zero rows, so it is a clean subject:
load a GBP/USD 15m chart on the deployment over a window spanning a weekend,
then count its Saturday bars. Clean means the fix is live and the purge is
safe; shifted means the bug is still running and purging EUR/USD would destroy
the only forex data we have while being unable to replace it correctly.

### Also worth checking while in there

`twelvedata.functions.ts:459` upserts with `onConflict: "symbol,timeframe,ts"`,
while the table's declared constraint is
`UNIQUE(symbol, timeframe, provider_code, ts)`. A mismatched conflict target
normally raises *"no unique or exclusion constraint matching the ON CONFLICT
specification"* — which this path would swallow into `console.warn`. It
evidently does not raise, since the rows exist, so the live table has a
constraint the migration files do not describe. Given
[MIG-1](#mig-1--a-migrations-grant-is-in-the-repo-and-not-in-the-database) and
the two conflicting `CREATE TABLE IF NOT EXISTS` definitions of this same
table, that is worth reading rather than assuming:

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint where conrelid = 'public.historical_candles'::regclass;
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename = 'historical_candles';
```

---

## MD-5 — Twelve Data serves continuous 24/7 forex, weekends included

**Area:** Market data · **Found:** 2026-08-20 · **Status:** documented, not a
bug in our code — design around it

Measured against the live API on 2026-08-20, using exactly the parameters
`providers.server.ts` sends (`GBP/USD`, `interval=15min`, `order=ASC`,
`timezone=UTC`, 2026-07-10 → 07-13):

| Day | Bars returned |
|---|---|
| Fri 2026-07-10 | 96 |
| **Sat 2026-07-11** | **96** |
| Sun 2026-07-12 | 96 |

Spot FX closes Friday 22:00 UTC and reopens Sunday 22:00 UTC. A correct feed
returns ~96 bars for that whole window; this returns 289.

**The weekend candles are not flat.** Sampled Saturday bars move genuinely —
`1.33954`–`1.34039` across the 10:00–11:00 hour — so this is not
carried-forward padding that could be filtered on `open = high = low = close`.
`flat_bars` measured **0** on every day of the week including both weekend
days.

Our pipeline is not implicated. `upsertCandles` writes what the provider
returns; `detectGaps` only records gaps into the job row. There is no
fill, interpolation or carry-forward anywhere in
`historical/pipeline.server.ts` or `historical/providers.server.ts`.

### What it invalidates

**A Saturday-bar count is not evidence of a timezone shift.** MD-2's purge
runbook originally used exactly that test, and it was wrong. EUR/USD's 672
Saturday bars are this, not a shift — so whether those rows are poisoned at
all is an open question again, and the delete stays held until a VALUE
comparison settles it (rewritten as STEP 1 of
`docs/migrations/twelvedata-cache-purge.sql`).

### What to design around

Replay sessions, session-hours logic and any weekend-aware analysis will see
bars on days the market did not trade. Options, none taken yet: filter
out-of-session bars at ingest, gate on market hours at read, or accept them
and make every consumer session-aware. Note [MS-1](#) already records that the
session rule has no concept of weekends — these interact.

---

## MD-6 — Out-of-session bars are stored, and nothing decides what to do with them

**Area:** Market data / session logic · **Found:** 2026-08-20 · **Status:**
open, not urgent — a design decision, not a defect

A direct consequence of
[MD-5](#md-5--twelve-data-serves-continuous-247-forex-weekends-included):
`historical_candles` now demonstrably holds forex bars for Saturdays and
Sundays, with real OHLC movement, because that is what the provider sends.
Measured on GBP/USD 15m — 96 bars on Saturday 2026-07-11, `flat_bars` zero on
every day of the week.

Nothing in the pipeline filters them and nothing downstream knows they are
different from weekday bars.

### Who sees them

- **Replay.** A session spanning a weekend replays straight through it. The
  clock advances one bar at a time and has no concept of a market being shut,
  so a trader practising a Friday close runs into Saturday tape.
- **Session-hours logic.** [MS-1](#) already records that the session rule has
  no concept of weekends. These two interact: MS-1 is the rule not knowing,
  MD-6 is the data being there for it to not know about.
- **Statistics and journal analytics.** Any per-session or per-day aggregate
  now includes days the market did not trade.

### INVESTIGATED AND DECIDED 2026-08-20

The three options as originally written conflated **two separate decisions**
with different answers.

**The BARS: unchanged, shown as-is.** Suppressing them would make replay
diverge from the live chart, which renders the same rows from the same cache.
Two views of one instrument disagreeing is this project's most-repeated defect
class — two P&L formulas (BA-10), two `historical_candles` writers (MD-4), and
two session rules (below). Hiding real data would not merely bend the honesty
principle; it would manufacture that exact bug family. No code needed: nothing
suppresses them today.

**The LABEL: it is not absent, it is confidently WRONG.** Measured 2026-08-20
by calling both implementations directly:

| Instant | `market-sessions` (canonical) | `market-data/sessions` |
|---|---|---|
| Sat 2026-07-11 10:00Z | `london` | `(none)` |
| **Sat 2026-07-11 14:00Z** | **`london_ny_overlap`** | `(none)` |
| Sun 2026-07-12 10:00Z | `london` | `(none)` |
| Sun 2026-07-12 23:00Z | `sydney` | `sydney` — agree, both correct |
| Wed 2026-07-15 10:00Z | `london` | `london` — agree, correct |

`london_ny_overlap` on a Saturday is the strongest claim the vocabulary can
make — the highest-liquidity window of the week — asserted on a day the market
is shut. "Undefined behaviour" understates it; undefined would be safer.

### The actual defect is a sixth session module, not the gating

There are **two** session implementations and they already disagree on exactly
this question:

| | `src/lib/market-sessions/index.ts` | `src/lib/market-data/sessions.ts` |
|---|---|---|
| Weekday gating | **none** | `weekdays` per centre |
| Sydney | no weekend model | `[0,1,2,3,4]` — models the Sunday-evening open |
| Consumers | journal, statistics, paper-trading, replay | `SessionsBar`, `market.sessions` route |

Commit `0281df96` ("five session definitions become one") pointed four
consumers at the canonical rule and **missed this one** — and the orphan is the
one that is CORRECT, including the subtle part that naive "skip Sat and Sun"
gets wrong: Sydney `[0,1,2,3,4]` already encodes that Sunday evening IS
trading.

So the fix is not to invent weekday gating. It is to port a model that already
works and then converge the two, leaving one rule.

### Decision, 2026-08-20

1. Weekend cases into `market-sessions/cases.ts` **first** — MS-1 warns every
   existing case falls on a weekday, so both implementations agree with a
   fixture that never asks the question. Fixture before fix.
2. Port the `weekdays` model into `market-sessions/index.ts`; return
   `off_hours` outside the FX week.
3. **Converge `market-data/sessions.ts` onto the canonical rule.** Do not leave
   two implementations behind.
4. Bars unchanged.

**Crypto labelling, settled by the product owner 2026-08-20:** gate on FX only;
weekend crypto is labelled `off_hours` as well. Crypto genuinely trading 24/7
does not mean it has *sessions* in this vocabulary — `off_hours` means "outside
every defined session", which is honestly true for crypto on a Saturday.
Inventing crypto-specific session names to avoid `off_hours` would be a
fabricated label chosen over an honest one.

---

## MS-2 — Cohort sessions mix two vocabularies in one groupBy

**Area:** Analytics / cohorts · **Found:** 2026-08-20 · **Status:** **FIXED
2026-08-20** — renamed, not merged. See "Resolution" at the end.
**NOT the same defect as MS-1 — it was never a DST bug**

`src/lib/analytics/periods.ts` carries a third session model, and the obvious
reading — that it is MS-1 again — is wrong on investigation.

### The fixed-UTC choice is deliberate, and half-right

`periods.ts:123` states it: *"Default FX session map, expressed in UTC so DST
in the user tz cannot skew it."* That defends a real risk — the user's
configured IANA timezone must not move bucket boundaries — and fixing the
windows in UTC does prevent it. It defends the **wrong DST**, though: London's
hours move relative to UTC when *London* changes clocks, not when the user
does.

### And they are not session windows at all

`0-8, 8-13, 13-21, 21-24` is a complete, non-overlapping partition of the day.
`classifySession` can never return null, has no `off_hours`, and has no
overlap concept. It is **time-of-day bucketing wearing session names** — which
for year-over-year cohort comparison is arguably the correct shape, and is a
defensible reason to leave it alone.

### The actual defect: two vocabularies keyed into one groupBy

`cohorts.ts:118` and `:203` group on
`r.journal.session ?? classifySession(...)?.id` — the canonical DB label first,
this partition only as a fallback. The two id sets do not match:

| `detect_session` | `periods.ts` | |
|---|---|---|
| `london` | `london` | collides correctly |
| `sydney` | `sydney` | collides correctly |
| `tokyo` | `asia` | **different id, same thing** |
| `new_york` | `newyork` | **different id, same thing** |
| `london_ny_overlap` | — | no counterpart |
| `off_hours` | — | no counterpart |

So one cohort table can show `new_york` and `newyork` as separate rows for the
same session, and `tokyo` beside `asia`. Two of four ids collide by luck; two
do not; two canonical labels have no counterpart.

**MS-1's fix made this more visible, not less.** `off_hours` was rare before
2026-08-20 and is now written for every weekend trade. A weekend trade WITH a
journal label groups under `off_hours`; one without falls into whichever UTC
bucket its hour lands in. Same cohort, two rules.

### The question to answer before changing anything

Not "is fixed UTC wrong" — it is defensible for its stated purpose. It is
**should the fallback exist at all.** Options:

1. **Drop the fallback.** Group only on `journal.session`; rows without one get
   `null` and are excluded. One vocabulary, honestly incomplete.
2. **Map the fallback onto the canonical vocabulary.** Keep UTC bucketing but
   emit `tokyo` / `new_york` / `off_hours` so the ids collide correctly.
3. **Rename the buckets to what they are** — time-of-day bands, not sessions —
   and show them as a separate cohort dimension from the session one.

Option 2 is the smallest change that removes the split-row bug; option 3 is the
honest one. Not decided.

### Resolution 2026-08-20 — option 3, renamed rather than deleted

The two vocabularies stay separate. What changed is that they can no longer be
confused, at the type level rather than by convention.

**`periods.ts` renamed.** `SessionWindow` -> `TimeBand`, `DEFAULT_SESSIONS` ->
`DEFAULT_TIME_BANDS`, `classifySession` -> `classifyTimeBand`, and the ids from
`asia`/`london`/`newyork`/`sydney` to `utc_0_8`/`utc_8_13`/`utc_13_21`/
`utc_21_24`. Two of the old four collided with session labels by accident;
none of the new ones can. Kept rather than deleted: the model is sound for its
own purpose, and deleting it would re-open a settled question the next time
someone wants time-of-day cohorts. **It has no consumer today** — that is
recorded in the file itself so its deadness is deliberate rather than
mysterious.

**All four collision sites now use the canonical rule** — `cohorts.ts:118`,
`cohorts.ts:203`, `filters.ts:87` and `selectors.ts:147` call `sessionAt`. The
`sessionWindows` option on the analytics engine is removed; it configured a
fallback that no longer exists.

**The boundary is structural.** `AnalyticsSession = SessionLabel | "custom"` in
`model.ts`, and a deliberate violation was compiled to prove it:

```
error TS2322: Type '"utc_13_21"' is not assignable to type 'AnalyticsSession'.
```

`custom` is included because it belongs to the USER, not to us — the boundary
excludes time bands, not user data.

**The type boundary immediately found a vocabulary the grep had missed.** The
DB column admits `asia` and `custom`, neither of them in `SessionLabel`.
`asia` is a legacy enum member no detector has ever produced (Tokyo always
outranked it), so `normalize.ts` maps it to `tokyo` rather than dropping it,
and anything unrecognised becomes `null` — an unknown string entering a
session `groupBy` is this exact defect.

**Checked while here, and it is safe:** MS-1 made `off_hours` common, and
`off_hours` is not a member of the journal's `session` enum. The draft trigger
already writes `nullif(sess, 'off_hours')`, so weekend trades store NULL rather
than a value the column would reject.

**Fixture first, as with MS-1.** Four cases went in before the fix. Three
failed immediately — the filter option list returned `['new_york', 'newyork']`
for one session, an unlabelled Saturday trade reported `newyork`, and filtering
by `new_york` dropped the unlabelled trade that belonged in it. The fourth, a
09:00Z case where the two vocabularies happened to agree, passed throughout:
that is the control, and it is why the bug was intermittent by time of day.

---

## HD-2 — The sync slice would have starved on permanently-failing symbols

**Area:** Market data / cron · **Found:** 2026-08-20 while building HD-1 ·
**Status:** worked around, root cause is CX-1

`historical-sync` orders its slice `latest_imported ASC NULLS FIRST`, which is
correct for fairness — never-synced symbols first, and each run leaves what it
touched at the back, so the catalog cycles with no offset state to store.

It has one failure mode, and HD-1's smaller slice would have triggered it
immediately. **`latest_imported` only advances on a successful write.** The
eight crypto symbols route to Binance, which answers 403 to this deployment
permanently (CX-1), so they can never succeed and never advance — they sort
first for ever.

At the old slice of 8 this merely wasted capacity. At HD-1's slice of 2 it is
fatal in two ways at once:

1. Both forward slots go to the same two dead symbols every run, so **none of
   the 25 reachable symbols ever syncs**.
2. The backward phase is gated on the forward phase, so **depth is never built
   either**.

A job that runs every 15 minutes for ever and accomplishes nothing, while
reporting a 207 that looks like partial progress.

### Worked around, not fixed

`UNREACHABLE_SOURCES = ["binance"]` excludes them from both phases. Remove it
when CX-1 is resolved — it is referenced from the constant so the reason
travels with the code.

### The related design correction

The backward phase was originally gated on `failed > 0`. That is wrong for the
same reason: the gate exists to avoid pushing requests into a **rate limit**,
and a 403, a bad symbol or a parse error consumes no further budget. Gating on
any failure would stall depth on an unrelated fault for ever. It now gates on
`isThrottle()` — 429 / "rate limit" / "too many requests" — which is the
condition the gate was actually written for.

### Worth generalising

Any queue ordered by a "last success" column starves on a permanently-failing
member. The general fix is to order by last ATTEMPT rather than last success,
which needs somewhere to record attempts. Not built here; noted because this
pattern will recur the next time a source goes permanently dark.

---

## HD-3 — The backward walk starved the forward walk through `latest_imported`

**Area:** Market data / cron · **Found:** 2026-08-21 while predicting hs-3's
output before the first scheduled fire · **Status:** fixed in the repo,
**awaiting deploy** — this project publishes by hand

`runImport` wrote `latest_imported` unconditionally to the last bar of whatever
window it had just imported, while the line directly beneath it guarded
`earliest_available` to only ever move older. Harmless for as long as every
import walked forward. HD-1 added a walk that does not.

A backfill window is old by construction, so completing one stamped an **old
`latest_imported`** onto a symbol whose stored data was current. That column is
the forward slice's sort key (`latest_imported ASC NULLS FIRST`), so every
backfilled symbol jumped to the head of the forward queue. When the forward
phase reached it, `runIncrementalUpdate` derived its window from `max(ts)` in
the DATA, found nothing to fetch, and returned `{ skipped: true }` **before**
`runImport` — so the column was never corrected and the symbol stayed at the
head.

Steady state: the backward phase manufactures stale-looking symbols faster than
the forward phase can clear them, both forward slots are permanently occupied
by symbols that need no forward work, and today's bars stop arriving for the
rest of the catalog. Depth keeps building correctly throughout, because
`earliest_available` was already guarded — which is what would have made this
hard to spot from the outside. The job reports 200 and `synced: 2` the whole
time.

Same family as [HD-2](#hd-2--the-sync-slice-would-have-starved-on-permanently-failing-symbols):
a queue ordered by a column that only advances on a real write. HD-2's
starvation arrived from outside, in Binance's permanent 403. This one we
manufactured ourselves, in the feature designed to use that queue.

### Why it did not show up in the first fires

`NULLS FIRST` outranks any timestamp, so while never-synced symbols still had
`latest_imported IS NULL` they sorted ahead of the old-dated ones the backward
phase was creating. With 25 eligible symbols at 2 per run it takes roughly 13
fires — about three hours at the 15-minute cadence — before the NULLs are
exhausted and the defect becomes reachable. It was found by reasoning about
hs-3's expected output, not by observing a failure.

### The fix

`src/lib/market-data/historical/edges.ts` — `edgePatch()`, pure and tested,
carved out for the same reason `backfill.ts` was: the direction each column may
move is a decision, and everything around it is plumbing.

```
earliest_available  only ever moves EARLIER
latest_imported     only ever moves LATER
```

An import landing inside the recorded bounds returns an empty patch and the
caller skips the write entirely. Comparisons are strict, so touching an edge is
not extending it. Eight cases in `__tests__/edges.test.ts`, including a
59-step backward walk — HD-1's full run to 120 days — asserting the front edge
is untouched by every one of them.

### Worth generalising, again

HD-2 already said it: any queue ordered by a "last success" column starves on a
member that cannot advance it. HD-3 is the same sentence with a different
cause — the member could advance it, and we moved it the wrong way. The
durable form of the rule is that a **column describing an outer bound must be
monotonic in code**, not by the convention that only one kind of caller writes
it. That convention held for as long as there was only one kind of caller.

---

## MD-7 — The catalog still asks for tickers a code change retired

**Area:** Market data · **Found:** 2026-08-21, auditing why every scheduled
sync failed · **Status:** **fixed — applied 2026-08-21**
(`20260821063500_disable_unreachable_symbols.sql`), verified on a fresh query
at twelvedata 18/25 enabled, binance 8/8

Seven of the 25 enabled Twelve Data symbols cannot produce data. Measured
individually — see [the symbol audit](market-data-symbol-audit.md) — because
market class turned out not to predict it: XAU/USD serves and XAG/USD is
plan-gated.

Three distinct faults hide behind one status code:

| Fault | Symbols | Fixable by |
|---|---|---|
| plan-gated | WTI/USD, XAG/USD, SPX500 (`SPX`) | an account upgrade |
| invalid ticker | BRENT/USD, NAS100 (`IXIC`), US30 (`DJI`) | nothing at any price |
| **wrong instrument** | GER40 (`DAX`) | not failing — see below |

### GER40 is the one that matters

`DAX` returns **HTTP 200**, `type: ETF`, `exchange: NASDAQ`, close **$46.98** —
a US-listed ETF standing in for a ~24,000-point German index quoted in EUR. It
does not error, so it would have imported 2,880 candles of the wrong instrument
under a `phase: 'completed'` job row, with bars in the summary confirming
success. Same shape as MD-2: wrong data stored under a healthy status.

Disabling only the symbols that *error* would have left this one running. That
is the entire reason this is a seven-row migration rather than the two-row one
that the day's first two failures suggested.

### Root cause: a code change that never reached the data

Migration `20260731054056` wrote `native_symbol` of `SPX`, `IXIC`, `DJI` and
`DAX` onto the four index rows. The 2026-08-14 ETF-proxy decision removed those
mappings from `routing.ts`, whose comment states they are "intentionally left
unmapped and unclaimed for a future licensed index feed."

The rows were never touched, and `nativeSymbolForProvider` prefers them:

```ts
const sameProvider = !!storedProvider && storedProvider.toLowerCase() === providerCode.toLowerCase();
if (sameProvider && storedNative) return storedNative;   // routing.ts:127
```

`source_code` is `twelvedata` and the resolved provider is `twelvedata`, so the
stored value wins and the deletion is bypassed completely. The code believes
indices are unclaimed; the database has been asking for `SPX` ever since.

### Logged, deliberately not fixed: `providers/mock.ts`

`mock.ts:44-46` still carries `SPX500` / `NAS100` / `US30` with mock prices
(19500 / 5500 / 40000), and `replay/market-data.ts:81` has a `US30` price
fallback. Same code/data drift as this entry, different file. **Left alone on
2026-08-21 by decision** — it is a dev-only provider that is never selected in
production and touches nothing live. Noted so it is not re-derived as a finding
later. `journal/instruments.ts` also keeps those names as aliases, and that one
is CORRECT and must stay: a trader may journal a NAS100 trade taken at another
broker.

### The other half is still missing

That same decision said indices would be traded as the ETFs themselves —
SPY / QQQ / DIA / IWM. **None of the four exist in `historical_symbols`.** So
neither half landed: the broken rows were not disabled and the replacements
were not added. MD-7 completed the removal half. **The add half closed 2026-08-21**
(`20260821104500_add_etf_proxy_symbols.sql`).

The "should a proxy carry an index's name" question turned out to be already
answered and already implemented — `paper-trading/symbols.ts:60` states the
rule: the ETFs are named as the ETFs they are, the price shown IS the price
traded, and the index tickers stay unclaimed so a real feed can take them
later. SPY/QQQ/DIA/IWM were fully wired on the trading side the whole time;
`historical_symbols` was the only catalog that never got them, which is why
they read as "missing" from a query against that one table.

### Why no source-level filter could have caught it

`UNREACHABLE_SOURCES` excludes a *provider*, which is the right shape for CX-1's
Binance block and the wrong shape for this. These seven share a provider with
the 18 that work. The distinction is per-row, so the exclusion has to live in
the data — `is_enabled = false` — and it takes effect on the next fire with no
deploy, unlike [HD-3](#hd-3--the-backward-walk-starved-the-forward-walk-through-latest_imported).

### Cost while it stood

Gated symbols still spend credits. `runImport` retries 3 times before failing,
so each broken symbol costs 4 credits and a 2-symbol slice costs 8 — the whole
per-minute budget, near-instantly, every 15 minutes, for zero rows. Observed
directly: a manual sweep paced at 4/min was refused with "10 API credits were
used" because a scheduled run was firing at the same time.

---

## MD-8 — The chart's candle cache has never written a single row

**Area:** Market data · **Found:** 2026-08-21 · **Status:** **fixed in the
repo, awaiting deploy** · **Severity: high — affects every trader loading any
chart, and has since the unique constraint was created**

`twelveDataCandles` fetches candles for a chart and then upserts them into
`historical_candles` as a cache. The upsert has never succeeded. Not
intermittently — never.

```ts
.upsert(rows.slice(i, i + 500), { onConflict: "symbol,timeframe,ts" })
```

The table's only unique constraint is `UNIQUE (symbol, timeframe,
provider_code, ts)`. `hc_lookup_idx` and `hcandles_sym_tf_ts_idx` cover the
same columns but are **not unique**, so neither can serve as a conflict target.
Postgres answers `42P10` — *"there is no unique or exclusion constraint
matching the ON CONFLICT specification"* — to every batch.

### The second defect, which hid the first

```ts
} catch (e) {
  console.warn("[twelvedata] candle cache backfill failed:", (e as Error).message);
}
```

**supabase-js does not throw on a PostgREST error — it returns `{ error }`.**
The result was never inspected, so the `catch` never ran and that `console.warn`
never printed. There was no log line to find, no warning anyone missed. The
failure was not merely quiet; it was completely invisible, which is why it
survived a full investigation into this exact table (MD-4) without being caught.

### How it was found

Not by looking for it. A chart was loaded to probe whether the cache-through
path stored *shifted* timestamps, and `min(ts)` afterwards was unchanged — the
chart rendered history back to Aug 11 while the database held nothing before
Aug 19. Every row for that symbol, at every timeframe, traced to the cron
importer by `created_at` landing on `:45` boundaries.

MD-4's question was never "does the chart path store shifted data". It was
"does the chart path store anything".

### What it invalidates

- **MD-4's premise.** Its table lists two writers of `historical_candles`. There
  is one. The chart column of that table describes an intention, not a
  behaviour.
- **MD-4's own dismissal of this bug.** It noted the mismatch and reasoned *"it
  evidently does not raise, since the rows exist, so the live table has a
  constraint the migration files do not describe."* The rows exist because the
  **importer** wrote them. The inference was sound and the premise was wrong.
- **A justification inside HD-1.** `backfill.ts` argued for deriving the back
  edge from `min(ts)` because "a trader opening an old chart moves the real back
  edge while the column stays put". Chart loads move nothing. The decision
  stands on its own merits; the reason was corrected in place rather than left
  to mislead.

### Cost

Every chart load re-fetches from Twelve Data, because nothing was ever cached,
against a measured 8 credits/min and 800/day. That is a standing drain on the
same budget HD-1 was carefully paced around — and the likely reason a
ground-truth sweep paced at 4/min was refused with "10 API credits were used"
while a scheduled run was firing.

### The fix

Conflict target matched to the real constraint —
`symbol,timeframe,provider_code,ts`, identical to `upsertCandles`
(`pipeline.server.ts:161`), which is the same write against the same table and
has always worked. The upsert result is now checked, failures are logged at
`error` with symbol, timeframe and row count, and surfaced on the response as
`cacheWriteError`. A cache write that fails must not blank a chart that has
data to draw, but it must never be invisible again.

### Standing rule

**A swallowed database write is not a caught error unless the result was
inspected.** Any `.upsert()`, `.insert()` or `.update()` whose `{ error }` is
not read is unhandled no matter how much `try`/`catch` surrounds it. This is the
second time this table's writers have been misread from the outside; the first
cost MD-4 a wrong conclusion, and this cost roughly a week of a silently dead
cache.

---

## HD-4 — Twelve Data reports an empty window as an error, and both walks believed it

**Area:** Market data · **Found:** 2026-08-21 · **Status:** **fixed in the
repo, awaiting deploy** · **REVISED after the first fix proved unreachable —
read the revision before the original**

> **Revision, same day.** This was first written up as "a weekend is
> permanently fatal to US-hours symbols", and that symptom is real. But the
> fix built for it — an attempted-cursor and an empty-step streak — could never
> execute, because an empty window does not arrive as `inserted = 0`. It
> arrives as a **thrown provider error**.
>
> Proved by driving the exact sequence the fix predicted and watching it fail
> at a different layer: both the forward and backward calls returned
> HTTP 400 *"No data is available on the specified dates"*, and metadata never
> changed because the streak code was never reached.
>
> The cause and the symptom are kept in one entry deliberately. Splitting them
> would put "weekends kill US symbols" and "empty is reported as an error" in
> different places, and the second is the reason the first exists.

`runBackwardUpdate` marked a symbol exhausted the moment a backward step
inserted nothing:

```ts
if (!result?.inserted) {
  await admin.from("historical_symbols").update({
    metadata: { ...meta, backfill_exhausted_at: new Date().toISOString() },
  })
```

`backwardWindow` then returns `{ skip: "exhausted" }` for ever. For a 24/7
instrument that inference is sound. For a US-hours one it is not: a 2-day
window that lands clear of a session returns nothing legitimately. Walking AAPL
back from Aug 19 13:30, the second step covers **Sat 13:29 → Mon 13:29** —
Saturday, Sunday, and Monday up to one minute before the 13:30 open. Zero bars,
and the symbol stops deepening permanently.

That is 9 of 22 enabled symbols: 5 equities and the 4 ETF proxies. Forex is
immune only because Twelve Data serves it 24/7 ([MD-5](#md-5--twelve-data-serves-continuous-247-forex-weekends-included)),
which is why nothing surfaced during HD-1's first day.

### Why the obvious fix is wrong twice over

**Calendar inference does not work.** `tradableMs` in `coverage.ts` looks like
the tool for this and is not — it models a weekday calendar, not sessions.
Measured 2026-08-21 against that exact window: it reports **13.48 tradable
hours and 219 expected 1m bars** where the true count is zero, so a
`tradableMs > 0` gate would still mark AAPL exhausted. It also reports **zero
for a forex weekend** that the provider genuinely serves, which would make
forex skip steps that would have returned data. Getting it right by calendar
needs per-exchange session hours *and* a holiday calendar.

**Simply not marking exhausted is worse than the bug.** `backwardWindow`
anchors on `earliestTs`, which comes from `min(ts)` of stored candles. An empty
step changes no stored data, so the next run computes the **identical** window —
for ever, one credit per symbol per run. The exhaustion mark was the only thing
stopping an infinite retry.

### The layer the first fix missed

`providers.server.ts` threw on any `status: "error"` from Twelve Data. But the
provider reports an empty window that way rather than returning an empty array:

```
AAPL 1m  2026-08-20 20:00 → 2026-08-21 11:40   (Thu close → Fri pre-open)
AAPL 1m  2026-08-15 13:29 → 2026-08-17 13:29   (the weekend window)
  both → 400 "No data is available on the specified dates."
```

Both ranges are valid, chronological and past-dated. Neither contains NYSE
trading. So `runImport` threw, burned its three retries, marked the job
`failed` and rethrew — and `if (!result?.inserted)` was never evaluated.

**The forward walk had the same defect and it was already live**, not waiting
on a weekend: any US-hours symbol whose window sits between one close and the
next open gets this 400, which is ~17.5 hours a day plus weekends. At 9 such
symbols in a 22-symbol rotation, every fire that picked one spent 4 credits
(one attempt plus three retries) and wrote a `failed` row for a window that was
merely outside trading hours.

`isEmptyWindowError` in `./provider-errors` now translates that one response
into an empty result at the boundary, so both walks see the empty array the
pipeline already handles. It is matched on the 400 **and** the message
together, because the provider's other errors are real faults catalogued the
same morning — plan gating (404), invalid ticker (404) and throttling (429)
must keep throwing. Widening it would convert an entitlement gate into "no
data", which is how GER40 imported a $46.98 ETF as a German index.

An empty forward window still writes a job row with `candles_inserted: 0`. A
zero-row completion that happened is a different fact from a call that never
ran, and silence is the worse of the two.

### The fix

Provider-truth instead of calendar-inference, in two parts:

- **An attempted-cursor.** `backfill_attempted_from` records the `from` of every
  attempt, and `backwardWindow` anchors on `min(earliestTs, attemptedFrom)`, so
  an empty step still advances one stride. `min` rather than the cursor alone
  so that a chart load filling a range below the cursor hands the walk back to
  the real data edge.
- **An empty streak.** `backfill_empty_streak` increments on an empty step and
  resets on any insert. `backfill_exhausted_at` is set only at
  `BACKFILL_EMPTY_LIMIT = 4`. A closure is bounded — two steps for a normal
  weekend, three for a long one — while genuine exhaustion is unbounded. Cost
  of the guard: at most four wasted credits, once, per symbol that truly ends.

### What made it urgent rather than deferrable

[MD-8](#md-8--the-charts-candle-cache-has-never-written-a-single-row) widened
the blast radius the same day it was fixed. `upsertCandles` uses
`ignoreDuplicates: true` with `count: "exact"`, so `inserted` counts rows
**written**, not rows present. Now that chart loads persist, a chart that fills
the range the walk is about to request produces `inserted = 0` on a fully
populated window — a second false-exhaustion path that did not exist before
that morning.

### Live verification deferred to the scheduled job — 2026-08-21

The three-call sequence could not be driven: the Twelve Data **daily** cap was
reached at **806/800**, so no amount of spacing would have let it run. Manual
curls stopped there rather than being retried against an exhausted quota.

What the day spent it on, honestly: roughly 40 credits went on the MD-7 catalog
audit and the ground-truth fetches for MD-2 and MD-4, which is the cost of
measuring instead of inferring and was worth it. The rest went to the cron — and
a large share of that to **this very defect**, since every US-hours symbol
picked outside market hours spent 4 credits (one attempt plus three retries) on
a window that was merely shut. Post-fix an empty window costs one request
instead of four, so tomorrow's consumption should fall materially without
anything else changing.

**The job was deliberately left scheduled.** A 429 is not an empty-window
error, so it still throws, no metadata is written, no streak increments and no
symbol can be falsely marked exhausted — the failure is loud, recorded and
self-healing at the daily reset. Unscheduling would have traded a night of
honest 429 rows for the risk of nobody switching it back on.

The unit tests are not synthetic: all four payloads in
`__tests__/provider-errors.test.ts` are responses measured against the live API
today, including the exact 400 this fix turns on. That is why the fix is
trusted as deployed correctly while the live observation waits for the counter
to reset.

### Standing rule

**An empty result is not the same fact as an impossible one.** Before treating
"nothing came back" as permanent, ask whether the window could have contained
anything. Where that question needs a calendar, prefer asking the provider
repeatedly with a bounded budget over modelling the calendar.

---

## MIG-1 — A migration's GRANT is in the repo and not in the database

**Area:** Tooling / migrations · **Found:** 2026-08-20 · **Status:** open,
unassigned · **Severity:** low on its own, high as a class

`20260720091538_dbcd8b49-...sql:90` reads:

```sql
GRANT SELECT ON public.historical_candles TO authenticated, anon;
```

The live database disagrees. Measured 2026-08-20 with the publishable key:

```
{"code":"42501","message":"permission denied for table historical_candles",
 "hint":"Grant the required privileges to the current role with:
         GRANT SELECT ON public.historical_candles TO anon;"}
```

The `authenticated` grant IS present — the same read succeeds with a user
token, which is why nothing in the app has ever noticed. Only `anon` is
missing.

### Why it is worth an entry

**Nothing in the app is broken by it.** Every reader of this table is
authenticated. It was found only because a diagnostic script tried to count
rows with the publishable key.

What matters is the class, not the instance. This project applies migrations
**by hand** through the SQL editor, so the files in `supabase/migrations/` are
a record of what was *intended*, not proof of what was *applied*. One statement
inside an applied file silently did not take. That is the same shape as
[EC-8](#ec-8) — a change reported as done that did not land — and it means the
migration directory cannot be trusted as a description of the live schema
without checking.

### Fix

```sql
GRANT SELECT ON public.historical_candles TO anon;
```

Harmless: the table's RLS policy `hc_read` is already `FOR SELECT USING (true)`
with no role restriction, so the grant only makes the intended access work
rather than widening anything the policy did not already allow.

### The larger question this raises, deliberately not answered here

How many other statements in `supabase/migrations/` were never applied? Nobody
has checked. A diff of the intended grants and policies against
`information_schema` would answer it, and is worth doing before anything reads
the migration directory as authoritative.

---

## BA-2 — Live battle screen has no arena rail below `xl`

**Area:** Battle Arena · **Found:** 2026-08-07 · **Status:** open, follow-up

The live battle workspace shows `ArenaCommandRail` (leaderboard, chat,
participants, rules, activity, countdown) only from the `xl` breakpoint up. The
route renders it in a dedicated column marked `hidden xl:block`:

```jsx
<div className="w-80 border-l border-border/40 hidden xl:block overflow-hidden shrink-0">
  <ArenaCommandRail />
</div>
```

`src/routes/_authenticated/battle-arena.$battleId.tsx`, in the `isLive` branch.

Narrower viewports previously got the rail because `TradingWorkspace` swapped
its entire right-hand tab panel for `ArenaCommandRail` whenever the account
belonged to a battle. That swap was removed deliberately: it unmounted
`OrderPanel`, the only subscriber to the trade-intent bus, so Buy/Sell silently
did nothing and the Positions tab disappeared along with it. Restoring the swap
would reintroduce that bug.

So this is a **known, accepted regression in exchange for a working order
path** — below `xl` you can now trade but cannot see the arena rail. Net
improvement, but a real gap.

### Sketch of a fix

Add an `arena` entry to `RIGHT_TABS` in `TradingWorkspace.tsx` so the rail is
reachable as a tab at any width, alongside Order / Positions / Pending rather
than instead of them. Gate it on `arenaData` being present so it only appears
for battle accounts. This touches the `WorkspaceTab` union and the persisted
workspace prefs (`src/hooks/use-workspace-prefs.ts`), which is why it was kept
out of the original fix rather than widening its scope mid-change.

**Unblocked since 2026-08-07.** The rail owned a realtime channel keyed only on
`battle_id`, so two mounted instances would have joined one topic and torn it
out from under each other. It is now presentational —
`src/hooks/use-battle-realtime.ts` owns the subscription — so mounting it in
both the `xl` column and a tab is safe.

---

## BA-3 — Every scheduled cron job fails authentication

**Area:** Platform-wide · **Found:** 2026-08-07 · **Status:** **FIXED
2026-08-19** — see "Resolution" at the end of this entry.

> The diagnosis below was correct and sat unactioned for twelve days. It was
> re-derived from scratch on 2026-08-19 because this file was not read first.
> Read it first.

All five pg_cron jobs post to `/api/public/hooks/<name>` with a header block of
`Content-Type` + `apikey` (the Supabase publishable key). `checkCronAuth` reads
only two headers (`src/lib/cron-guard.ts:31-32`):

```ts
request.headers.get("x-cron-secret") ??
request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
```

`apikey` is never read, so `provided` is always `""` and there are exactly two
outcomes:

- `CRON_SECRET` / `HISTORICAL_SYNC_CRON_SECRET` unset → **503 "Not configured"**
  at `:29`, before any comparison happens.
- Either one set → **401 Unauthorized** at `:35`.

Neither branch can succeed with these job definitions. Affected jobs:

| Job | Schedule | Endpoint |
|---|---|---|
| `battle-settlement-every-minute` | `* * * * *` | `battle-settlement` |
| `email-queue-process` | `* * * * *` | `email-queue` |
| `email-weekly-report` | `0 9 * * 1` | `email-weekly-report` |
| `email-monthly-report` | `0 9 1 * *` | `email-monthly-report` |
| `email-reengagement` | `0 * * * *` | `email-reengagement` |

**Transactional email has almost certainly been down as long as battle
settlement has.**

### Why it went unnoticed

`cron.job_run_details` reports these jobs as *successful* — pg_net succeeds at
the SQL level as soon as it dispatches the request. The HTTP status lands in
`net._http_response` instead:

```sql
select id, status_code, timed_out, error_msg, created
  from net._http_response order by created desc limit 30;
```

(pg_net prunes that table after ~6h, which is ample for minute-cadence jobs.)

### Fix

Set `CRON_SECRET` in the **server** environment — random value, **no `VITE_`
prefix**, and *not* the publishable key, which ships in the client bundle and
would make every `/api/public/hooks/*` endpoint world-callable. Then reschedule
each job with `x-cron-secret` in place of `apikey`.

**All five jobs are fixed together**, not just the battle one — the guard change
is identical for each, and repairing the mechanism while leaving four jobs
sending the wrong header would leave user-facing email broken with no obvious
owner. See the apply runbook in
[`battle-arena-fixes.md`](./battle-arena-fixes.md).

### One ordering hazard

Reschedule `battle-tick` first and confirm a `200` in `net._http_response`
before touching the email jobs — it is idempotent and touches nothing
user-facing, so it is the safe way to prove the secret works.

Then **triage `email_queue` before re-enabling `email-queue-process`.**
`processQueueBatch` selects pending rows with `scheduled_for <= now()`
oldest-first and applies no staleness filter
(`src/lib/email/service.server.ts:302-309`), so the first successful run flushes
the entire outage backlog at 50/minute. Those are weeks-stale transactional
emails; sending them is worse than not sending them, and the volume risks
provider rate limits. The runbook has the triage queries.

---

### Resolution (2026-08-19)

`CRON_SECRET` did not exist in the Secrets panel at all — it had never been
set, which is why the value was unfindable. `checkCronAuth` reads
`CRON_SECRET ?? HISTORICAL_SYNC_CRON_SECRET`, and the latter HAD been set since
Jul 21, which is why every endpoint answered 401 rather than 503.

A fresh `CRON_SECRET` was generated, added and published, then all six jobs
were rewritten in place — reading each job's own name, schedule and command
from `cron.job` and regexp-replacing only the `apikey` header pair, so
schedules were preserved and the rewrite was idempotent.

Three attempts were needed, and the reason is worth keeping: the first wrote
the literal placeholder text `<NEW_CRON_SECRET>` into all five commands, and
verifying "the header name changed" reported success. Checking the header NAME
is not checking the VALUE. `docs/migrations/check-stored-secret.sql` reads the
stored value back; a 64-character equality comparison in SQL is the check that
actually catches this.

**Confirmed by the work getting done, not by status codes:** four battles had
sat `live` past their `end_at` since 2026-08-07. Within minutes of the repair
they moved to `completed` (live 4 -> 0, completed 10 -> 14). The email queue
turned out to hold 13 rows, all already `sent` — no backlog, so no flush risk.

**Why it survived twelve days:** pg_cron records whether the SQL STATEMENT
succeeded, and `net.http_post` only queues a request, so it succeeds instantly
regardless of the eventual HTTP status. Every one of these jobs read
"succeeded" in `cron.job_run_details` the entire time. That blind spot is
addressed separately — see EC-5 in `replay-studio-phase2.md`.

## BA-4 — Live leaderboard's per-opponent trade columns can never populate

**Area:** Battle Arena · **Found:** 2026-08-07 · **Status:** open, decided,
not yet implemented — see "Decision" below

`LiveLeaderboard` renders `openPositionsByUser` and `lastTradeByUser` for every
competitor. Both maps are built client-side in `battle-arena.$battleId.tsx`
(`loadTradeCounters`) by selecting from `paper_trades` filtered on `battle_id` —
across all users.

`paper_trades` has exactly one RLS policy, `own trades`
(`20260717065801_*.sql:70`):

```sql
CREATE POLICY "own trades" ON public.paper_trades FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

Nothing else grants read access, and nothing exempts battle participants. So the
select silently returns only the viewer's own rows — no error, just a shorter
result — and **both columns have shown one populated cell (your own) and blanks
for every opponent since they were written.**

### Why the realtime fix doesn't change this

BA's channel consolidation added `paper_trades` to the `supabase_realtime`
publication, repairing a real defect: the subscription previously could not fire
at all. But realtime evaluates the same RLS policy per subscriber, so the events
that now arrive are still only the viewer's own. **Your own counters are live;
opponents' are still blank.** Do not read that fix as having covered this.

### Why it wasn't fixed inline

The obvious repair — an RLS policy letting battle participants read each other's
`paper_trades` rows — exposes opponents' full trade records mid-battle: entry
price, size, stop, target, direction. In a competitive trading format that is a
product decision about what competitors may see of each other and when, not a
bug fix to slip into a realtime cleanup.

### Decision (2026-08-07) — counts only

**Opponents must not see each other's entry, size, stop or target while a battle
is live. That turns the competition into copy-trading.** Position count and
last-trade timestamp are enough for the leaderboard to feel live, and they are
already all the UI renders.

The rejected alternative was an RLS policy scoped to the battles the caller
participates in, exposing opponents' full trade rows. **Do not implement that** —
if a future feature seems to want it, it is re-opening this decision, not
carrying it out.

### Implementation, when picked up

A `SECURITY DEFINER` function returning `(user_id, open_count, last_trade_at)`
aggregated per battle — never individual trade rows — callable only by a
participant or spectator of that battle. Surface it as a server fn the
leaderboard queries.

The client-side `loadTradeCounters` in `battle-arena.$battleId.tsx` then goes
away entirely, along with its `paper_trades` registration in
`use-battle-realtime.ts`; invalidate the new query off `battle_rankings`
instead, which already fires on every trade via `trg_paper_trades_battle_ranking`.
A direct client query against other users' `paper_trades` is what let this look
like working code for so long — leaving it in place would preserve the trap.

---

## BA-5 — Dashboard "Total Realized P&L" reads −$71,193,490.77

**Area:** Dashboard / paper trading · **Found:** 2026-08-08 · **Status:** open,
needs one query to classify

Observed on a day with zero trades. Those two facts do not conflict on their own
— `tradesToday` counts today's closed trades while `totalRealizedPnl` is
all-time (`dashboard-home.functions.ts:294`) — but the magnitude is impossible
for accounts that start at $10k.

### The number is not new

`paper-trading.functions.ts:289-291` names it directly:

> keeps `paper_trades.pnl`, `account_statistics.net_pnl` and
> `paper_accounts.balance` internally consistent — **the invariant that closed a
> $70M drift on a $25k account.**

So a ~$70M drift was diagnosed and fixed before. The fix is a
negative-balance-protection clamp at close time: if `balance + pnl < 0` the loss
is capped at `-balance` and the reason becomes `liquidation`.
`negative_balance_protection` was added `NOT NULL DEFAULT true`
(`20260720135816_*.sql:5`), so it is on for every account.

**That clamp only bounds trades closed after it shipped.** Nothing repaired rows
written before it, and the dashboard sums all of them.

### Why the dashboard shows the whole history

`totalRealizedPnl` reduces over every closed, non-deleted `paper_trades` row for
the user, across **every account** — personal, battle and prop alike — with no
date bound and no account scope in the default context
(`dashboard-home.functions.ts:127-132, 244, 294`). One bad historical row stays
permanently visible on the home dashboard.

### Classify before fixing

```sql
-- Historical residue, or still accruing?
select date_trunc('day', closed_at) as day, count(*), sum(pnl), min(pnl)
  from public.paper_trades
 where user_id = auth.uid() and status = 'closed' and deleted_at is null
 group by 1 having sum(pnl) < -100000
 order by 1 desc;
```

```sql
-- The offenders, with the account they belong to.
select t.id, t.symbol, t.direction, t.lot_size, t.entry_price, t.exit_price,
       t.pnl, t.close_reason, t.closed_at, a.name, a.starting_balance
  from public.paper_trades t
  join public.paper_accounts a on a.id = t.account_id
 where t.user_id = auth.uid() and t.status = 'closed' and t.deleted_at is null
 order by t.pnl asc
 limit 20;
```

- **All offenders closed before 2026-07-20** → historical residue. The clamp
  works; repairing or soft-deleting those rows is the whole fix.
- **Any offender after that date** → the clamp is being bypassed. Check
  `close_reason`: `liquidation` means it fired and the loss really was the whole
  balance; `manual` with a loss far exceeding `starting_balance` means the close
  path never reached the clamp. `paper-trading.functions.ts` is not the only
  place that computes P&L — `trading-engine/engine.ts` and
  `order-management/ticket.ts` do too, and the clamp lives in only one of them.

### Suspected magnitude source

`pnl()` is `pipDist × pipValuePerLot × lot`
(`paper-trading/calculations.ts:22`). For `BTC/USDT` both `pipSize` and
`pipValuePerLot` are `1` (`paper-trading/symbols.ts:49`), so P&L is
`price move × lots` — correct only if lots are whole coins. A forex-shaped lot
size against a $67k instrument produces numbers of exactly this order. Confirm
against `lot_size` on the offending rows before assuming the clamp is the only
problem.

### Related

Whatever the cause, it also reaches `recompute_battle_ranking`, which sums `pnl`
over closed `paper_trades` — so a bad row in a battle account distorts that
battle's leaderboard, not just the dashboard.

---

## BA-6 — Chart-placed orders do not count toward a battle

**Area:** Battle Arena / trading · **Found:** 2026-08-08 · **Status:** open,
pre-existing, independent of replay work

There are **three** trade systems in this codebase, and only one of them is
wired to battles:

| System | Entry point | Executes via | Writes to | Counts in a battle? |
|---|---|---|---|---|
| Paper trading | `OrderPanel` → `openTrade` server fn | `computePnl`, server-side | `paper_trades` | **yes** |
| Chart engine | `usePositionOrders` (drag-to-place on chart) | `runObservation`, client-side | `chart_closed_trades` | **no** |
| Replay | `ReplaySessionEngine` | `runObservation`, client-side | `chart_closed_trades` + `replay_session_id` | **no** |

Replay and live-chart trades deliberately share one table and one record shape
(`chart/orders/replay-trade-sync.ts:5-8`) because one execution engine produces
both. Paper trading is a separate lineage with its own P&L maths.

`TradingWorkspace` mounts **both** `usePositionOrders` (`:395`, writing
`chart_closed_trades`) and `OrderPanel` (writing `paper_trades`). So in a live
battle today:

- Buy/Sell in the order panel → counts toward the battle.
- Drawing a Position Tool on the chart and confirming it → **does not**. No
  `battle_id`, no ranking recompute, no leaderboard entry, and no error.

Both controls are visible in the same workspace at the same time, so which one a
competitor reaches for silently decides whether their trade counts.

### Why it is not fixed here

The fix is the same bridge that step 4 of the replay-battle work has to build:
one execution engine feeding one persistence path for battles. Doing it
piecemeal would mean writing that bridge twice. See BA-5 — the two systems also
compute P&L differently, so bridging them forces a reconciliation.

Until then, treat "trade in a battle" as meaning the order panel only.

---

## BA-7 — Replay clock reports `exhausted` where two tests expect `ended`

**Area:** Replay engine · **Found:** 2026-08-08 · **Status:** open, deliberately
deferred — decide outside an implementation

Two tests fail on `main` and have done since before the replay-battle work:

```
src/lib/replay/session/__tests__/controller.test.ts
  > completes at the end of the dataset and stops the loop
src/lib/replay/session/__tests__/session.test.ts
  > ends deterministically and stops emitting

AssertionError: expected 'exhausted' to be 'ended'
```

Confirmed pre-existing by stashing the battle work and running against HEAD.

`ClockStatus` carries both `"ended"` and `"exhausted"`. `ReplayClock.take()` sets
`exhausted` when the cursor reaches the end (`clock.ts`), while `restore()` sets
`ended` for a snapshot that was already at the end. The tests assert `ended`.

So one of three things is true and nobody has decided which:

1. The two statuses mean different things and the tests are asserting the wrong
   one.
2. They are the same thing and one should be deleted.
3. `take()` is wrong and should set `ended`.

### Why it was left

Picking a side changes clock semantics, and the battle work builds directly on
this module — a semantics change mid-implementation is how you get a subtle
divergence between two participants' engines. Nothing in the battle path depends
on the distinction: `advanceBattleSession` reads `clock.atEnd`, not `status`, and
battle sessions set `completeOnExhaustion: false` so they never transition on
exhaustion at all.

Worth resolving before anything else starts reading `ClockStatus`.

---

## BA-8 — Cross-pair pip values are stale; JPY P&L is wrong by a third to a half

**Area:** Paper trading · **Found:** 2026-08-08 · **Status:** open, LIVE DEFECT
affecting real balances

`paper_trades.pnl` is computed as
`((exit − entry) / pipSize) × sign × pipValuePerLot × lot`
(`src/lib/paper-trading/calculations.ts:22`).

`pipValuePerLot` is the USD value of one pip on a 1.00 lot, so for any pair
where **USD is not the quote currency** it has an FX rate baked into it. Those
constants are hardcoded in `src/lib/paper-trading/symbols.ts` and have never
been updated. Reverse-engineering the rate each one implies, against that same
row's own `refPrice`:

| Pair | Stored `pipValuePerLot` | Implied rate | `refPrice` | Drift |
|---|---|---|---|---|
| GBP/JPY | 9.5 | 105.26 | 199.50 | **−47.2%** |
| EUR/JPY | 9.5 | 105.26 | 170.00 | **−38.1%** |
| USD/JPY | 9.5 | 105.26 | 156.92 | **−32.9%** |
| USD/CHF | 11 | 0.909 | 0.88 | +3.3% |
| USD/CAD | 7.5 | 1.333 | 1.3712 | −2.8% |
| EUR/GBP | 12 | 0.833 | 0.8459 | −1.5% |

All three JPY pairs share a single constant of `9.5`, implying roughly 105
JPY/USD — a rate that has not been current for years. The correct figure is
`(100_000 × pipSize) / rate`: at 156.92 that is **$6.37**, not $9.50.

**Every closed JPY-pair trade in `paper_trades` is overstated by ~33–47%.** The
error is proportional, so it scales with position size and compounds across a
history. It also flows into `recompute_battle_ranking`, which sums `pnl` over
closed trades — so any battle fought on a JPY pair has a distorted leaderboard.

The other 29 of 35 symbols are unaffected: they are USD-quoted, where
`pipValuePerLot / pipSize` equals `contractSize` exactly and no conversion is
involved.

### Why it is not fixed here

Found during the replay-battle P&L reconciliation, and deliberately **not**
absorbed into it. Fixing it properly needs a per-symbol audit, a decision about
where the rate comes from (a stored constant will just go stale again), and a
decision about historical rows — repair, annotate, or leave. That deserves its
own scrutiny rather than shipping as a side-effect of a replay feature.

Related: [BA-10](#ba-10) is the umbrella; this is the concrete live damage.

---

## BA-9 — `size` is validated as lots and consumed as units

**Area:** Chart execution engine · **Found:** 2026-08-08 · **Status:** open —
the replay-battle path is fixed (2026-08-10); the field naming that causes it
is not

`PositionOrder.size` is validated with the message

```
"Lot size must be between 0 and 1,000,000,000."      (model.ts:236)
```

and consumed as a plain multiplier on price movement:

```ts
pnl: order.size && order.size > 0 ? move * order.size : move   (model.ts:378)
```

For `move × size` to be money, `size` must be in **units** of the instrument.
For the validation message to be accurate, it is in **lots**. Those differ by
`contractSize` — 100,000 for every forex pair.

Elsewhere the codebase is explicit that the two are different:
`order-management/ticket.ts:101` returns `units: qty * (meta.contractSize || 1)`,
treating its own `qty` as lots.

Nothing currently breaks, because the Position Tool is sized from a risk budget
and its output is consumed by the same expression that produced it — the
ambiguity cancels. It stops cancelling the moment anything **crosses systems**,
which is exactly what the P&L bridge does.

### Confirmed empirically, 2026-08-10

Measured by running one trade through the exact replay-battle path
(`placeOrEditOrder` → `runObservation` → `ClosedTrade` → `battleTradeRowFrom`)
and comparing against the paper formula:

| Symbol | contractSize | engine pnl | paper pnl | ratio |
|---|---|---|---|---|
| EUR/USD | 100,000 | **$0.0218** | $2,178.20 | **100,000** |
| BTC/USDT | 1 | $1,351.00 | $1,351.00 | 1 |

**It does not surface as an inflated `lot_size`.** `lot_size` is written from
`trade.quantity`, which is whatever was typed, so the row looks ordinary — the
damage is in `pnl`, understated by `contractSize`. A EUR/USD replay battle
records two cents on a trade that made two thousand dollars, which reads as a
rounding artifact rather than a defect.

Crypto cannot expose this: `contractSize` is 1 for every `*/USDT` pair, so lots
and units coincide and the two formulas agree exactly. Every replay battle run
so far has been BTC/USDT, which is why the recorded P&L has been correct.

**`isEnginePricedSymbol` does not protect against this.** Its identity
(`pipValuePerLot / pipSize === contractSize`) is about currency conversion and
holds perfectly for EUR/USD — the guard admits the symbol as safe while this
makes its P&L wrong by five orders of magnitude. The two are independent
defects that happen to live on the same line of code.

### Fixed in the battle path, 2026-08-10

Paper reduces to `move × contractSize × lot`; the engine is `move × quantity`.
They agree only when `quantity` is in **units**. So the conversion has to be
explicit at both boundaries:

1. Place the order with `size: lots × contractSize`, so the engine prices it
   correctly.
2. Convert back in `battleTradeRowFrom` — `lot_size: quantity / contractSize` —
   because `paper_trades.lot_size` means lots, and writing units into it would
   trade one wrong number for another.

`contractSize` is 1 for crypto, so this is a no-op for every battle recorded to
date and cannot retroactively change them.

Both halves have shipped — `BattleChart` multiplies by `contractSize` when
placing, `battleTradeRowFrom` divides on the way out. Verified across three
contract sizes, with `lot_size` still reading lots in every case:

| Symbol | contractSize | engine | paper | ratio |
|---|---|---|---|---|
| EUR/USD | 100,000 | $2,178.20 (was $0.0218) | $2,178.20 | 1.000000 |
| XAU/USD | 100 | $4,864.20 | $4,864.20 | 1.000000 |
| BTC/USDT | 1 | $1,351.00 (unchanged) | $1,351.00 | 1.000000 |

### Still open — the durable fix

**Fixing the battle path did not fix the API.** `PositionOrder.size` is still
declared as lots by its validation message (`"Lot size must be between…"`) and
consumed as units (`pnl: move * order.size`). Exactly one thing changed: two
call sites now convert explicitly. The trap itself is untouched.

That matters because **the failure mode is silence**. Passing lots does not
throw, does not warn, and produces a plausible number. On crypto it is not even
wrong, because `contractSize` is 1 — so a new caller can build a feature, test
it on BTC/USDT, watch the P&L come out correct, and ship a 100,000× error that
only appears the first time someone trades forex.

Current state:

| Caller | Converts? |
|---|---|
| `BattleChart` → `placeOrEditOrder` | yes, multiplies by `contractSize` |
| `battleTradeRowFrom` → `paper_trades.lot_size` | yes, divides back |
| Position Tool (live chart) | no — harmless, it both produces and consumes the value |
| **anything written next** | **no, and nothing will tell them** |

**The fix is to rename the field to `units`** and make the conversion explicit
at every boundary, retiring the "Lot size" message in the same change. Renaming
is what makes the compiler carry the knowledge instead of a comment. Until then
the warning lives at the definition in
[`model.ts`](../src/lib/chart/orders/model.ts) — on `PositionOrder.size`,
`OrderDraft.size`, the validation message and the `move * size` expression —
because a caller reads the type, not this file.

### Why it matters more than it looks

A 100,000× error is not a rounding difference; it is the difference between a
$4 trade and a $400,000 one. And because both readings are self-consistent
within their own module, neither side has a test that would catch the mismatch.

### Fix

Rename the field to say what it holds — `units` if it is units, `lots` if it is
lots — and make the conversion explicit at every boundary. This is worth doing
regardless of which P&L formula wins BA-10.

---

## BA-10 — Two P&L formulas, silently divergent on cross pairs

**Area:** Platform-wide · **Found:** 2026-08-08 · **Status:** open, umbrella
issue — direction agreed, work not scoped

Two independent P&L implementations exist and disagree:

| | Engine (`chart/orders/closed-trade.ts:127`) | Paper (`paper-trading/calculations.ts:22`) |
|---|---|---|
| Formula | `(exit − fill) × sign × quantity` | `((exit − entry) / pipSize) × sign × pipValuePerLot × lot` |
| Result currency | **quote currency** (`model.ts:124` says so) | **account currency (USD)** |
| Needs symbol metadata | no | yes — `pipSize`, `pipValuePerLot` |
| Feeds | live chart, replay → `chart_closed_trades` | order panel, battles → `paper_trades` |

The paper form reduces to
`(exit − entry) × sign × (pipValuePerLot / pipSize) × lot`, so the two are
**identical exactly when `pipValuePerLot / pipSize === contractSize`**. That
holds for 29 of 35 symbols and fails for the 6 non-USD-quoted pairs — see BA-8.

So the split is not cosmetic. One converts currency and the other does not.

### Direction agreed (2026-08-08)

**The engine's `move × quantity` wins long-term, with an explicit conversion
layer added.** Reasoning:

- **No divisor.** `pipSize` is a denominator, so wrong metadata inflates by
  orders of magnitude rather than degrading gracefully. `move × qty` fails
  proportionally to real price and real size.
- **Correctness becomes a data problem, not a constant problem.** A conversion
  layer can read a real rate; a hardcoded constant is only right on the day it
  is typed — BA-8 is what happens afterwards.
- **Already canonical for two of three sources**, and it is what
  `runObservation` produces.
- **R stays consistent by construction** — risk and P&L derive from the same
  primitives, unlike `pnl / risk_amount` where `risk_amount` is stored
  separately.

**Neither formula is shippable alone.** The engine form without a conversion
layer would store yen in a USD column — ~157× inflation on a JPY pair, and the
most likely mechanism behind [BA-5](#ba-5).

### Interim position

Replay battles use engine-derived P&L, **restricted to symbols where the two
formulas provably agree**. Live paper trading is untouched. Two formulas remain,
knowingly, until the structural work is scoped. See
`docs/battle-replay.md` for the restriction and how it is enforced.


---

## JR-1 — `check:schema` cannot fully verify `profiles` or `provider_credentials`

**Area:** Journal / tooling · **Found:** 2026-08-11 · **Status:** open, accepted

`bun run check:schema` verifies that `src/integrations/supabase/types.ts`
matches the live database. It exists because `types.ts` is currently
**hand-patched** — Lovable owns the Supabase project, there is no access token,
and `supabase gen types` cannot be run non-interactively. Without that check, a
faithful-looking but wrong hand-patch would be invisible: `check:columns`
validates code against `types.ts`, so a wrong `types.ts` makes the scanner
confidently wrong too.

It verifies **237 of 239 tables**. Two are skipped:

```
profiles:              permission denied for table profiles
provider_credentials:  permission denied for table provider_credentials
```

The probe selects every column `types.ts` claims, in one request. For these two
tables some columns (`profiles.email`, `profiles.admin_notes`, …) are not
granted to `authenticated`, so the full-column select is denied outright and the
table cannot be checked at all — not even partially.

**Why it matters:** `profiles` is precisely where schema drift bit us before. A
stale `types.ts` entry for `profiles.preferred_market` caused `check:columns` to
flag three *valid* call sites as broken (2026-08-11). That is the cry-wolf
failure mode the scanner is meant to avoid, and `profiles` is the one table it
cannot protect. **Do not read "check:schema — ok" as full coverage.**

### Fix when possible

Any of these closes it:

- Obtain a Supabase access token and regenerate `types.ts` properly, making the
  hand-patch — and most of this risk — moot.
- Run the probe as `service_role` (needs a secret key), which bypasses grants.
- Have the check fall back to per-column probing when a whole-table select is
  denied, so it verifies the subset the role *can* read instead of skipping the
  table entirely. Cheapest option; still partial.

---

## BA-11 — Battle replay writes P&L that never reaches balance or statistics

> Renumbered from BA-10 on 2026-08-12: two different issues carried that ID.
> The umbrella P&L-formula issue keeps BA-10; this one is BA-11.

**Area:** Battle Arena / paper trading · **Found:** 2026-08-11 · **Status:**
open, deliberately unfixed — battle-arena is parked and fixing this unparks it ·
**re-confirmed 2026-08-12 with the arithmetic isolated (below)**

Sibling of [BA-5](#ba-5--dashboard-total-realized-pl-reads-71193490 77). BA-5 did
not reproduce on the account inspected (dashboard and journal paths agree
exactly at $180.10), but the invariant BA-5 is about **is** broken here, on a
different path.

### Observed

```
Battle: Replay test 10   trades=5  tradePnl=180.10  stats.net_pnl=(none)  balance-start=0.00
```

Five closed trades, $180.10 realised, and the account balance never moved. No
`account_statistics` row exists for the account at all.

### Re-confirmed 2026-08-12 — the two writers now separated on one account

Driving the rebuilt order ticket put three ordinary (non-battle) trades through
`closeTrade` on the same account that holds the five battle rows. That splits
the two writers apart on shared data, and the arithmetic is exact:

| | rows | Σ pnl | reached `balance`? | reached `account_statistics`? |
|---|---|---|---|---|
| battle replay (`battle_id` set) | 5 | **+180.10** | no | no |
| order ticket (`closeTrade`) | 3 | −0.67 | yes | yes |

```
starting_balance 10000 + Σ all closed pnl 179.43 = 10179.43
actual balance                                   =  9999.33
drift                                            =  -180.10   ← exactly the battle rows
account_statistics: total_trades=3, net_pnl=-0.67 ← exactly the ticket rows
```

Two things this pins down that the original observation could not:

1. **`closeTrade` is not implicated.** Its three trades moved `balance` and
   `account_statistics.net_pnl` in lockstep, to the cent. The invariant holds
   wherever `closeTrade` is the writer.
2. **The drift equals the battle rows' P&L exactly** — not approximately. So
   the mechanism is a total absence of the balance/statistics write on that
   path, not a rounding or ordering bug.

Note the earlier claim "no `account_statistics` row exists" is now stale: one
exists, created by the ticket's closes, and it counts only the three rows
`closeTrade` wrote. The battle rows remain invisible to it.

### Mechanism

`closeTrade` (`paper-trading.functions.ts:285+`) is what maintains the three-way
invariant its own comment describes — *"keeps `paper_trades.pnl`,
`account_statistics.net_pnl` and `paper_accounts.balance` internally consistent
— the invariant that closed a $70M drift on a $25k account."* It reads the
account, applies the negative-balance-protection clamp to `pnl`, writes the
trade, then updates the balance and the statistics.

`submitBattleReplayTrade` (`battle-replay.functions.ts`) does none of that. It
**inserts a `paper_trades` row already `status: "closed"` carrying a `pnl`**,
and reads `paper_accounts` only to validate ownership. It never updates
`balance`, never writes `account_statistics`, and — the part that matters for
BA-5 — **never applies the NBP clamp.**

So battle-replay is an unclamped writer into the same table the dashboard,
journal, calendar and every report read. A large enough replay loss writes a
`pnl` with no balance floor, which is precisely the shape of the historical rows
BA-5 describes. Not proven to be BA-5's source — the corrupt rows are not
visible under this user's RLS — but it is a path that can produce them.

### Why it matters outside battles

`paper_trades` is the journal's source of truth: the auto-journal trigger copies
`pnl` onto every `journal_entries` row. Anything the battle path writes wrong is
inherited by the journal, the P&L calendar and the reports built on them. This
is logged rather than fixed because battle-arena is parked, but it is a
journal-side risk, not only a battle-side one.

### Fix sketch

Route battle-replay closes through the same clamp-and-update helper `closeTrade`
uses, rather than inserting a finished row.

**The helper now exists** (2026-08-12). `paper-trading/settlement.ts` holds the
pure math — `clampRealizedPnl`, `nextBalance`, `nextStatistics` — and
`paper-trading.functions.ts` wraps it in `loadAccountMoney` +
`commitSettlement`. `closeTrade` and `partialCloseTrade` both go through it.
The invariant is unit-tested directly, including a case that reproduces this
issue's −$180.10 drift.

So the remaining battle-side work is genuinely small:

1. `submitBattleReplayTrade` calls `loadAccountMoney(sb, account_id)`.
2. It clamps its `pnl` with `clampRealizedPnl` **before** inserting the row, so
   the inserted `paper_trades.pnl` is the bounded figure.
3. After the insert it calls `commitSettlement(..., { countsAsTrade: true })`.

Both helpers are module-private today; exporting them is part of the change.
Do not reimplement the arithmetic at the call site — a second copy is how the
two writers diverged in the first place.

---

## JR-2 — Journal reports read only the primary take-profit; staged legs are invisible

**Area:** Journal / reports · **Found:** 2026-08-12 · **Status:** open, parked
pending a product decision — **do not pick this up as an implementation task**

### What is true today

`paper_trade_exits` (applied 2026-08-12) lets a trade carry a ladder of
take-profit levels, each with its own price and its share of the original size.
The order ticket writes it and the chart draws it (CH-1, shipped).

`paper_trades.stop_loss` / `.take_profit` were deliberately left as scalars
meaning "the primary level", so `create_journal_draft_from_trade()`, the CSV
importer (`journal/import/csv.ts:109-110`) and `journal/editor/validation.ts`
all keep working untouched. The consequence is that **every journal surface
sees leg 1 and nothing else**: `journal_entries.take_profit` is a single number,
and the six reports under `/journal/reports` compute against it.

Nothing is wrong in the data. The ladder is stored correctly and
`listTradeExits` / `listExitsForTrades` return it. No journal consumer calls
either.

### Why this is a decision, not a task

A trade that scales out has no single R. Half the position closing at 1R and
half at 3R is not "a 2R trade" for every purpose — it is 2R of realised R, but
its win rate, its MAE/MFE window and its "did it reach target" answer all
differ by which leg you mean. The six reports are built on **one dataset, filtered once**
(`buildDataset()`), so whichever answer is chosen applies to all of them at
once. That is the point of the rule and the reason not to decide it casually.

### The three options

1. **Per-leg rows.** A laddered trade contributes one row per filled leg.
   Truthful about execution; inflates trade counts and makes win rate mean
   "percent of *exits* that were profitable", which is not what the label says.
2. **Blended R.** One row per trade, R computed as the size-weighted sum across
   filled legs. Keeps trade counts honest and win rate meaning what it says;
   loses the ability to ask "did TP2 ever fill?" without a second query.
3. **Both, explicitly separated.** Trade-level rows stay the dataset for
   counts and rates; a separate leg-level view answers exit-behaviour questions
   (which legs fill, where scaling out helps or hurts). Most informative,
   roughly double the reporting surface, and needs the two never to be mixed in
   one panel — the exact failure `buildDataset()` exists to prevent.

### Where it would land

`src/lib/journal/` — `buildDataset()` is the single place scope is decided, so
whichever option wins is implemented there and inherited by all six reports.
`journal_entries` itself needs no schema change under options 1 or 2.

---

## JR-3 — Nothing verifies that constraints and triggers were actually applied

**Area:** Tooling / migrations · **Found:** 2026-08-12 · **Status:** open,
follow-up — not urgent, but it is a real hole with a known shape

### The gap

`check:schema` compares `types.ts` against the live database **column by
column**, and now fails when a declared table does not exist at all. It has no
opinion about anything else. A CHECK constraint, a unique index, a trigger or
an RLS policy that was written, committed, handed over and never pasted is
completely invisible to it — the columns still match, so the run is green.

That matters here specifically because migrations are applied by hand in the
Lovable SQL editor, which truncates long pastes and reports success anyway.
Three silent failures of exactly that kind happened on 2026-08-11/12. The
pending-tables gate closed the case for tables. Constraints and triggers are
the same failure with no gate.

Live example from the same day: `paper_trade_exits_idx_max` (OT-7) and
`paper_trade_exits_allocation` (OT-9) are load-bearing — they are what stops a
caller bypassing `setTradeExits` from writing a six-leg ladder or a 130%
allocation. If either had silently failed to apply, every checker would still
be green and the only symptom would be corrupt data much later.

### Why a behavioural test is not sufficient on its own

It works, but it has a trap worth recording. The first cap test inserted five
legs at 20% and then a sixth, saw a rejection, and looked like a pass. The
rejection was `P0001` from the *allocation trigger* — the ladder was already at
100%, so the idx CHECK was never exercised. Only re-running with allocation
headroom, and asserting the error code was `23514` against
`paper_trade_exits_idx_max`, actually tested it.

**Standing rule from that:** a constraint test asserts on WHICH constraint
fired, never merely that something was rejected. Overlapping constraints will
cover for each other and hand you a green test for something you never touched.

### Sketch of a fix

A `scripts/check-constraints.ts` reading a committed manifest — table, object
name, type (`check` / `unique` / `trigger` / `policy`) — and verifying each
against `pg_constraint`, `pg_indexes`, `pg_trigger` and `pg_policies`. Same
contract as the other checkers: skip gracefully without credentials, fail on a
declared object that is absent, and fail on a manifest entry for an object that
no longer exists so the list cannot rot.

The obstacle is access: those catalogs are not exposed through PostgREST, and
this project has no service-role key or DB password — only a publishable key
and an e2e user login. So it needs either a `SECURITY DEFINER` RPC that returns
the catalog rows, or credentials the project does not currently have. That
choice is the first decision on this task, not an implementation detail.

---

## MD-1 — The free Twelve Data plan cannot fund the poll rate the UI asks for

**Area:** Market data · **Found:** 2026-08-13 · **Status:** open — code side
fixed, plan side is a product decision

Forex and metals ran 9–10 hours behind live while crypto was instant. Four
defects stacked; three are fixed, the fourth is an entitlement question that
code cannot answer.

### What was wrong

1. **Credits were counted as requests.** Twelve Data bills **one credit per
   symbol**, so `/quote?symbol=EUR/USD,XAU/USD,GBP/USD` is three credits, not
   one ([docs](https://support.twelvedata.com/en/articles/5203360-batch-api-requests)).
   `recordCall()` added 1 per HTTP call, so the local gate read ~5/min while the
   account really spent ~35/min. The gate never fired; upstream 429s did.
   *Fixed* — `td()` takes a credit count, `canCall`/`affordableCredits` gate on
   it, and an over-budget batch is trimmed rather than failed whole.
2. **Cadence ignored symbol count.** The workspace asked for 12s regardless of
   how many symbols were subscribed. *Fixed* — `computeCadence()` now stretches
   the interval to fit `CREDITS_PER_MIN`, and the poll order rotates so trimmed
   batches don't starve the same tail symbols every time.
3. **A second, un-batched poller.** `live-quotes.ts` pulled every open
   position's symbol individually every 15s whenever the feed had been quiet
   for 30s — and the feed was permanently quiet, because of 1 and 2. *Fixed* —
   it is now a genuine last resort (60s quiet, 60s floor between pulls).
4. **The candle cache had no recency check.** `twelveDataCandles` returned
   cache-only whenever it held ≥90% of the requested bar *count*, never asking
   whether those bars reached the right edge. On 15m/500 bars the newest cached
   candle could be 12.5 hours old and still pass. *Fixed* — the shortcut now
   also requires the newest bar to be within two bar intervals of `to`, and a
   stale tail triggers a tail-only refetch, rate-limited to one attempt per bar
   interval so a closed market doesn't burn a credit per render.

   > **Correction (2026-08-13).** This entry originally claimed defect 4 *was*
   > the observed 9–10 hour lag. That was wrong, and the lag survived the fix.
   > Defect 4 is real but was never reachable for this symptom: the cache holds
   > only 3 symbols and is 7–13 days stale, so a 500-bar window does not
   > intersect it and the shortcut never fires. The actual cause was a
   > timezone misparse — see [MD-2](#md-2--twelve-data-datetimes-were-parsed-as-utc-when-they-are-not).

### What is still open

The free plan is **8 credits/min, 800/day**. One credit per symbol per poll
means a 6-symbol watchlist plus a chart symbol cannot be polled faster than
about once a minute without exceeding the ceiling — and a day of active use
cannot exceed ~800 symbol-refreshes total. The code now lives inside that
budget honestly instead of pretending, but the budget is small. Either the
plan changes, or the number of concurrently-live non-crypto symbols does.

Twelve Data's pricing page does list "real-time forex" on the free tier, so
delayed *entitlement* was not the cause here — starvation was. Metals are not
named either way on that page and should be confirmed directly.

### Honesty in the UI

`Quote.quoteAt` now carries the provider's real tick time alongside `ts`, which
is deliberately clamped to now for chart bucketing. The chart's freshness chip
reads `quoteAt` and shows **Delayed** rather than **Live** when the upstream
tick is over two minutes old. Before this, a stale quote was stamped `Date.now()`
and reported as Live — which is why the lag went unnoticed in-app and only
showed up against TradingView.

### The historical-sync cron is a red herring

`HISTORICAL_SYNC_CRON_SECRET` suggests the forex feed depends on a periodic
sync. It does not: `twelveDataCandles` backfills `historical_candles` itself on
every chart load, so the cron only pre-warms. Worth knowing anyway:

- No migration in this repo schedules it — the five jobs in
  [BA-3](#ba-3--every-scheduled-cron-job-fails-authentication) do not include
  `historical-sync`.
- If it *is* scheduled from the Lovable dashboard, it fails auth for the same
  reason every other job does (BA-3).

To settle it against the live database:

```sql
select jobname, schedule, active from cron.job order by jobname;
select id, status_code, error_msg, created
  from net._http_response order by created desc limit 30;
```

---

## MD-2 — Twelve Data datetimes were parsed as UTC when they are not

**Area:** Market data · **Found:** 2026-08-13 · **Status:** **RESOLVED
2026-08-21 by measurement. The purge is cancelled — do not run it.**

> STEP 1's value comparison was run against both stored batches and both are
> clean. EUR/USD 15m — the exact 4,735-row batch written 2026-08-14 13:41 that
> the purge targeted — matches fresh data to the digit at 00:00, 10:00 and
> 13:45 on 2026-07-15. GBP/USD 15m, written 2026-08-20 by an admin import,
> matches at all three of its reference timestamps too. A +10h shift would
> have shown 64 pips of divergence.
>
> The premise has now failed two different tests: first as the Saturday-bar
> count, which [MD-5](#md-5--twelve-data-serves-continuous-247-forex-weekends-included)
> invalidated, and now as a value comparison. And the third writer the purge
> also worried about does not exist —
> [MD-8](#md-8--the-charts-candle-cache-has-never-written-a-single-row) has
> never written a row. STEP 2 is struck in
> `docs/migrations/twelvedata-cache-purge.sql`.

The actual cause of the 9–10 hour lag on forex, metals and indices, replacing
the incorrect diagnosis recorded in [MD-1](#md-1--the-free-twelve-data-plan-cannot-fund-the-poll-rate-the-ui-asks-for).

Measured against the live API at 09:34 UTC on 2026-08-13:

```
GET /time_series?symbol=EUR/USD&interval=15min      (no timezone param)
  newest bar datetime = "2026-08-13 19:30:00"       -> +9.92h vs wall clock

GET /time_series?symbol=EUR/USD&interval=15min&timezone=UTC
  newest bar datetime = "2026-08-13 09:30:00"       -> -0.08h vs wall clock
```

Twelve Data answers in its own default zone — measured at **UTC+10** for FX and
metals — and returns no `exchange_timezone` in `meta` for these symbols. Both
parsers force-appended `"Z"`, so 09:30 UTC was read as 19:30 UTC.

### Why it looked like the chart was *behind* when the bars were *ahead*

Two effects compound. The candles sit ~10h to the right of real time, and the
live tick buckets at `now` — which is older than the newest bar — so
`ChartEngine`'s `bucket > last.time` test fails and the tick is **discarded**.
The chart is both mis-placed on the axis and frozen against the market.

Crypto never showed it: Binance returns epoch milliseconds, which cannot be
misread as a local time.

### Fix

`timezone=UTC` on every `/time_series` call, in both
`market-data/twelvedata.functions.ts` and
`market-data/historical/providers.server.ts`. This also aligns `start_date` /
`end_date`, which are read in that same zone.

### CLOSED 2026-08-20 — FALSE ALARM. The cache was never poisoned.

**Do not delete anything.** EUR/USD's 4,735 rows are correct, verified by
comparing stored values against a live fetch at three timestamps:

| 2026-07-15 UTC | stored `open` | fresh `open` |
|---|---|---|
| 00:00:00 | 1.14241 | 1.14241 |
| 10:00:00 | 1.14180 | 1.14180 |
| 13:45:00 | 1.14270 | 1.14270 |

Exact matches. Not shifted by ten hours or by anything else.

**Why it was diagnosed as poisoned.** The evidence was a Saturday-bar count,
on the reasoning that spot FX closes Friday 22:00 UTC so legitimate data has
none. [MD-5](#md-5--twelve-data-serves-continuous-247-forex-weekends-included)
shows that premise is false — Twelve Data serves continuous 7-day forex — so
the Saturday bars were never evidence of anything. The 36,267-row purge in the
original note would have destroyed correct data.

The live-tick misalignment that prompted the original investigation was real
and its `timezone=UTC` fix stands; what did not follow was that the STORED
rows carried the fault. That step was inferred from a calendar argument and
never checked against a value until 2026-08-20.

The runbook `docs/migrations/twelvedata-cache-purge.sql` is kept for its
STEP 1 only — the value-comparison method that settled this. Its delete must
not be run.

### Original note, retained for the record

36,267 rows (`provider_code='twelvedata'`) in `historical_candles` were written
with the shifted timestamps. They are wrong by ~10h and will merge into any
chart window that reaches them.

**This stopped being a stale warning on 2026-08-20.** MSYM-1's two-instrument
observation was about to be built on EUR/USD, and **all 4,735 of its 15m rows
are `provider_code='twelvedata'`** — measured that day. The contamination is
reaching new work, not just sitting in the table.

Two things changed since this was written, both handled in the runbook:

- **The unscoped delete is no longer obviously safe.** Rows written after the
  fix (`08f52e13`, 2026-08-13 09:45 UTC) are correct, and deleting them costs a
  refetch against the 8-credits/min budget in
  [MD-1](#md-1--the-free-twelve-data-plan-cannot-fund-the-poll-rate-the-ui-asks-for) —
  the same budget that returned **two plain 429s** on GBP/USD's import
  attempts on 2026-08-20. Over-deleting used to be free. It is not now. The
  runbook scopes on `created_at` and measures before deleting.
- **36,267 and 4,735 do not reconcile.** Nobody knows why. Step 0 of the
  runbook answers it, and nothing is deleted until it has.

The runbook also confirms the shift independently rather than trusting the
provider label: forex closes Friday 22:00 UTC, so legitimate 15m data has
essentially no Saturday bars, and a ~10h forward shift puts Friday afternoon
into Saturday morning where it can be counted.

Binance rows (8,644) are correct and must be kept — epoch milliseconds cannot
be misread as a local time. The table is a cache, so deleting costs one
refetch per window viewed; at 8 credits/min that refetch needs the
single-symbol throttle-aware path EC-5 describes, **not** `historical-sync`'s
all-33-symbols loop, which is what tripped the budget in the first place.

### Guard for next time

Any provider returning a *string* datetime needs its zone pinned explicitly at
the request, and asserted at the parse. Epoch-based feeds (Binance) are immune
by construction. A parse that appends a literal `"Z"` to a vendor string is the
smell — it encodes an assumption the vendor never promised.

---

## MD-3 — Paper trading uses one flat leverage, not per-asset-class

**Area:** Paper trading · **Found:** 2026-08-13 · **Status:** open, follow-up —
deliberate, not urgent

Margin for a paper order is `notional / paper_accounts.leverage` — a single
number per account (configurable 1–500, default 100) applied to every symbol.
That matches TradingView's basic model and is the intended behaviour for now.

Real brokers vary the requirement by asset class: 20:1 on E-mini S&P futures is
a 5% margin requirement, while FX majors might be 30:1 and crypto 2:1 on the
same account. Under a flat 100:1, an index-futures order reserves a fraction of
what a real broker would hold, so the margin figure is optimistic for anything
that is not FX.

### The machinery already exists

`src/lib/trading-engine/leverage.ts` has the whole thing —
`LEVERAGE_PROFILES` (retail / prop / crypto / institutional), per-market `max`
and `mmr` tables, and `effectiveLeverage(accountLeverage, profileId, market)`
which caps the account number by the profile's per-class ceiling. The prop-firm
engine uses it today via `AccountConfig.leverage_profile`.

### What blocks reuse

`paper_accounts` has no `leverage_profile` column, so
`validateNewOrder` / `computeAccountRisk` have nothing to pass. Adopting it
means:

1. a migration adding `leverage_profile` to `paper_accounts` (default
   `'institutional'` or a new `'flat'` entry, so existing accounts keep the
   behaviour they have now — anything else silently re-margins open positions);
2. threading `market` into `marginRequired` call sites, which currently take a
   scalar leverage;
3. deciding what the account-settings UI offers, since the profile changes
   margin on positions that are already open.

Point 1 is the trap: switching an existing 100:1 account to the `retail`
profile drops crypto to 2:1, multiplying used margin by 50 and potentially
putting the account straight into margin call on positions the trader never
touched.

### Not to be confused with

The **stop-out / margin-call** thresholds, which are already per-account
(`margin_call_level`, `stop_out_level`) and work correctly. This entry is only
about the leverage divisor used to compute required margin.

---

## E2E-1 — The UI suite fails as a suite while its specs pass individually

**Area:** Test infrastructure · **Found:** 2026-08-16 · **Status:** open, unassigned

`bun run test:e2e:ui` is not currently trustworthy. Run one spec file at a time
and it passes; run all thirteen and roughly half fail — always on timeouts,
never on an assertion.

### Measured

Three full runs on 2026-08-16, the last on an idle machine with
`node_modules/.vite` deleted first:

| Run | Conditions | Result | Wall clock |
| --- | --- | --- | --- |
| 1 | alongside `bun run check` | 7 failed / 6 passed | 17.9 min |
| 2 | alone, warm cache | 4 failed / 9 passed | 11.8 min |
| 3 | alone, cache cleared | 7 failed / 6 passed | 16.3 min |

Individually, in the same session: `positions-table.spec.ts` 3/3 in **1.0 min**,
`cold-start.spec.ts` 4/4 in **55s**. Inside the suite those same tests take
25s–1.7m each and blow their 90s timeout.

Run 1's contention is explanatory — concurrent `vite build` also clobbers the
dev server's optimised-deps cache, after which it serves broken modules. But
runs 2 and 3 had nothing else running, so contention is not the whole story.

### The symptom worth chasing first

The page renders **nothing**. A probe that opened `/replay/studio` on a running
dev server came back with `bodyHead: ""`, no `<canvas>`, and zero buttons — an
empty DOM, not a slow one. Earlier runs logged
`TypeError: Failed to fetch dynamically imported module: .../trading.index.tsx?tsr-split=component`
alongside `[vite] Internal server error: Transform failed`.

So the failures are almost certainly **the dev server degrading under repeated
route loads**, not the specs and not the app. The suite loads the full trading
workspace 13+ times in one server lifetime; one `node` process was measured at
**1.2 GB** RSS mid-run.

### Why it matters more than a flaky suite normally would

Every in-app verification in this project goes through this server. While it is
in this state, "I checked it in the browser" cannot be trusted — which is the
one check that has repeatedly caught what the typecheck could not.

### Where to start

- Reproduce with `playwright test -c playwright.ui.config.ts --repeat-each=3`
  on a single spec to see whether degradation tracks page loads.
- Watch the dev server's RSS across the run; if it climbs monotonically, the
  leak is the bug and `webServer.command` may need restarting between files.
- Consider `fullyParallel: false` + one worker per spec file, or a fresh server
  per file, as a mitigation rather than a fix.

### Not to be confused with

The four specs' own correctness. `positions-table`, `cold-start`,
`floating-order` and `margin-bar` have each been observed green in isolation on
this commit. `sl-tp-handles` has **not** been seen green since the suite entered
this state, so it is the one spec that could still be hiding a real regression —
most plausibly from the `overflow-hidden` clip added to the position overlay in
`12bcce21`, which is exactly the kind of change that could clip the entry line
the spec hovers.

---

## JR-6 — Manual entries written before 2026-08-17 carry a fabricated open time

**Area:** Journal · **Found:** 2026-08-17 · **Status:** open, data only —
the code defect is fixed

JR-4 (fixed in `0281df96`) had `ManualEntryDialog` stamping
`new Date(\`${tradeDate}T12:00:00\`)` — the browser's local noon — into both
`opened_at` and `closed_at`. The fix is forward-only. Rows written before it
still hold that value, and nothing in them says so.

Consequences for those rows, all silent:

- `opened_at` is noon in whatever timezone the author's browser was in, so the
  same trade logged from two countries has two different open times.
- `opened_at == closed_at`, so duration is zero.
- Any time-of-day or hold-time analysis over them measures the placeholder.

Measured 2026-08-16: 18 entries carried a hand-picked session, and all of them
came from this dialog. The true count of affected rows is however many manual
entries exist, which is larger.

### Why it was not migrated with the session backfill

There is nothing to migrate *to*. The real open time was never captured — it
was never asked for — so the honest correction is `opened_at = null`, which
throws away a value some users may have come to rely on reading, and cannot be
distinguished from a genuine noon trade without JR-5's `source` column plus a
cutoff on `created_at`.

Deliberately left for a decision rather than fixed quietly: the options are
null them, leave them, or leave them and exclude manual entries from
time-of-day analytics, and that is a product call.

---

## EC-9 — Replay Studio's "Next" button reveals an unreached event

**Area:** Replay Studio · economic calendar · **Found:** 2026-08-24 ·
**Status:** open — **left unfixed on purpose, may well be intended**

`StudioChart` gates its news markers on the replay clock:
`visibleNews = newsEvents.filter(e => e.timeMs <= marketTime)`
(`StudioChart.tsx:273`). An event the session has not reached has no marker,
so it cannot be clicked and its detail — forecast included — is unreachable.
`StudioNewsLayer` is fed that same gated list and inherits the guarantee.

**One place escapes that gate.** The toolbar's "Next" button
(`StudioChart.tsx:438-452`) is built from
`nextNews = newsEvents.find(e => e.timeMs > marketTime)` — unreached by
definition — and renders its **currency and title**, with its **UTC
timestamp** in the tooltip:

```tsx
Next: {nextNews.currency} {nextNews.title.slice(0, 22)}
…
Jump to {new Date(nextNews.timeMs).toISOString()…} UTC
```

**Why this is not obviously a bug.** In a real market the calendar is
published in advance — a live trader knows that payrolls land at 12:30 on
Friday, and knows the consensus forecast too. The only genuinely unknowable
quantity before a release is `actual`, and that is not exposed here. So this
may be a deliberate convenience rather than a leak, and it predates the
popover work that found it.

**Why it is recorded anyway.** It is the *only* place unreached event data
reaches the UI, and that fact is invisible from anywhere except this button.
Anyone who later wants an upcoming-event preview should start here — it is
the existing precedent, and building a second one without noticing it would
leave two surfaces disagreeing about what a replay session is allowed to
know.

**If it is ever decided to be a leak,** the fix is to render the schedule
without the identity — "Next event in 2h 14m" seeks just as well and reveals
nothing. Do not simply delete the button; seeking to the next release is a
genuinely useful control.

Deliberately NOT changed by the popover work of 2026-08-24, which held the
strict rule (gate on `visibleNews`, never `newsEvents`) precisely so that
loosening it stays a decision someone makes about replay integrity rather
than a side effect of a feature.

---
## MS-1 — The session rule has no concept of weekends

**Area:** Market sessions (journal, statistics, paper trading, replay) ·
**Found:** 2026-08-17 · **Status:** **FIXED 2026-08-20** — `4a90492f`, both
languages, verified by parity against the live database

> **Resolution.** The trading week is now gated on each centre's LOCAL weekday
> (Monday-Friday), in `src/lib/market-sessions/index.ts` and mirrored in
> `public.detect_session`. `nextSessionOpen` and `nextEquitiesOpen` are gated
> too, so replay no longer offers a London open on a Saturday.
>
> Local rather than UTC is the whole trick: expressed locally the week is
> simply Monday-to-Friday everywhere, and the ragged UTC edges fall out for
> free — Sydney local Monday 07:00 is 21:00Z in southern winter and 20:00Z in
> southern summer, and neither number appears in the code. A naive "skip
> Saturday and Sunday" gate deletes the week's real open; the fixture case at
> `2026-07-12T21:30:00Z` exists to catch exactly that.
>
> **Verified, not merely tested.** Nine weekend cases went into `cases.ts`
> BEFORE the gate was written and eight failed immediately. `check:sessions`
> then confirmed TypeScript and SQL agree across all 32 fixture cases against
> the live database — so the DB trigger that writes `journal_entries.session`
> now labels weekends `off_hours` as well.
>
> **Adding those cases caught the fixture asserting the bug.** The test
> "crosses a DST boundary without drifting an hour" probed 2026-10-24, a
> SATURDAY, and asserted London opening on it. This entry warned the fixture
> never asked about weekends; it was worse — it answered wrongly.
>
> **Two things this did NOT do.** Existing `journal_entries.session` rows keep
> their old labels (`session-backfill.sql` is a separate, deliberate decision
> about rewriting a trader's history). And `src/lib/analytics/periods.ts`
> remains a THIRD session implementation on fixed UTC hours with neither DST
> nor weekday awareness — logged, not folded in.

`src/lib/market-sessions` models each centre as a daily open/close in its own
timezone. It has no weekday awareness, so it reports London as open at 08:00
London on a **Saturday**, when there is no London session at all.

Two things a correct model needs and this one lacks:

1. **Weekday gating**, keyed on the centre's LOCAL weekday rather than UTC —
   near midnight the two disagree, which is exactly where the bug would hide.
2. **The week boundary.** The FX week opens with Sydney around 21:00 UTC on
   Sunday and closes with New York around 21:00–22:00 UTC on Friday. Those are
   not the same as "skip Saturday and Sunday": Sunday evening IS trading.

### Where it surfaces

- **Journal labels.** `journal_entries.session` is written by the draft trigger
  from `public.detect_session()`, which mirrors the same rule. A crypto trade
  closed at 07:00 UTC on a Saturday is labelled `london`. Forex cannot hit this
  (no weekend trades exist to label), so in practice it mislabels **crypto**
  trades with FX session names — and crypto is the one asset class for which
  these sessions arguably mean nothing anyway.

  > **THAT PREMISE EXPIRED 2026-08-20, and it is why MS-1 stopped being low
  > priority.** "Forex cannot hit this" was true when written on 2026-08-17.
  > MD-5 then established that the feed serves genuine weekend forex bars, and
  > MSYM-1 shipped multi-symbol replay over exactly that data on 2026-08-20. A
  > trader can now close a EUR/USD trade on a Saturday bar; `sessionAt` returns
  > `london_ny_overlap`; `journal/session-detect.ts:39` writes it to
  > `journal_entries.session`; and `statistics/session.ts:13` groups it into
  > the which-session-do-I-trade-best-in statistic.
  >
  > So a shipped feature converted a crypto-only annoyance into a forex
  > data-integrity bug. Nothing about MS-1 changed — its blast radius changed
  > underneath it, because a DIFFERENT item removed the condition that had been
  > containing it. Worth recording precisely: this is the shape of thing that
  > turns backlog into urgent without anyone editing the backlog.
- **Statistics.** The same rows then group under London/New York in
  `inferSession`, so "which session do I trade best in" counts weekend crypto
  as weekday FX.
- **Replay jumps.** `sessionJumpTargets` will offer "London open" on a Saturday.
  It degrades rather than breaks — the forward-only seek lands on the next
  available bar — but it offers an open that did not happen.

### Why the gate did not catch it

`market-sessions/cases.ts` is weighted toward DST transitions, and every case in
it falls on a weekday: 2026-01-15 (Thu), 2026-07-15 (Wed), 2026-10-28 (Wed),
2026-03-10 (Tue). Both implementations agree with each other and with the
fixture; the fixture simply never asks the question. Any fix must add weekend
cases there FIRST, or the same blind spot survives it.

### Open product question

What should a Saturday crypto trade be labelled? `off_hours` is the honest
answer for an FX-session vocabulary, but it reads as "no session" on an asset
that trades continuously. That is a naming decision, not an implementation one,
and it should be settled before the rule changes — the answer determines whether
weekend gating applies to all markets or only to FX.

---

## RS-1 — The playback transport's step buttons have no accessible name

**Area:** Replay Studio · playback controls · accessibility ·
**Found:** 2026-08-25 · **Status:** open — narrowed, the play/pause half shipped

Three icon-only buttons in `PlaybackControls.tsx` carry no accessible name:
step (`:106`), step-candle (`:115`) and skip-10 (`:124`). Each is a `Button`
with `size="icon"` whose only child is a Lucide glyph. A tooltip is not a
substitute — Radix's `TooltipContent` does not name its trigger, so a screen
reader announces these as unlabelled buttons.

The fix is one `aria-label` each, matching the tooltip text already written for
them. They are stateless actions, so unlike the play/pause toggle they need no
`aria-pressed` and carry no ambiguity about current state — this is purely the
accessibility half.

### What already shipped

The play/pause toggle was the sharp end of this and was fixed on 2026-08-25.
It renders `{playing ? <Pause/> : <Play/>}`, where the glyph names the ACTION
on click — so a Pause icon means the session is RUNNING. That is the ordinary
convention, but it reads exactly backwards to anyone treating the icon as a
status indicator, and the tooltip said `"Play / pause (Space)"` in both states,
so there was no second signal to check against.

That ambiguity cost real time: during the fold-freeze investigation a session
reported as "the UI showed PAUSED" was producing continuous chart ticks, which
is impossible while paused — the engine emits nothing and the rAF loop returns
early (`controller.ts:157`). The most likely explanation was the Pause glyph
being read as "it is paused". That was never confirmed and is recorded as
motive, not proof.

It now carries `aria-label={playing ? "Pause (Space)" : "Play (Space)"}` for the
action, `aria-pressed={playing}` for the state, and a tooltip that states both
(`"Playing — pause (Space)"` / `"Paused — play (Space)"`). The glyphs are
`aria-hidden`.

---

## EC-10 — WITHDRAWN · the "bug" was in code that never ran

**Area:** Chart drawings · projection · **Found:** 2026-08-25 ·
**Status:** closed — **entry was wrong; the component was deleted**

Kept as a record rather than deleted outright, because the way this entry
failed is more useful than the entry ever was. It is NOT open work.

### What was claimed

EC-10 reported that `DrawingLayer.tsx:69` projected anchors with
`adapter.timeToX`, which resolves with `findNearest: false` and returns null
for any timestamp that is not a bar's own open — the same root cause as the
news-marker popover that could not be clicked. The entry asserted the fault was
*"reachable from the toolbar in normal use"*, on the reasoning that a timeframe
fold moves the bar grid out from under existing drawings.

The code reading was accurate. The impact claim was invented.

### What was actually true

`src/features/replay/drawings/` was **dead code**. Nothing outside that
directory imported any of its five files, and `DrawingLayer` had no mount point
anywhere in the app. It could not misplace a drawing because it never drew one.

Studio's real drawings go `DrawingStore` (`@/lib/chart/drawings/store`) → the
adapter's `drawingsPaneView` primitive → `buildCoords()` →
`lib/chart/drawings/render.ts`, which has always used the interpolating
`c.x(...)`. That path never had the bug. The directory was deleted 2026-08-25;
after the `StudioNewsLayer` fix there is now no live consumer of `timeToX` at
all.

### Why it is worth a record

The entry was written, reviewed, and a fix was implemented and approved — all
without anyone establishing that the file executes. A grep for the symbol's
definition was done; a grep for its mount was not. Both fix and entry described
real code and were internally consistent, which is exactly what made them
convincing.

It surfaced only because a runtime check was demanded before shipping: the
attempt to write an e2e spec found there was nothing to drive. Static reading
cannot distinguish "correct" from "never executed" — only running it can.

**The cheap precaution:** before filing or fixing a defect in a component, grep
for where it is MOUNTED, not just where it is defined. One command, and it would
have retired this entry before any of the work.

Compare EC-9 and RS-1, which are also unfixed but were verified against running
code — the difference is not the quality of the reading, it is whether anything
executed it.

---

## RS-3 — `placeMarketOrder` keeps its own hardcoded 2R bracket

**Area:** Replay Studio · chart trading · **Found:** 2026-08-25 ·
**Status:** open — the seed itself is unfixed. **Narrowed 2026-08-26:** the
four market routes were consolidated into one, so there is now exactly ONE site
carrying the seed instead of four.

### Update 2026-08-26 — consolidation, and a sizing bug found on the way

Studio's order entry was reduced to one Buy and one Sell (toolbar). Removed:
the "Buy limit" / "Sell limit" arming buttons and the sidebar's "Buy market" /
"Sell market" pair. Resting orders keep their flow, reached by right-clicking
the chart — the same place the live workspace puts them.

The consolidation surfaced a defect nobody had filed. `placeMarketOrder`
defaulted to `size: opts.size ?? 1`, and **only the toolbar Buy/Sell passed a
real size**. The sidebar pair, the `B` / `S` hotkeys and the right-click market
entries all took the fallback, so they opened positions of **1 unit** regardless
of the Risk % field — two buttons an inch apart disagreeing by orders of
magnitude in money. `STUDIO_SHORTCUTS` had been advertising `B` as *"Market buy
at risk %"* the whole time.

Fixed by moving the default INTO `placeMarketOrder`
(`size: opts.size ?? sizeForRisk(price, stop)`), which required hoisting the
`equity` / `riskPercent` / `sizeForRisk` block above it. Every market route now
sizes off Risk %, and a caller can no longer forget.

This is a rescoping of RS-3, not a fix for it: the 0.2% stop and 2R target are
still the tool's choice. The point of consolidating first is that RS-4 Stage B
now has one call site to change.

Note that making every market route size off Risk % fixed the routes DISAGREEING
with each other. It did not make the resulting risk exact — see
[RS-5](#rs-5--position-size-is-computed-against-the-click-price-the-stop-is-not),
where the size is derived at the click price and the fill lands elsewhere.

`e2e/ui/replay-draft-order.spec.ts` is **skipped, not deleted** — its entry
gesture was the removed toolbar button. Re-pointing it at the right-click menu
was deliberately not spent, since Stage B is expected to rewrite it. The file
carries its own note.

### Original entry (2026-08-25)

Written when this was one of four sites; the reasoning below still stands for
the surviving one.

A fourth hardcoded-2R site, independent of `bracketFor` and untouched by the
draft work (`studio/context.tsx:354-355`):

```ts
const dist = opts.stopDistance ?? Math.max(price * 0.002, 1e-8);
const target = opts.targetDistance ?? dist * 2;
```

Reached by the `B` / `S` hotkeys and by the right-click menu's
"buy market" / "sell market" entries. Every other way of opening an order in
Studio now starts from levels the trader positioned; this one still ships a
0.2% stop and a 2R target the tool chose.

### Why it was left

A market order fills instantly, so there is no pre-commit window to drag
anything in. The obvious symmetry — fill with no stop and no target, let the
trader drag them on afterwards — is worse, not better: it hands back a LIVE
position carrying unmanaged risk for as long as it takes to notice and place a
stop. A flat 2R is a worse recommendation than none, but it is a better
default than an unprotected position.

### What a fix would have to decide

Not "remove the default" but "what should an express order do instead". Options
worth weighing, none free:

- a stop derived from recent range (ATR-like) rather than a flat 0.2% — still
  a recommendation, but one connected to the instrument;
- fill with a stop and NO target, since an unset target carries no risk while
  an unset stop does — needs nullable target levels in the order model, which
  the drag-then-commit work explicitly declined as another ticket's scope;
- require arming before a market order too, which removes the express path and
  is probably the wrong trade for a hotkey.

Worth settling alongside whatever decides the wider question of whether Studio
should ever propose a level.

---

## RS-4 — Studio's order flow does not match FXReplay: levels are optional and instant, not gated

**Area:** Replay Studio · chart trading · order model ·
**Found:** 2026-08-25 · **Status:** open — **scoped, RE-PRICED 2026-08-26, ready
to start.** The analysis below is done; do not redo it.

> **⚠ The original pricing was wrong and the entry below still reads as if it
> were not.** This was filed as "architecture change, not a bug fix", on a
> reading of Stage A's revert that treated 51 type errors as evidence the change
> could not be scoped. It was measured properly on 2026-08-26 — see
> **[Re-pricing](#re-pricing-2026-08-26--stage-a-is-a-refactor-not-an-architecture-project)**
> at the end of this entry. Stage A is a ~57-error, 82%-in-module refactor with
> ten mechanical null checks outside it. **Do Stage A.** Convergence onto
> `paper_trades` was priced in the same pass and rejected.

> **Do NOT revert commit `4f4fa148`.** It carries the drawings-fold regression
> tests as well as the draft flow, and those are unrelated and worth keeping.
> This is an EDIT-FORWARD ticket.

### The real behaviour, confirmed by video

Established by frame-by-frame review of two real FXReplay recordings — watched,
not inferred from documentation. That distinction matters: the previous
iteration of this design was built from a support article and got the mechanism
wrong.

1. Buy/Sell fills a **market order immediately** on click. No draft, no
   pre-commit stage, no confirm button. Position and P&L are live at once.
2. The position starts with **no stop and no target**. Neither is seeded and
   neither is required to exist.
3. A compact widget on the position's row offers **+TP / +SL**. Interacting
   with either adds THAT level, independently of the other.
4. Each addition **applies instantly on its own**. There is no shared commit
   gate. A position may carry just a stop, just a target, both, or neither,
   indefinitely.
5. TP/SL are live-editable columns on the Open Positions blotter — they belong
   to the position, not to a separate pending object.

### What ships today, and why it was left alone

Studio currently does arm -> click sets entry -> drag BOTH levels -> explicit
"Place order". That is a stricter, more deliberate flow than the real product:
it forces explicit placement of both levels before anything is committed.

It is not broken, and it is internally consistent. It was shipped and left in
place deliberately rather than rushed toward the real behaviour, because the
pivot introduces the two landmines below and doing that badly is far worse than
being conservative. Whoever picks this up is REPLACING a working flow, not
repairing a broken one — there is no pressure to hurry.

### ⚠ The load-bearing risk: `exitFor` has no null guards

`engine.ts:165-197` compares levels with raw operators. Measured coercion with
`exitQuote = 63000`:

```
long,  stop  = null  -> stopHit:   false
long,  target= null  -> targetHit: TRUE   -> closePrice: null -> 0
short, stop  = null  -> stopHit:   TRUE
short, target= null  -> targetHit: false
```

**A long with no target takes profit instantly at price 0. A short with no stop
stops out instantly.** Neither throws. Both produce a plausible-looking exit
stamped `reason: "stop_loss"` / `"take_profit"`, which is then written to the
durable trade tape and into analytics.

That is the single reason this was not attempted in the session that scoped it.
A booked-but-wrong closure is not cheaply undone — re-opening at a later price
corrupts the journal worse than leaving it. **Any implementation must guard
these explicitly before a single nullable level reaches the engine**, and must
have e2e coverage proving a stopless position SURVIVES ticks that would
previously have force-closed it. That test is the deliverable, not a nicety.

### The sizing gap — needs a product decision before any code

`sizeForRisk(entry, stop)` (`studio/context.tsx:393-401`) derives position size
from the **stop distance**. With no stop the distance is 0 and it returns a
fallback of `1` unit, which is meaningless money.

Real FXReplay sizes by **lots**. Studio's toolbar is built around a **Risk %**
input. So this pivot does not merely make levels optional — it removes the
input Studio's whole sizing model depends on. Without a replacement, every
stopless market fill is sized at 1 unit.

Decide this FIRST: a lots/units control, what Risk % means (or whether it is
hidden) when no stop exists, and what a later +SL does to the size of an
already-open position. It is a product decision with UI attached, not a detail
to settle mid-implementation.

### Open question — limit and stop orders were never observed

Both recordings showed only market Buy/Sell. The natural assumption is to keep
`validateOrder`'s `entry/stop/target > 0` requirement strict for limit and stop
orders while relaxing it for market fills — but **that is inferred, not
confirmed**. Verify it against real FXReplay limit-order behaviour before
building it in. It decides whether this is "market orders are special" or "all
Studio orders have optional levels", which are materially different tickets.

### Model work, once those two are settled

`validateOrder` gates every placement at `service.ts:103`.

| Item | Where |
|---|---|
| `stop`/`target` nullable, plus derived `risk`/`reward`/`rr` | `orders/model.ts:51-64` |
| `validateOrder` relaxation (market only, pending the question above) | `orders/model.ts:255-257` |
| `riskPerUnit` — R-multiple is undefined with no stop | `position-manager.ts:72, 134, 267` |
| `breakEven` / `trailing` — both need a stop, must refuse when absent | `position-manager.ts:303-391` |
| `modifyLevels` — becomes "add OR move", today assumes a level exists | `position-manager.ts:397-406` |
| Closed-trade record — `initialStop ?? order.stop` | `closed-trade.ts:190-191, 250-251` |
| ~44 non-null `.stop` / `.target` reads to audit | orders module, excl. tests |
| ~~8 test files~~ **0 — measured, they compile unchanged** | `orders/__tests__/` |

The two rows above were estimates. The audit is now measured: see
[Re-pricing](#re-pricing-2026-08-26--stage-a-is-a-refactor-not-an-architecture-project).
The test-file row was simply wrong — `tsconfig.json` includes `src/**/*.ts`, so
`orders/__tests__/` IS type-checked, and widening produces **zero** errors there
because the suites construct real numbers, which satisfy `number | null`. They
need NEW cases for the null paths, not fixes to existing ones.

**No migration needed.** `chart_closed_trades.initial_stop`, `final_stop`,
`initial_target` and `final_target` are already nullable. Worth knowing up
front, since migrations here are applied by hand.

### What to keep and delete from the current draft flow

| Piece | Verdict |
|---|---|
| Ghost-handle rendering — parked at entry, dashed, "drag to place", `OrderLine`'s `ghost` prop | **KEEP.** This is already the +SL/+TP affordance; it just attaches to a live position instead of a draft |
| `DraftOrder`, `draftIsComplete`, draft state, status bar, commit/cancel | **DELETE.** The shared gate is exactly what is wrong |
| `DragState`'s second variant (`on: "draft"`) | **DELETE.** No draft means no second variant; reverts to the simpler shape |
| `e2e/ui/replay-draft-order.spec.ts` | **REWRITE.** Its assertions encode the gate being removed. The scaffolding — seed/teardown, `orderCount`, `dragHandle` — transfers directly |

Note the ghost-handle pattern also solved a problem the replacement will hit
again: an unplaced level has no coordinate, so it has no handle, so there is
nothing to drag. It parks at the entry line at zero distance — grabbable, and
proposing no ratio.

### The principle worth carrying over

"No default value, no tacit ratio" was right and should survive the rewrite.
What was wrong was the mechanism: optional-and-instant-per-level, not
required-and-gated-together. The same principle already shipped in
`TradePlanner`, which is a different surface (live/paper workspace, plan then
send to the order panel), never claimed to match FXReplay, and is **unaffected
by this ticket** — paper trading's schemas already treat `stop_loss` and
`take_profit` as nullable.

---

## RS-4 · Addendum 2026-08-26 — the reference implementation already exists

Investigated after a Trading Workspace screen recording showed the exact
interaction Stage B/C was scoped to build from scratch. It is already shipped,
mounted, and covered by its own e2e spec. **Do not build Stage B/C from a blank
file — port this.**

### The reference: `src/components/trading/chart/PositionLinesLive.tsx`

Mounted at exactly one place, `TradingWorkspace.tsx:1006`. On a live position
with no stop or target, it renders a grabbable ghost handle for the missing
level; dragging it sets that level, on release, independently of the other. No
ticket, no draft, no commit button. The `"Moving Stop"` / `"Moving Target"`
drag tooltip is line 725.

The pattern is three parts, all worth copying verbatim in shape:

| Piece | Where | What it solves |
|---|---|---|
| `defaultLevel(sym, direction, entry, kind)` | line 73 | An unset level has no coordinate, so it has no handle, so there is nothing to grab. Parks it at 0.5% of entry on the correct side — scale-free, works at 64,000 and at 1.10 |
| Ghost handles `+ SL` / `+ TP` | lines 636–689 | Revealed on proximity to the position; `ghost` + `testId` props |
| `beginDrag(id, handle, price, seed)` | line 264 | `seed: true` writes the placeholder into `overrides` up front, so a **plain click with no movement still commits at the default**. Existing levels are not seeded, so a stray click does not re-issue a write for the price it already has |

Its e2e spec — **`e2e/ui/sl-tp-handles.spec.ts`** — drives `sl-add-${id}` and
`tp-add-${id}`. Model Studio's spec on it directly; the RS-4 deliverable
("a stopless position SURVIVES ticks") slots into the same shape.

### How much is already shared

More than expected. **`StudioTradeLayer` already imports the same primitives**
(`StudioTradeLayer.tsx:20-21` → `components/trading/chart/order-line-ui`:
`OrderLine`, `OrderLabel`, `LineAction`, `DragTooltip`, `AXIS_INSET`), and the
`ghost` and `testId` props the pattern needs are already on those primitives
(`order-line-ui.tsx:32, 73-74, 98, 133`).

Studio also **already drags a live position's stop and target** —
`startDrag(order.id, "stop", "position", row.stop)` at `StudioTradeLayer.tsx:419`
and `:437`, committing through `modifyLevels`. Its `DragTooltip` (line 446)
shows two rows where the reference shows five (Price, R:R, Potential profit,
Potential loss, Floating P/L).

So the missing UI is narrower than the RS-4 table implies: a handle for a level
that does not exist yet, and a richer tooltip. What is NOT shared is the model —
the workspace runs on `lib/trading-engine` + `paper_trades`
(`stop_loss?: number | null` natively, `modifyTrade` persists null to remove a
level), Studio runs on `lib/chart/orders`. **The port crosses a model boundary;
the blocker in the main entry above is unchanged.**

### Two findings that narrow Stage C

**1. `updatePositionLevels` does not call `validateOrder`.**
`service.ts:656-677` writes straight through `withLevels`. The
drag-a-level-onto-a-live-position write — precisely the Stage C gesture — is
already ungated. The `entry/stop/target > 0` requirement bites only at
*placement*, `placeOrEditOrder` → `validateOrder` (`service.ts:103`).

**2. `validateOrder`'s finite check is the single relaxation point.**
`model.ts:250-257`. Relaxing it *for market orders only* is the minimal change
that lets a stopless position be created — and it is the one place to do it,
which also keeps the "market orders are special vs. all orders optional" open
question above honest, because the two answers differ by the scope of this one
guard.

### ⛔ The NaN-sentinel shortcut — NOT RECOMMENDED

Recorded so it is not rediscovered as a clever idea by someone who cannot see
why it was rejected.

The Stage 1 and A′ guards are all `Number.isFinite`, not `!= null` — the A′
commit says outright that null, undefined and NaN are the same statement. So a
stopless position **is already representable in the existing non-nullable
`number` type as `NaN`**, with zero type changes, and `exitFor` correctly
refuses to trigger on it. It looks like it dodges the type widening that sank
Stage A — a widening since measured at 57 errors, only ten of them outside the
orders module.

It does not. The costs, all real:

- **It is a type lie.** `stop: number` would hold a value the type forbids in
  meaning, and every future reader is entitled to trust the annotation.
- **~44 non-null `.stop` / `.target` reads are unguarded.** Those that do not
  use `Number.isFinite` propagate NaN into displays as the literal string
  `"NaN"`. Better than A′'s silent-but-plausible 63000, still wrong.
- **It does not survive persistence.** The order store persists via
  `JSON.stringify` (`store.ts:176`), which turns `NaN` into `null`. After a
  refresh the field holds `null` — the very value the type forbids. The guarded
  reads handle it identically, so this converges rather than corrupting, but the
  representation is then not even the one that was chosen.

Do the widening properly, or do not do it. The sentinel buys a smaller diff and
pays for it in a category of bug this ticket already exists to prevent.

### Trap 3 — "no migration needed" was wrong (2026-08-26)

Alongside the `exitFor` and `riskBasisOf` coercions, because it is the same
mistake wearing different clothes: a value that means "there is no measurement"
being forced into a shape that can only express a number.

RS-4's model-work table said, correctly, **"No migration needed —
`chart_closed_trades.initial_stop`, `final_stop`, `initial_target` and
`final_target` are already nullable."** That is true, and it is about the four
LEVEL columns.

Stage A nullified two **DERIVED** columns the note never mentioned:

| Column | Was | Stage A writes |
|---|---|---|
| `initial_risk_distance` | `NUMERIC NOT NULL DEFAULT 0` | `null` with no stop |
| `realized_r` | `NUMERIC NOT NULL DEFAULT 0` | `null` with no stop |

Every stopless close 400'd on the upsert. Nothing surfaced it: the write result
was discarded (`await supabase...` with no `{ error }` read), so it failed
through the full unit suite, the full Playwright suite, and a publish, leaving
only a bare `400` in the browser console — found by accident while debugging an
unrelated test assertion. **One real trade was lost this way** before it was
caught (audited from the session snapshot, which persists the order book on an
independent path; see `scripts/audit-lost-trades.ts`).

The Stage A commit message repeated "No migration needed" verbatim from this
entry without rechecking. The note was not wrong; applying it to columns it
never covered was.

**The lesson: when widening a type, re-audit the DB schema for every column the
change can reach — not only the ones a prior note mentions.** Derived columns
are the ones that get missed, because the note that cleared the schema was
written about the source fields.

Two fixes shipped with it: `20260826120000_nullable_closed_trade_risk_columns.sql`
(applied by hand, verified by writing a NULL row rather than trusting the
editor's success message), and error surfacing in `replay-trade-sync.ts` so a
rejected durable write can never again be silent — it logs and raises a toast,
while still degrading to local-only trading rather than breaking the session.

### Sizing — SETTLED 2026-08-26, and the earlier pricing was wrong

`sizeForRisk(entry, stop)` derives size from stop distance, so with no stop
there is nothing to divide by. Three options were priced for this — a fixed unit
default (A), a quantity field (B), adopting `lot_size` the way
`PositionLinesLive` does (C) — and Option A shipped as provisional because C was
judged "a second model change on top of this one".

**That pricing was wrong in its premise. Option C was not unbuilt — it was
UNWIRED.**

`src/lib/replay/settings.ts:20` has defined `defaultLotSize` all along, with an
input on the Replay Settings page (`replay.settings.tsx:66`) and localStorage
persistence. **Nothing read it.** A user-facing setting connected to nothing.

So the work was never "add lot sizing"; it was "wire the lot-size setting that
already exists, and delete the duplicate". Studio now reads `defaultLotSize`
for a stopless fill, and the provisional `defaultUnits` control added to the
toolbar the same day is gone.

⚠ **LOTS IN, UNITS OUT.** `defaultLotSize` is in LOTS; `PositionOrder.size` is
consumed in UNITS. They differ by `contractSize` — 1 for crypto, 100,000 for
every forex pair — so passing lots straight through does not error, it
understates forex P&L by five orders of magnitude and tests clean on crypto.
That is [BA-9](#ba-9--size-is-validated-as-lots-and-consumed-as-units). The
conversion is `lotsToUnits` in `lib/replay/chart-trading.ts`, applied once at
the context boundary, and it is unit-tested against a forex contract size
specifically — a crypto-only case would pass against unconverted lots.

**The wider lesson, and it cost a control:** the provisional `defaultUnits`
field was added to the toolbar *next to Risk %* while `defaultLotSize` sat
unread in Settings. That is the same defect this whole day opened with — three
Buy buttons that disagreed — reproduced in miniature while fixing it. **Before
adding a control for a decision, grep for whether the setting already exists.**
A dead setting looks exactly like a missing one from the code that needs it.

`defaultRiskPct` in the same file is ALSO unread — Studio's toolbar carries its
own `riskPercent` state instead. Left alone deliberately rather than swept in,
but it is the same trap armed and waiting.

What this does NOT change: a later `+SL` on an open position still does not
resize it. Re-sizing an open trade changes the basis its P&L is measured
against mid-flight, which is worse than an arbitrary size.

### Two things that will bite Stage B's e2e spec

Both found while writing `e2e/ui/replay-order-consolidation.spec.ts`, both cost
a debugging pass, neither is a defect.

**Studio resumes its saved book.** Loading the same `replay_sessions.id` twice
restores the previous run's positions rather than starting empty. A spec that
measures two orders against one session id reads the FIRST one back both times,
and the failure is quiet and convincing — entry, stop and target all match too,
because they were placed at the same cursor. **Seed one session per
measurement.**

**A market order fills one bar after it is sized.** Studio sizes at the price
under the cursor when the button is clicked, but the order needs one
observation to fill, and fills at the NEXT bar's price while the stop stays
where it was placed. Measured: sized at 63,072.01, filled at 63,144.01 — 72
points of drift, turning an intended $99.65 of risk into $156.53 realized. The
blotter reports `averageEntry` (the fill), so **any absolute risk assertion made
through the DOM measures the drift, not the sizing** — assert a ratio instead
(double the Risk %, expect double the size).

That drift is pre-existing and unchanged by the consolidation, but it is a real
correctness gap in risk management, not merely a testing inconvenience: a
position sized for 1% that opens carrying 1.57% is a risk model the trader did
not choose. **It now has its own entry —
[RS-5](#rs-5--position-size-is-computed-against-the-click-price-the-stop-is-not)
— because it is too easy to lose in a subsection about writing specs.** Decide
it alongside Stage C's sizing question; the two answers constrain each other.

---

## RS-5 — Position size is computed against the click price; the stop is not

**Area:** Replay Studio · chart trading · risk management ·
**Found:** 2026-08-26 · **Status:** open — **pre-existing**, not introduced by
the order-entry consolidation that shipped the same day. Measured, not inferred.

Studio derives position size from the stop DISTANCE at the moment the button is
clicked:

```ts
size = (equity × riskPercent / 100) / |clickPrice − stop|
```

A market order does not fill at `clickPrice`. It is triggerable on sight
(`engine.ts` — `case "market": return true`) but still needs one observation,
so it fills at the NEXT bar's price. The stop was already written at a fixed
price and does not follow. The distance the position actually carries is
therefore `|fillPrice − stop|`, which is not the distance it was sized against.

### Measured

One BTC/USDT fill, 10,000 balance, Risk % left at its default of 1:

| | |
|---|---|
| Sizing price (click) | 63,072.01 |
| Stop written | 62,945.86598 |
| Sized distance | 126.14 |
| Size | 0.79274 |
| **Intended risk** | **$99.65 — 1.00% of equity** ✅ |
| Fill price (next bar) | 63,144.01 |
| Drift | 72.00 |
| Realized distance | 198.14 |
| **Realized risk** | **$156.53 — 1.57% of equity** ❌ |

The sizing arithmetic is correct. The gap is entirely that two numbers are
captured at two different moments and only one of them moves.

### Why it is easy to miss

Nothing errors and nothing looks wrong. The blotter's position row reports
`averageEntry` — the FILL — so the row shows a stop distance consistent with
its own displayed entry, and a reader checking `size × |entry − stop|` against
the risk budget sees a number that disagrees with the Risk % field with no
indication of which half is at fault. This cost a debugging pass while writing
`e2e/ui/replay-order-consolidation.spec.ts`, where an absolute risk assertion
failed against correct sizing code.

It also means **an e2e assertion cannot measure sizing through the DOM**. Assert
a ratio instead — double the Risk %, expect double the size — which is what that
spec now does.

### Direction of the error is not symmetric in practice

Drift is unsigned in principle: a favourable gap reduces realized risk as easily
as an adverse one increases it. But the case that matters is the adverse one,
because it is the one that breaches a risk limit the trader believes they set.
A trader who types 1% and receives 1.57% has not been warned, and on a prop-firm
challenge (see the challenge envelope work) that is the difference between
passing and breaching.

### Not fixed here, and what it interacts with

Left alone deliberately: the fix is a product decision, not a patch, and it is
the same decision Stage C already owes an answer for. Options, none free:

- **Size after the fill** — derive size from `fillPrice`, which needs the stop
  to be known at fill time and the order to be sized post-hoc;
- **Move the stop with the fill** — preserve the intended DISTANCE rather than
  the intended price, which silently relocates a level the trader chose;
- **Re-derive nothing and disclose** — show realized risk on the position row
  when it differs from intended by more than a threshold;
- **Fill at the click price** — removes the drift by removing the realism, and
  is probably wrong for a replay tool whose point is honest execution.

**Update 2026-08-26 — the companion sizing question is now settled, and it
narrows this one.** RS-4's sizing decision was resolved by wiring
`defaultLotSize`, a Replay Setting that already existed and was read by nothing.
A STOPLESS fill is therefore sized in lots and does not depend on the stop
distance at all, so fill drift cannot distort its size — for that case this is
purely a reporting problem.

It is still a real defect for a fill that DOES carry a stop, which is every
right-click limit/stop order and any market order given an explicit level: those
are sized by `sizeForRisk` against the click price while the fill lands
elsewhere. The measured 1% → 1.57% above is exactly that path.

So the scope shrank rather than closing: **this is now a defect of stop-carrying
orders only.** The four options above still stand for those, and "re-derive
nothing and disclose" is the cheapest of them now that the stopless case is out
of scope.

---

## Re-pricing 2026-08-26 — Stage A is a refactor, not an architecture project

Belongs to [RS-4](#rs-4--studios-order-flow-does-not-match-fxreplay-levels-are-optional-and-instant-not-gated).
Everything here was **measured**, not estimated: the widening was applied, `tsc`
was run, the output was counted by file, and the change was reverted. The tree
was clean before and after.

### The premise this entry was written on is wrong

RS-4, and the session that scoped it, treat `lib/chart/orders` as "Studio's
model" and `paper_trades` as "the workspace's model". **Trading Workspace mounts
both.** It uses `usePositionOrders` — the same `PositionOrder` model
(`TradingWorkspace.tsx:449`) — for the Position Tool, *and* `PositionLinesLive`
over `paper_trades` (`:1006`).

The real split is **chart-drawing-derived orders (in-memory) vs account-backed
trades (server)**, and `lib/chart/orders` has three consumers:

| Consumer | Entry point |
|---|---|
| Replay Studio | `studio/context.tsx` to `placeOrEditOrder` |
| Battle Arena | `BattleChart.tsx:20` to `placeOrEditOrder` directly |
| Trading Workspace's Position Tool | `usePositionOrders` (`TradingWorkspace.tsx:449`) |

Any plan that says "move Studio onto the other model" must reckon with the fact
that this **does not delete the second system.**

### Stage A, measured

`stop` and `target` widened to `number | null` on both `PositionOrder` and
`OrderDraft`, then `bunx tsc --noEmit`:

| Location | Errors | Character |
|---|---|---|
| `lib/chart/orders/*` — the module that owns the concept | **47 (82%)** | model 16, service 11, position-manager 7, engine 7, closed-trade 6 |
| `BattleChart.tsx` | 4 | 2 assignments, 2 `possibly null` at render |
| `StudioTradeLayer.tsx` | 2 | assignment to a `number` prop |
| `PendingOrdersPanel.tsx` | 2 | `possibly null` at a format site |
| `usePositionOrders.ts` | 1 | argument pass-through |
| `PositionOrderDialog.tsx` | 1 | `possibly null` at a format site |
| `orders/__tests__/` (8 files, in tsconfig scope) | **0** | compile unchanged |
| **Total** | **57** | |

**The old figure of 51 was roughly right; the conclusion drawn from it was not.**
Every one of the ten consumer errors is a display or pass-through null check —
`'p.stop' is possibly 'null'` at a formatting site, or `number | null` assigned
to a `number` prop. **None is structural.** They are the same em-dash treatment
Stage A-prime already applied in `StudioTradeLayer`.

"51 type errors across 10 files... it cannot be scoped to the market-order path"
is true about the count and wrong about the implication. The blast radius
*outside the module that owns the concept* is ten mechanical fixes in five
files. Teaching `lib/chart/orders` that a level can be absent is not incidental
damage — it is the ticket.

### The zero-distance seed — dead end, do not try it

The tempting narrower fix: keep `stop`/`target` non-nullable, seed them at the
entry price (zero distance), and require the trader to drag them out before they
mean anything — the way `TradePlanner` starts unplaced.

**`validateOrder` rejects it twice**, and neither guard is incidental:

- `model.ts:268` — `if (stop >= entry)` gives *"Buy order: stop loss must be
  below entry."* A zero-distance stop IS `stop === entry`.
- `model.ts:283` — `if (risk <= 0)` gives *"Risk is zero or negative — move the
  stop away from the entry price."*

So it needs **the same relaxation as the null representation** — it is not a way
around the widening, it is the widening with a worse representation.

And forcing it through is actively harmful: `sizeForRisk(entry, stop)` divides
by the stop distance, so a zero distance returns the `1` fallback and every
seeded position is sized at one unit — **reintroducing exactly the bug fixed in
RS-3 on 2026-08-26.** A sentinel that is indistinguishable from a real level at
the type level, rejected by the validator, and silently destroys sizing. Null is
strictly better on all three counts.

### Why the split is partly genuine — three real reasons

These are not historical accidents, and a convergence plan has to solve each:

**1 - Market-time stamping.** `chart_closed_trades` stores explicit
`entry_time BIGINT` / `exit_time BIGINT`. `paper_trades.opened_at` is
`TIMESTAMPTZ NOT NULL DEFAULT now()`, and **`openTradeSchema`
(`paper-trading.functions.ts:215`) has no `opened_at` field at all** — there is
no way to pass market time through it. A trade replayed on 2026-07-05 data would
be stamped with today's wall clock. That is the
[JR-6](#jr-6--manual-entries-written-before-2026-08-17-carry-a-fabricated-open-time)
bug class, already on this list.

**2 - Cursor-exact resume.** `SessionSnapshot` (`replay/session/model.ts:61`)
carries `orders: PositionOrder[]` alongside the clock cursor and the event tail,
so a session restores to an exact observation index. `paper_trades` has no
observation-index concept.

**3 - Session scoping.** `paper_trades.account_id` is `NOT NULL` and `openTrade`
pre-flights against `paper_accounts` balance. Replay sessions carry their own
`initial_balance` and are not accounts.
[BA-11](#ba-11--battle-replay-writes-pl-that-never-reaches-balance-or-statistics)
is the precedent for what a replay-shaped writer does to that table.

**NOT a reason: backward scrubbing.** The clock refuses it outright —
*"Backwards seeks are refused here — rewinding is a session-level operation...
because trades cannot be un-executed"* — and there is no rewind in the
controller. Replay is forward-only, exactly like live. Do not cite scrubbing as
a justification for the split; it does not exist.

**Throughput is real but proves less than it appears.** `MAX_SPEED` is 100 and
`CANDLES_PER_SECOND_AT_1X` is 1, with up to 4 observations per candle, so 100x
is ~400 observations/sec; `seekForwardTo` replays every intervening observation
synchronously, so a one-day jump on 5m bars is 1,100+ in a single burst. Against
that, the live feed's fallback floor is 60s per symbol
(`SNAPSHOT_MIN_GAP_MS`), the SL/TP monitor polls at 3s and position rows at 4s.
A per-tick round-trip is infeasible by two to three orders of magnitude — **but
neither system does per-tick writes.** Studio autosaves every 5s / 400
observations with an immediate flush on fills and closes
(`DEFAULT_AUTOSAVE_POLICY`); the live system writes per user action and
evaluates ticks client-side in `useSlTpMonitor`. Both already evaluate in memory
and persist on events. The throughput number justifies an in-memory
**evaluation layer**, which both have — not a second **model**.

### Historical, not genuine — the duplication worth resenting

The separation has reasons. The **parallel feature set** does not: both sides
grew their own implementations of the same capabilities.

| Capability | `lib/chart/orders` | `paper_trades` side |
|---|---|---|
| Partial close | `position-manager.ts` | `partialCloseTrade` (server fn) |
| Break-even | `moveStopToBreakEven` | `moveToBreakEven` (server fn) |
| TP ladder / staged exits | `take-profit.ts` | `paper_trade_exits` + `updateExitLeg` |
| **Trailing stops** | `trailing.ts` | **absent — nothing in `trading-engine/` or `paper-trading/`** |
| Executions tape, `riskBasis`, `remainingQuantity` | yes | no |

Two implementations of partial close, break-even and the exit ladder is real
duplication and a real maintenance tax. Note the asymmetry in the last two rows:
`lib/chart/orders` is the **richer** model, so moving Studio onto `paper_trades`
would be a feature *downgrade* unless trailing were ported first.

### Convergence onto `paper_trades` — PRICED AND REJECTED

Recorded so it is not re-proposed as the obvious clean answer. What it would
actually take:

- add `opened_at` / `closed_at` to `openTrade` / `closeTrade` and plumb market
  time through every caller;
- session scoping — a throwaway `paper_account` per replay session, or a session
  column plus excluding replay rows from balance, `account_statistics` and every
  analytics reader (the BA-11 trap, on the table the dashboard and journal read);
- port trailing to the server model;
- replace snapshot resume with a cursor rebuild, or keep snapshots anyway;
- **keep an in-memory evaluation cache regardless**, per the throughput note;
- migrate Battle Arena **and** the Workspace's Position Tool too — otherwise
  `lib/chart/orders` stays alive and you maintain two systems *plus* a migrated
  Studio.

That last point is decisive. **Convergence does not delete the second system**
unless all three consumers move. Rejected: it is many times Stage A's cost, it
solves none of RS-4's actual problem (optional levels) on its own, and it leaves
the duplication standing unless carried far beyond Studio.

The cheaper version of the same instinct is already the plan: the two sides
share `order-line-ui` and `use-chart-geometry` today, and the
[addendum](#rs-4--addendum-2026-08-26--the-reference-implementation-already-exists)
proposes sharing more UI and math primitives by porting `PositionLinesLive`'s
pattern. That captures most of the anti-duplication benefit without touching
either persistence model.

### Recommendation — do Stage A

**Stage A is a ~57-error refactor, 82% of it inside the module that owns the
concept, plus ten mechanical null-check fixes across five files and zero test
fixes. It is not the architecture project it was priced as on 2026-08-25.**

Order of work:

1. **Stage A** — widen `stop`/`target` to `number | null` on `PositionOrder` and
   `OrderDraft`; teach `lib/chart/orders` that a level can be absent (the 47);
   apply the ten display null checks; add null-path test cases.
2. **Relax `validateOrder` for market orders only** (`model.ts:250-257`) — the
   single relaxation point, still pending the limit/stop question above.
3. **Stage B/C** — port the `PositionLinesLive` ghost-handle pattern per the
   addendum.
4. **Sizing — DONE 2026-08-26.** Settled by wiring `defaultLotSize`, which
   already existed and was read by nothing — see "Sizing — SETTLED" above.
   [RS-5](#rs-5--position-size-is-computed-against-the-click-price-the-stop-is-not)
   remains open on its own terms: fill drift is a separate defect.

The runtime landmines that made this dangerous — the `exitFor` coercion and the
`riskBasisOf` family — were closed by Stage 1 and Stage A-prime and are already
`Number.isFinite`-guarded, so they accept an absent level correctly the day the
type allows one.
