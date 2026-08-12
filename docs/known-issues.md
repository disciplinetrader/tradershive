# Known issues

Open defects found during investigation but deliberately left unfixed, with
enough detail to pick up cold. Remove an entry when it ships a fix.

> **Building anything that places an order? Read
> [BA-9](#ba-9--size-is-validated-as-lots-and-consumed-as-units) first.**
> `PositionOrder.size` is validated as lots and consumed as units. Passing lots
> does not error — it understates P&L by `contractSize`, which is 1 for crypto
> and 100,000 for forex, so it tests clean and ships wrong. Two callers convert
> explicitly today; a third would inherit the bug.

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

**Area:** Battle Arena · **Found:** 2026-08-07 · **Status:** open, unassigned

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

**Area:** Platform-wide · **Found:** 2026-08-07 · **Status:** open, partially
addressed (battle jobs only)

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
