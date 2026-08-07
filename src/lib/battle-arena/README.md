# Battle Arena

Live PvP trading battles with a realtime scoreboard.

## Server functions

- `battle-arena.functions.ts` — battle lifecycle (create, join, leave, cancel,
  finalize), matchmaking queue, per-battle state ticking, stats, templates.
- `battle-arena-live.functions.ts` — chat, activity events, live statistics,
  and presence for an in-progress battle. These are ordinary server functions
  reading tables; they do not broadcast.
- `ranking.functions.ts` — leaderboard queries (global, friends, country,
  league).

## UI

`src/components/battle-arena/` — `CreateBattleWizard`, `ArenaCommandRail`
(the in-battle side panel: leaderboard, chat, participants, rules, activity),
`LiveScoreboard` and `LiveLeaderboard` (with rank-change animations),
`BattleChat`, `BattleStatusBar` (order controls + P&L during a live battle),
`LiveBattleHeader`.

The live battle screen is `src/routes/_authenticated/battle-arena.$battleId.tsx`,
which mounts `TradingWorkspace` for the actual trading surface.

## Data model

- `battles` — battle configuration: `battle_type`, `market`, `allowed_symbols`
  (array), `win_condition`, `starting_balance`, risk limits, `start_at` /
  `end_at`, `min_participants` / `max_participants`, `visibility`,
  `invite_code`, `ranked`, `status`. There is no single `symbol`, `timeframe`,
  or `prize` column.
- `battle_participants` — join records. Links each competitor to the
  `paper_accounts` row created for them on join (`paper_account_id`); the
  starting balance lives on that account, not here.
- `battle_rankings` — live leaderboard rows (`pnl`, `r_multiple`, `win_rate`,
  `trades_count`, `max_drawdown`, `score`, `rank`), recomputed as trades close.
- `battle_results` — frozen final standings written by `finalize_battle`,
  plus `xp_awarded` / `coins_awarded`.
- `elo_history` — per-battle ELO deltas for ranked battles.

### Where battle trades live

**In `paper_trades`, not a separate table.** A battle trade is an ordinary
paper trade carrying a non-null `battle_id`.

Nothing in the application sets that column — `openTrade` doesn't accept it and
`openTradeSchema` has no such field. It is populated by a `BEFORE INSERT`
trigger, `trg_set_trade_battle_id`, which copies `battle_id` from the trade's
`paper_accounts` row. Because `join_battle` creates that account with the
battle's id attached, every trade placed on a battle account is tagged
automatically.

A second trigger, `trg_recompute_battle_ranking`, calls
`recompute_battle_ranking(battle_id, user_id)` whenever a battle trade is
inserted closed or transitions to closed.

## Status lifecycle

`draft → upcoming → open → filling → ready → countdown → live → completed`
(plus `cancelled`, `paused`, `failed`).

Transitions are owned entirely by the database:

- `join_battle()` promotes `upcoming`/`open` → `filling`, and → `ready` once
  participant count reaches `min_participants`.
- `tick_battle(battle_id)` advances one battle through the remaining edges.
  Every transition is gated on a timestamp *and* asserts the expected status in
  its `WHERE` clause, so it is idempotent and safe to call concurrently.
- `tick_battles()` loops `tick_battle` over every in-flight battle and also
  processes the matchmaking queue. It runs from pg_cron as the `battle-tick`
  job, every minute.
- `finalize_battle()` freezes results, awards XP/coins/ELO, and flips to
  `completed`. It takes a row lock and returns early if already completed —
  its writes are increments and are not repeat-safe.

The one-minute cron cannot resolve the 10-second `countdown → live` edge, so
the battle detail route also calls `tick_battle` on a short poll while a battle
it is displaying is pre-live. The cron is the backstop for battles nobody has
open.

No application code should write `battles.status` directly.

## Realtime

Battle tables in the `supabase_realtime` publication: `battles`,
`battle_participants`, `battle_rankings`, `battle_results`, `battle_events`,
`battle_activity`, `battle_chat`, `battle_presence`,
`battle_statistics_live`, `battle_notifications`.

Subscriptions use `postgres_changes` filtered on `battle_id`, and invalidate
React Query keys — not broadcast channels, and not client-side row diffing.

Note `paper_trades` is **not** in the publication, so open-position counts on
the live leaderboard do not update via realtime today.

## Known issues

See `docs/known-issues.md` (BA-1 matchmaking orphans, BA-2 sub-`xl` arena rail).
