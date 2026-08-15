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
bun install                      # never npm - it swaps rolldown-vite for stock vite
bunx playwright install chromium # one-off, downloads the browser binary
```

### Credentials

> **`.env` is tracked by git.** Never put account passwords in it — they would
> be committed and pushed. Put them in **`.env.e2e.local`**, which is
> gitignored, or export them in your shell.

`.env` already supplies the Supabase connection:

| Variable | Where it lives |
|---|---|
| `VITE_SUPABASE_URL` | `.env` (tracked, already set) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` (tracked, already set) |
| `E2E_HOST_EMAIL` / `E2E_HOST_PASSWORD` | **`.env.e2e.local`** — creates the battle |
| `E2E_JOINER_EMAIL` / `E2E_JOINER_PASSWORD` | **`.env.e2e.local`** — joins it |
| `E2E_BASE_URL` | optional; omit to run against a local `bun run dev` |

```bash
cat > .env.e2e.local <<'EOF'
E2E_HOST_EMAIL=host@example.com
E2E_HOST_PASSWORD=...
E2E_JOINER_EMAIL=joiner@example.com
E2E_JOINER_PASSWORD=...
EOF
```

The local dev server runs on **port 8080** (`@lovable.dev/vite-tanstack-config`
forces it), which is what `baseURL` defaults to.

The two accounts **must be different users**. `join_battle` is idempotent per
user, so one account joining twice never reaches `min_participants` and the
battle never leaves `filling`. Global setup fails loudly if both resolve to the
same id.

## Running

```bash
bun run test:e2e                              # starts bun run dev on :8080 for you
bun run test:e2e:headed                       # watch it happen - recommended first run
E2E_BASE_URL=https://<preview> bun run test:e2e
bun run test:e2e:report                       # open the HTML report after a failure
```

## The UI suite runs on its own account

`playwright.ui.config.ts` (`bun run test:e2e:ui`) drives the trading workspace
against a paper account that `e2e/ui/global-setup.ts` creates for the run,
named `E2E UI RUN <timestamp>`, and that `global-teardown.ts` deletes
afterwards. A crashed run's account is swept by the next run's setup.

This is not tidiness. `TradingWorkspace` mounts `useSlTpMonitor`, which
evaluates **every** open trade on the selected account against the live feed
and closes the ones whose stop or target is crossed. Pointed at an account with
real positions on it, the suite closes them for real — that is how a run
realized $151.82 of open trades that nobody asked to close.

So: the suite never selects an account by name or by "first row that matched",
never opens a position it does not delete, and `assertNoInheritedPositions`
refuses to start if the account holds anything older than the run. If you need
the suite to exercise a position, create one with `createTestPosition` and let
its disposer remove it.

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
