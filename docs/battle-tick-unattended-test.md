# Unattended battle-start test (EC-7)

The one observation that matters, and the one nothing in this project has ever
made: **does a battle nobody is watching start on its own?**

Every battle verified by hand since 2026-08-07 was verified with the page open,
and an open page polls `tick_battle(uuid)` itself. That poll is indistinguishable
from a working cron until you close the tab. This protocol closes the tab.

---

## Before the swap — capture the free before-state

Run this **before** `docs/migrations/battle-tick-schedule.sql` step 1. It costs
nothing, and the evidence disappears the moment the swap lands.

```sql
select status, count(*) as n,
       min(start_at) as earliest_start,
       count(*) filter (where start_at < now()) as past_start
  from public.battles
 where status in ('upcoming','open','filling','ready','countdown')
 group by status
 order by n desc;
```

**Prediction:** a non-zero `past_start` in `upcoming` or `open` — battles whose
scheduled start has passed and which never advanced. That is the defect in
historical data. If `past_start` is 0 everywhere, say so before continuing: it
would mean something has been promoting battles that the code search did not
find, and the premise for EC-7 is wrong.

---

## The test

`min_participants` is validated `.min(2)` in `battle-arena.functions.ts:179`, so
**a battle cannot start with one participant.** The host auto-joins on create,
giving exactly one. A solo battle stalling at `open` is correct behaviour and
would look exactly like a failed fix — this is the prediction most likely to be
misread.

Only `E2E_HOST_*` exists in `.env.e2e.local`; there is no joiner account. So
seed the second participant directly rather than logging in twice:

**1 · Create through the UI** (the real entry point), signed in as the host:
start time **5 minutes out**, duration 30 minutes or more so it cannot settle
mid-test. Note the battle id.

**2 · Add the second participant** by SQL. A direct insert rather than
`join_battle` is deliberate: `join_battle` promotes to `filling`/`ready` itself,
which would do part of the work under test and blur what the cron proved.

```sql
insert into public.battle_participants (battle_id, user_id, status)
select '<BATTLE_ID>', id, 'joined'
  from auth.users
 where email = '<any second account>'
 limit 1;
```

**3 · Close every tab.** Every browser, every device. One open battle page
invalidates the whole test — that is the failure mode this exists to rule out.

**4 · Walk away.** Come back at `start_at + 3 minutes`.

---

## Predicted timeline, stated before the run

From the gates in `tick_battle` (`20260807102317_*.sql:55-123`), with the cron
at `* * * * *`:

| When | Status | Gate that fires it |
|---|---|---|
| within 60s of step 2 | `upcoming` → `open` → **`ready`** | `start_at <= now() + 1 hour`, then participants ≥ 2 — both in one tick |
| the tick covering `start_at − 30s` | **`countdown`** | `start_at <= now() + 30 seconds` |
| the **next** tick | **`live`** | `countdown_started_at <= now() − 10 seconds` |

**So `live` lands between `start_at` and `start_at + 60s`, never exactly at
`start_at`.** The `countdown → live` edge cannot fire in the same call that
started the countdown — it is gated on purpose. A battle sitting at `countdown`
for up to a minute is the design, not a stall.

Confirm with the status and — more informatively — the cron's own view:

```sql
select id, status, start_at, updated_at from public.battles where id = '<BATTLE_ID>';

select left(content, 200) as body, created
  from net._http_response
 where created > now() - interval '10 minutes'
 order by created desc limit 10;
```

`battle-tick` reports `in_flight` counts in its body, so the battle should be
visible moving between buckets across consecutive fires — the promotion
observed from the server's side, not just its end state.

**Reading a failure:** stuck at `ready` past `start_at` means the countdown gate
never fired; stuck at `countdown` for more than two minutes means the second
tick is not landing. Stuck at `upcoming` means the cron is not running at all —
check `net._http_response` before touching the state machine.

---

## Disposal

Delete before `end_at`. `finalize_battle` writes ELO, XP, coins and
notifications to real user rows, and a test battle must not.

```sql
delete from public.battles where id = '<BATTLE_ID>';
```

`battle_participants.battle_id` is `ON DELETE CASCADE`
(`20260718081017_*.sql:124`), so the participants go with it. Verify the row
count is back to what it was — a test that leaves residue is a test that
poisons the next one.
