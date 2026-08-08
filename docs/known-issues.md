# Known issues

Open defects found during investigation but deliberately left unfixed, with
enough detail to pick up cold. Remove an entry when it ships a fix.

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
