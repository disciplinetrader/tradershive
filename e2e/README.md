# E2E — battle arena core loop

Covers `create → join → live → trade` across two authenticated browser
contexts. This is the flow that was verified by hand on 2026-08-07 and spans
four independently-broken things: the status state machine, lobby visibility,
battle paper-account selection, and the trade path.

## Read this before the first run

**These tests write to a real Supabase project.** There is one project
(`supabase/config.toml`), so unless you point them somewhere else the suite
creates real battles, real paper accounts and real trades against production
data.

Each run creates one battle named `E2E loop <timestamp>` and cancels it in
`afterAll`. Trades are left in place — they belong to a cancelled battle and are
harmless, but they do accumulate. A crashed run can leave a live battle behind;
cancel it by hand:

```sql
update public.battles set status = 'cancelled'
 where name like 'E2E loop %' and status not in ('completed','cancelled');
```

Note the two test accounts need to be real users that can log in, and their
trades count toward their own stats.

## Setup

```bash
npm install
npx playwright install chromium
```

Environment — `.env` already supplies the first two:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `E2E_HOST_EMAIL` / `E2E_HOST_PASSWORD` | account that creates the battle |
| `E2E_JOINER_EMAIL` / `E2E_JOINER_PASSWORD` | account that joins it |
| `E2E_BASE_URL` | optional; omit to run against a local `npm run dev` |

The two accounts **must be different users**. `join_battle` is idempotent per
user, so one account joining twice never reaches `min_participants` and the
battle never leaves `filling`. Global setup fails loudly if both resolve to the
same id.

## Running

```bash
npx playwright test                     # local dev server
E2E_BASE_URL=https://<preview> npx playwright test
npx playwright test --headed            # watch it happen
npx playwright show-report
```

## Why it is slow

A run takes roughly two minutes, most of it waiting. That is inherent:

- `ready → countdown` fires only when `start_at <= now + 30s`
- `countdown → live` cannot fire in the tick that started the countdown, then
  waits a further 10s
- `enforce_battle_rules_on_trade` rejects any trade whose battle is not `live`

The spec sets `start_at` to 50 seconds out — enough to observe `filling → ready`
rather than skipping straight past it.

Calling `tick_battle` directly would make this fast and would skip exactly the
sequencing that was broken. Don't.

## Auth

`global-setup.ts` signs both users in with supabase-js and writes a Playwright
`storageState` per user. The app keeps its session in `localStorage`
(`integrations/supabase/client.ts`), not cookies, so the state file carries
localStorage entries.

Rather than hardcoding supabase-js's storage key and encoding — both have
changed across v2 minors — the setup hands the client an in-memory storage
adapter and records whatever it writes. Whatever the library persists is what
the browser gets.

**`.auth/` holds live access tokens.** It is gitignored. Don't upload it as a CI
artifact.

## What each assertion protects

| Step | Regression it guards |
|---|---|
| battle name visible in All Battles to the joiner | `c5ef0083` — joined/private battles were absent from every lobby scope, so a second player could not find a match |
| participant count reaches 2 | `join_battle` actually inserting, which `open/filling → ready` depends on |
| `battle-live` badge in **both** contexts | `35e00a33` — the state machine had no caller and battles never left `filling` |
| trade placed as the **joiner** | `2bfaf57f` — the joining player landed on a personal account. As the host this passes even with the bug present |
| `trade.battle_id` and `account.battle_id` both equal the battle | `battle_id` is set by a `BEFORE INSERT` trigger from `paper_accounts.battle_id`, so a trade on the wrong account is written silently with `battle_id NULL` and no error |

## Not covered

- The cron path (`battle-tick`). The spec keeps a page open, so transitions come
  from the route's own tick poll. Battles that nobody is watching are a
  different mechanism and need `CRON_SECRET` — see `docs/battle-arena-fixes.md`.
- `live → completed` settlement, which needs a battle to reach its `end_at`.
- Opponent-visible leaderboard counts — blocked on BA-4.
