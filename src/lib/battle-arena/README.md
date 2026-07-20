# Battle Arena

Live PvP trading battles with a realtime scoreboard.

## Server functions

- `battle-arena.functions.ts` — battle lifecycle (create, join, cancel,
  settle), participant management, rankings.
- `battle-arena-live.functions.ts` — live scoring updates broadcast via
  Supabase Realtime; consumed by the `LiveScoreboard` component.

## UI

`src/components/battle-arena/` — `CreateBattleWizard`, `LiveScoreboard`
(with rank-change animations), `BattleChat` (realtime channel).

## Data model

- `battles` — battle metadata (symbol, timeframe, entry rules,
  start/end, prize).
- `battle_participants` — join records + starting balance snapshot.
- `battle_trades` — trades placed inside the battle sandbox.
- `battle_rankings` — computed leaderboard rows updated as trades close.

## Realtime

The scoreboard subscribes to `battle_rankings:battle_id=eq.<id>` and
diffs incoming rows client-side to animate rank changes. Chat uses a
plain Supabase Realtime broadcast channel.
