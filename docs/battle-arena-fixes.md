# Battle Arena — investigation and fixes

Branch: `fix/battle-arena-core` · Investigation date: 2026-08-07

Four reported defects (A–D), their root causes, what has been implemented, and
what still has to happen. Several additional defects surfaced during the work;
those are at the bottom, and the ones left unfixed are logged in
[`known-issues.md`](./known-issues.md).

## Status at a glance

| | Symptom | Root cause | Status |
|---|---|---|---|
| **A** | Create battle → "Failed to fetch" | Unresolved — narrowed to response delivery | **Open**, blocked on one observation |
| **B** | Duplicate realtime channels | `ArenaCommandRail` mounted twice + 3 topics | **Fixed, verified 2026-08-07** |
| **C** | Battles never start | State machine had no caller | **Fixed, verified 2026-08-07** |
| **D** | Buy/Sell do nothing | `OrderPanel` never mounts in battle mode | **Fixed, verified 2026-08-07** |

C and D shipped in `35e00a33`, B in `13879432`. Migrations applied and
deployed; **B, C and D were then observed working end-to-end on a real
battle** — see [Verification](#verification-performed).

Still outstanding: `CRON_SECRET` and the cron swap (steps 2, 4, 5 of the
runbook), so battles nobody has open still neither start nor settle.

---

## C — Battles never reach `live`

**The gate for everything else.** Fix this first; D and B cannot be tested until
a battle actually starts.

### Root cause

Every status transition lived in `tick_battles()`
(`supabase/migrations/20260805094542_*.sql:240-265`), and **nothing called it**.
The `tickBattles` server fn had zero callers. There was no HTTP route for it and
no pg_cron job for it.

`battle-settlement-every-minute` *has* been scheduled all along, but it only
queries `status = 'live' AND end_at <= now()` and calls `finalize_battle`
(`src/routes/api/public/hooks/battle-settlement.ts:33-50`). It is a settlement
job, not a tick job — it has no code path that can move a battle toward `live`.
Even running perfectly it would leave every `upcoming` battle untouched.

Confirmed by production data: of 17 battles, **only `1v1` had ever reached
`live` or `completed`**. `2v2` and `ffa5` never left `upcoming`/`cancelled`.
Zero rows had ever existed at `open`, `filling`, or `countdown`.

The one path that did work was an accident — a hardcoded 1v1 auto-start in
`joinBattle` that flipped straight to `live` once two players joined, skipping
`ready`/`countdown` entirely. It masked the fact that nothing drove the real
sequence.

### Contributing defects

1. **`upcoming` battles could never reach `ready`.** `join_battle()` only
   promoted `open → filling` (`20260805094542_*.sql:51-53`), yet it *accepted*
   joins on `upcoming`. Battles filled up and stayed stranded. 10 of 17 battles
   were parked this way.
2. **No `open`/`filling → ready` promotion existed anywhere.** `tick_battles`
   only handled `ready → countdown`. A battle that filled while `upcoming` and
   was later flipped to `open` by the cron would still never reach `ready`
   unless someone happened to join again afterwards. Scheduling the existing
   `tick_battles` unchanged would *not* have fixed the bug.
3. **Stale row snapshot in `join_battle`.** `v_battle` was read at function
   entry and never refreshed, so the `IF … v_battle.status = 'filling'` check
   at `:57` could not fire in the same call that set `filling`.
4. **`finalize_battle` was not idempotent.** It increments `profiles.elo`,
   `battles_played`, `battle_wins`, streaks, and inserts `elo_history` — none
   of it repeat-safe — with no guard beyond `IF NOT FOUND`. The host's Finalize
   button, the settlement job, and the new cron could all race.

### Fix — `supabase/migrations/20260807102317_battle_arena_state_machine.sql`

1. **`tick_battle(uuid)` — new.** Per-battle state machine, `SECURITY DEFINER`,
   `GRANT EXECUTE … TO authenticated`. Every transition is gated on a timestamp
   *and* asserts the expected status in its `WHERE` clause, making it a
   compare-and-swap: concurrent viewers plus the cron cannot double-apply an
   edge, and a caller that loses the race returns early. Returns the post-tick
   status so the client can skip a refetch when nothing moved.
2. **`tick_battles()` — rewritten as a loop over `tick_battle()`**, so there is
   exactly one implementation of the state machine rather than two. Adds the
   missing `open`/`filling → ready` promotion. Matchmaking block preserved
   (minus four stale comments).
3. **`join_battle` — rewritten.** Promotes from `upcoming` as well as `open`;
   recounts participants *after* the insert; reads the promotion decision from
   a live variable rather than the entry-time snapshot. Also fixes two further
   defects — see "Additional defects" below.
4. **`finalize_battle` — `FOR UPDATE` + early return when already `completed`.**
   Body otherwise unchanged. This is what makes it safe for the cron and the
   Finalize button to coexist.

### Fix — application

- **`src/routes/api/public/hooks/battle-tick.ts` (new)** — mirrors
  `battle-settlement.ts` (`guardRoute` + `checkCronAuth` + `supabaseAdmin`),
  calls `tick_battles()`. Returns in-flight fleet counts by status in the
  response body so a job that runs but achieves nothing is visible in
  `net._http_response` without platform logs.
- **`tickBattle({ battleId })` server fn** replaces the dead `tickBattles`.
- **`battle-arena.$battleId.tsx`** polls it while pre-live: 2s in `countdown`,
  5s in `ready`, 30s otherwise. A one-minute cron cannot resolve the 10-second
  `countdown → live` edge; the cron is the backstop for battles nobody has open.
- **1v1 auto-start removed** from `joinBattle`. All battle types now go through
  the same sequence, so the first battle started after this lands actually
  exercises the state machine rather than the old bypass.

> **Testing note:** with the auto-start gone, a 1v1 no longer jumps to `live` on
> the second join. It reaches `ready` and waits for `start_at`, because
> `ready → countdown` requires `start_at <= now() + 30s`. Create test battles
> with a start time at or just after "now" or they will sit at `ready`.

### Statuses deliberately not handled

`draft`, `paused`, `failed` are unreachable — nothing in the application or any
migration writes them to `battles.status`; they exist only as enum labels and UI
strings (`src/lib/battle-arena/constants.ts:36-46`). They match no branch in
`tick_battle` and are excluded from `tick_battles`' candidate set, so each is an
explicit no-op. `cancelled` and `completed` are terminal by design.

**If a pause control is ever added, `paused` becomes reachable and turns into a
permanent stall** — a paused battle would never resume *and* never finalize past
its `end_at`, because finalization only runs from the `live` branch. Resume and
finalize handling must land in `tick_battle` in the same change.

---

## D — Buy/Sell in the live battle screen do nothing

### Root cause

`BattleStatusBar`'s Buy/Sell only call
`emitTradeIntent({ kind: "submit", … })`. That iterates a module-level `Set` of
listeners (`src/lib/trading/trade-intent.ts:14`); an empty set means the loop
body never runs — **a silent no-op**, with the per-listener `try/catch`
swallowing anything that might have surfaced.

The only `onTradeIntent` subscriber in the codebase is inside `OrderPanel`. And
`TradingWorkspace` replaced its entire right-hand tab panel with
`ArenaCommandRail` whenever the account belonged to a battle:

```jsx
{rightOpen ? (
  arenaData ? ( <ArenaCommandRail … /> )   // ← battle mode took this branch
             : ( <> … {activeTab === "order" && <OrderPanel compact />} … </> )
```

`arenaData` resolves truthy for any paper account linked to a
`battle_participants` row (`useActiveArena.ts:14-19`) — i.e. always, in a
battle. So `OrderPanel` never mounted, never subscribed, and the buttons emitted
into nothing.

The same branch removed the Positions tab, which is why nothing appeared there
either. Nothing was being dropped at the database layer — nothing was ever
submitted.

The branch was also redundant: the battle route already renders its own
`ArenaCommandRail` in a dedicated column, so battle mode had two of them.

### Fix

- **`TradingWorkspace.tsx`** — the `arenaData ?` swap is deleted; the tab panel
  always renders. `ArenaCommandRail` import removed (`arenaData` itself is still
  used at lines 821 and 1379).
- **`OrderPanel.tsx`** — stale-closure submit fixed. `setTimeout(() =>
  attemptPlace(), 0)` ran a closure captured when the subscription was created,
  so an intent-driven submit used the *previous* side and lot size. Replaced
  with a `submitRequest` counter bumped by the intent handler and an effect
  keyed on it calling `attemptPlaceRef.current()` — React commits
  `setSide`/`setOrderType`/`setLot` from the same batch before the effect runs.
- **`context.tsx`** — `PaperTradingProvider` is now idempotent. It checks
  `useContext(PaperCtx)` and renders children directly when a provider is
  already above it, delegating to an internal `PaperTradingRoot` otherwise. This
  fixes a duplicate-context bug: the battle route wraps the live workspace (so
  `BattleStatusBar`, which sits outside `TradingWorkspace`, can read the
  account), and `TradingWorkspace` wrapped again — so the status bar and
  `OrderPanel` held **separate account and symbol state**. The balance on screen
  was not the balance being traded.
- **`BattleOrderTicket.tsx` deleted.** Provably orphaned (imported, never
  rendered) and carrying the identical emit-into-void bug.

### Known regression

Below the `xl` breakpoint the live battle screen now has no arena rail — the
deleted swap was what covered narrow viewports. Net improvement (you previously
could not trade at all), but a real gap. Logged as **BA-2**.

---

## B — Duplicate realtime channels

**Implemented.** Was: four channel objects across three topics.

Four channel objects across three topics on the live battle screen:

| Topic | Created at | Listens on |
|---|---|---|
| `battle-detail-${id}` | `battle-arena.$battleId.tsx:104` | 6 tables |
| `battle-trades-${id}` | `battle-arena.$battleId.tsx:190` | `paper_trades` |
| `arena-rail-${id}` | `ArenaCommandRail.tsx:86` — **instance 1**, route column | 3 tables |
| `arena-rail-${id}` | `ArenaCommandRail.tsx:86` — **instance 2**, inside `TradingWorkspace` | same 3 |

The duplicate came from `ArenaCommandRail` being rendered twice — the same
`arenaData ?` branch that caused D. **Fixing D removes it.** `supabase-js`
(v2.110) does not dedupe by topic, so both instances subscribed on one socket;
`removeChannel` on either unmount tore down a topic the other still believed it
was on, and every change fired its invalidation twice.

The individual channels are already well-formed — all `.on()` before a single
`.subscribe()`, `removeChannel` in cleanup, correct deps. The remaining work is
consolidation, not restructuring.

### Two further realtime defects — both now fixed

1. **`battle-trades-${id}` could never fire.** It subscribed to `paper_trades`,
   which is **not in the `supabase_realtime` publication** — the battle bulk-add
   (`20260718082633_*.sql:434-445`) covered ten `battle_*` tables and omitted
   it. So `openByUser` and `lastTradeByUser` (open-position counts and
   last-trade times on the live leaderboard) populated once on mount and then
   went stale. A migration adds it — though see BA-4 for how far that gets.
2. **All four subscriptions were status-blind.** Every one called bare
   `.subscribe()` with no callback, so `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`
   were discarded. The repo already had `subscribeAndTrack`
   (`src/lib/observability/realtime-health.ts:48`) and no battle code used it.
   The one channel now subscribes through it.

### Fix — `src/hooks/use-battle-realtime.ts`

One `supabase.channel(\`battle:${id}\`)` owning eight `.on()` registrations —
the union of the three old topics, deduplicated (`battle_rankings` and
`battle_events` had been registered on two channels each) — all chained before a
single `subscribeAndTrack()`, with `removeChannel` in cleanup.

The three old effects are gone: `battle-arena.$battleId.tsx:99-132` and
`:194-236`, and `ArenaCommandRail.tsx:81-120`. The rail now owns no
subscription, which is what makes it safe to mount more than once — the
precondition for BA-2's fix.

Two things the consolidation picked up:

- **Lobby chat had no realtime at all.** `BattleChat` deliberately owns no
  channel (`BattleChat.tsx:36-37`) and relies on its parent to invalidate
  `["battle-chat", id]`. Only `arena-rail-*` did that, and the rail renders in
  the live branch only — so in the lobby, where chat is a first-class tab,
  messages appeared solely on refetch. It has no `refetchInterval` either, so
  the "poll as a fallback" the comment describes does not exist. `battle_chat`
  is now on the one channel, which covers both screens.
- **`paper_trades` is now in the realtime publication** —
  `20260807164500_paper_trades_realtime.sql`. Deliberately *without*
  `REPLICA IDENTITY FULL`, unlike the `battle_*` tables; the migration explains
  the WAL trade-off and why DELETE filtering does not matter here.

### The subscription this does not repair

`paper_trades` RLS is a single policy, `own trades` — `auth.uid() = user_id`
(`20260717065801_*.sql:70`), with nothing granting battle participants sight of
each other. Realtime enforces RLS, so **the newly-live `paper_trades` events
only ever concern the viewer's own trades**. The initial load has the same
ceiling and always did. Logged as BA-4; the leaderboard columns it feeds have
been blank for opponents since they were written, which is a product decision to
make, not a bug to quietly fix.

---

## A — Create battle "Failed to fetch"

**Open.** Root cause not established. What has been ruled out, definitively:

- **The wizard is wired, not stubbed.** `CreateBattleWizard.tsx:25` uses
  `useServerFn(createBattle)`; `:64` awaits it with every field mapped. The
  catch at `:92-96` surfaces `e?.message`, so **"Failed to fetch" is the raw
  `TypeError` from `fetch` itself**, not an application message.
- **RLS and GRANTs permit the insert.** `battles insert host` checks
  `host_id = auth.uid()`, which `createBattle` sets from the verified JWT `sub`.
  Readback passes via `battles read`. Grants present.
- **Schema is fine.** `battle_status` contains `open`/`upcoming` in the live DB;
  every column in the insert exists.
- **Dependencies deployed.** `join_battle` exists, and its error was discarded
  anyway (`battle-arena.functions.ts:223` — bare `await …rpc()`).
- **Error surfacing already works.** `start.ts:41` registers
  `errorGuardMiddleware` globally and `server-errors.ts:175-186` sanitises any
  throw into a readable message. **Every in-handler failure would already reach
  the client as a toast.**

That last point is the key: a readable message is what any in-handler failure
produces, so receiving a bare fetch `TypeError` means **no response was produced
at all**. Combined with `joinBattle`/`setParticipantReady` POSTs demonstrably
working, transport and auth are fine and the failure is specific to
`createBattle`.

### Leading hypothesis

**The handler succeeds and only the response fails to reach the browser.**
`createBattle` makes three sequential round-trips (`getClaims` → insert+select →
`join_battle`, which itself inserts a `paper_accounts` row and issues up to two
trigger-firing `UPDATE`s). That fits the several-second spin, the absence of a
sanitised message, and the fact that a fully-formed battle with participants was
created at 2026-08-07 06:49 UTC anyway.

### One observation settles it

After the "Failed to fetch" toast, reload the lobby. **Does the battle appear?**

- **Yes** → handler succeeds end-to-end, response lost in transit. Fix is
  `start.ts` response handling. Also means every retry creates another battle.
- **No** → nothing commits; fix moves into the handler.

### Secondary candidate

`start.ts:22-38` catches any throw lacking `statusCode` and returns
`renderErrorPage()` as `text/html` with status 500 — applied to
`requestMiddleware`, so server-fn RPC requests get it too. A server-fn client
handed HTML where it expects its own payload fails at the transport layer.
Making that content-negotiate (JSON for RPC paths, HTML for documents) is
correct regardless of which hypothesis wins.

### Proposed fix once confirmed

Replace the insert + `rpc("join_battle")` pair with a single `create_battle(…)`
`SECURITY DEFINER` RPC that inserts the battle and the host's participant row in
one transaction. Collapses three round-trips into one and fixes a real bug that
exists regardless: `battle-arena.functions.ts:220-224` commits the battle, then
fires `join_battle` and **ignores its error**, so a failed host-join leaves a
committed battle with zero participants and nothing reported.

---

## Additional defects found

### Fixed as part of C

- **Private battles were never joinable — by anyone, including the host.** The
  old visibility gate was "if private AND not already a participant → raise".
  Nobody is a participant before joining, so it rejected everyone.
  `createBattle` → `rpc("join_battle")` on a private battle *always* threw, and
  that error is discarded — so **every private battle ever created was orphaned
  at creation, silently**. The same path broke invite codes:
  `join_battle_by_code` validated the code then delegated to `join_battle`,
  which rejected the redeemer. Present since the first migration
  (`20260718081017_*.sql:467`).
  *Fix:* `join_battle` gains a defaulted `_invite_ok boolean`; the host is
  always admitted to their own battle; `join_battle_by_code` passes `true` after
  validating the code. Dropped and recreated because adding a defaulted
  parameter via `CREATE OR REPLACE` would make 1-arg calls ambiguous.
- **Re-joining leaked a paper account.** The old `join_battle` created a
  `paper_accounts` row *before* `ON CONFLICT` swallowed the duplicate
  participant, so every repeat call left an orphaned account. Now returns early
  if already a participant.

### Cross-cutting: every scheduled cron job has been failing

All five pg_cron jobs send `"apikey": "sb_publishable_…"`. `checkCronAuth` reads
only `x-cron-secret` or `Authorization: Bearer …` (`src/lib/cron-guard.ts:31-32`).
`apikey` is never read, so `provided` is always empty and there are two possible
outcomes:

- `CRON_SECRET` unset → **503 "Not configured"** (`:29`), before any comparison.
- `CRON_SECRET` set → **401 Unauthorized** (`:35`).

Neither branch can succeed. This affects `battle-settlement-every-minute`,
`email-queue-process`, `email-weekly-report`, `email-monthly-report`, and
`email-reengagement` — **transactional email has almost certainly been down as
long as battle settlement has.** The email jobs are outside this branch's scope;
logged as **BA-3**.

Confirm with:

```sql
select id, status_code, timed_out, error_msg, created
  from net._http_response order by created desc limit 30;
```

Note `cron.job_run_details` will show *success* regardless — pg_net succeeds at
the SQL level once it dispatches; the HTTP status lands in `net._http_response`.
That gap is part of why this went unnoticed for weeks.

### Left unfixed

- **BA-1** — matchmaking creates battles with no participants (standing orphan
  source; confounds future diagnosis).
- **BA-2** — no arena rail below `xl`.
- **BA-3** — cron auth header mismatch across all five jobs (the four email jobs
  are now in scope; see the runbook).

### Also fixed

- **Presence never recorded participants.** The battle route sent
  `role: "competitor"`, but the zod enum at
  `battle-arena-live.functions.ts:139` is `["spectator","participant","host"]`.
  Every participant heartbeat failed validation and was swallowed by the
  `.catch(() => {})` on the heartbeat call, so the "N ONLINE" indicator only
  ever counted spectators and hosts. Now sends `"participant"`.

---

## Files changed

C and D (`35e00a33`):

```
 D src/components/battle-arena/BattleOrderTicket.tsx
 M src/components/paper-trading/OrderPanel.tsx
 M src/components/paper-trading/context.tsx
 M src/components/trading/TradingWorkspace.tsx
 M src/lib/battle-arena.functions.ts
 M src/lib/battle-arena/README.md
 M src/routeTree.gen.ts
 M src/routes/_authenticated/battle-arena.$battleId.tsx
 ?? docs/battle-arena-fixes.md
 ?? docs/known-issues.md
 ?? src/routes/api/public/hooks/battle-tick.ts
 ?? supabase/migrations/20260807102317_battle_arena_state_machine.sql
```

B:

```
 M src/components/battle-arena/ArenaCommandRail.tsx
 M src/routes/_authenticated/battle-arena.$battleId.tsx
 ?? src/hooks/use-battle-realtime.ts
 ?? supabase/migrations/20260807164500_paper_trades_realtime.sql
```

`src/lib/battle-arena/README.md` was rewritten — it documented a `battle_trades`
table that does not exist, `battles` columns that do not exist (`symbol`,
`timeframe`, `prize`), chat as a broadcast channel (it is table-based), and made
no mention of the status lifecycle at all. Plausibly why a state machine with no
caller survived this long.

---

## Apply runbook

Ordered. Steps 2 and 3 must both happen or `battle-tick` fails exactly the way
`battle-settlement` has been failing.

1. ~~**Apply both migrations**~~ — **done 2026-08-07.**
   `20260807102317_battle_arena_state_machine.sql` and
   `20260807164500_paper_trades_realtime.sql`. Both schema-only; neither
   schedules anything.
2. **Set `CRON_SECRET`** in the server environment. Random value. **No `VITE_`
   prefix** — that would compile it into the client bundle and make every
   `/api/public/hooks/*` endpoint world-callable. Do not reuse the publishable
   key.
3. ~~**Deploy**~~ — **done 2026-08-07**, so `/api/public/hooks/battle-tick`
   exists. Note it has never returned 200 to a caller: the endpoint is live but
   no cron job authenticates against it yet. Step 5 is the first real test.
4. **Swap the cron jobs:**

```sql
select cron.unschedule('battle-settlement-every-minute');

select cron.schedule(
  'battle-tick-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://project--237f7325-035a-4d38-a67f-36c64e02b573.lovable.app/api/public/hooks/battle-tick',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

   Settlement must be unscheduled: `tick_battles()` finalizes every live battle
   past its `end_at`, so leaving it running points a second finalizer at the same
   rows. The `FOR UPDATE` guard makes that survivable, not correct.

5. **Verify** the job is authenticating:

```sql
select id, status_code, error_msg, created
  from net._http_response order by created desc limit 10;
```

   Expect `200`. A `503`/`401` means step 2 or the header is wrong.

   **Do this before touching the email jobs.** `battle-tick` is the lowest-risk
   consumer of the new secret — it is idempotent and touches nothing
   user-facing. Prove the mechanism on it first; only then reschedule the other
   four.

6. **Triage the email backlog — BEFORE rescheduling `email-queue-process`.**

   `processQueueBatch(50)` selects `status = 'pending' AND scheduled_for <= now()`
   ordered oldest-first, with no staleness filter
   (`src/lib/email/service.server.ts:302-309`). The first authenticated run
   starts flushing **the entire outage backlog at 50/minute — 3,000/hour**,
   oldest first. Those are weeks-old transactional emails: battle-starting
   notices for battles that never started, reports for windows long past.
   Sending them is worse than not sending them, and the volume spike risks
   provider rate limits and spam classification.

```sql
-- How bad is it?
select status, count(*), min(scheduled_for), max(scheduled_for)
  from public.email_queue group by status order by count(*) desc;
```

```sql
-- Then decide. Example: drop anything that was due more than 48h ago.
update public.email_queue
   set status = 'cancelled'
 where status = 'pending' and scheduled_for < now() - interval '48 hours';
```

   `email-reengagement` needs no triage — it buckets on narrow
   `last_active_at` windows evaluated at run time
   (`email-reengagement.ts:13-18`), so it has no backlog and simply resumes.
   The weekly/monthly reports compute at send time and are likewise safe.

7. **Reschedule the four email jobs** with the same `x-cron-secret` header,
   replacing `apikey`. Same secret, same header shape as step 4. See BA-3 in
   `known-issues.md` for the job/schedule table.

8. ~~**Create a test battle**~~ — **done 2026-08-07**, all three of B, C and D
   confirmed by hand. See [Verification](#verification-performed).
9. ~~**Test D**~~ — done, four trades with `battle_id` correctly derived.
10. ~~**Verify B**~~ — done.
11. **Answer A's lobby-reload question** and fix accordingly. Still open.

### Cleanup already performed

All 17 pre-existing battles were cancelled or completed before apply (15
cancelled, 2 completed), so nothing can cascade to `completed` and award
XP/coins/ELO for battles nobody played. One `live` battle had corrupt dates
(`end_at` 2026-07-29 before `start_at` 2026-08-06) and was cancelled.

---

## Verification performed

### Observed on a real battle — 2026-08-07

Two browser contexts, two accounts, one 1v1. **First time the real sequence has
ever run.**

- **C.** Walked `filling → ready → countdown → live`. `countdown_started_at`
  14:14:41, `start_at` 14:15:00, ending at `status = live`. The 10-second
  countdown gate held.
- **B.** The second account loads the battle page. (The failure that looked like
  a surviving channel collision was a stale published bundle — see below.)
- **D.** Four battle trades written, BTC/USDT and XRP/USDT, `direction = long`,
  `status = open`, **every one with `trade_battle_id = account_battle_id`, both
  non-null**. A pre-fix trade from 2026-08-06 has both null, which is the
  contrast that confirms the trigger path rather than just the insert.

### The stale-bundle episode — worth reading before debugging this again

Hours went into chasing a thrown error naming a channel topic
`battle-chat-<id>`, on the reasonable assumption it was a channel the
consolidation had missed. It was not: `BattleChat` owned that topic until
`7b857bf7` deleted it, three commits *before* this work started. The browser was
executing a bundle older than that commit.

What made it convincing was a genuine asymmetry — **the server-side fix was
live while the client bundle was stale.** `listBattles` is a server function, so
its behaviour changed the instant the server deployed, which read as proof the
whole deploy was current. It was not.

**Check the chunk hash before trusting any client-side observation.** The stack
named `TradingWorkspace-BO9PIZ5z.js`; a local build of the deployed commit
produced `TradingWorkspace-Chj9WC3A.js`. Different hash, different code, and
that comparison settles it in one step.

### Static

- `tsc --noEmit` — clean.
- Full production build via `bun node_modules/vite/bin/vite.js build` — passes,
  and regenerates `routeTree.gen.ts` with the new route.
  **Local Node is 18.16.1; Vite needs 20.19+, so `npm run build` cannot work on
  this machine.** Use bun, or upgrade Node.
- ESLint — no new errors beyond the repo's pre-existing CRLF and
  `no-explicit-any` noise (baseline: 149 errors on an untouched file).
- Pre-flight schema checks against the live database: `tick_battle` absent (no
  silent overwrite), `join_battle` single-signature (drop/recreate is
  unambiguous), `battle_participants` has `UNIQUE (battle_id, user_id)` (the
  `ON CONFLICT` target resolves), all 16 `battles` columns, all `elo_history`
  and `profiles` columns, both enums complete.
- The `tick_battles` → `join_battle` caller alarm was a **false positive** in the
  detection query: `pg_proc.prosrc` includes comments, and both matches are
  comment lines (`-- open -> filling (when joined handled in join_battle)` and
  `-- We need to mock auth context for public.join_battle …`). There is no call.
  Independently, statement order makes it moot — `tick_battles` is replaced at
  line 132 before `join_battle` is dropped at line 198, and the replacement
  contains no reference of any kind.

**The SQL itself is unexecuted.** There is no local Postgres; it is reviewed and
pre-flight-checked, not run.
