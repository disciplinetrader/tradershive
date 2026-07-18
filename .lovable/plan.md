# Battle Arena Foundation

Build a competitive paper-trading module reusing existing Paper Trading, Market Data Engine, XP, Notifications, and Admin systems.

## 1. Database (single migration)

New tables in `public.` (all with GRANTs + RLS + `updated_at` trigger where relevant):

- **battle_templates** — reusable rule presets (admin + user).
  `id, owner_id, name, description, battle_type, market, allowed_symbols[], starting_balance, max_risk_pct, max_daily_loss_pct, max_drawdown_pct, max_trades, win_condition, duration_minutes, is_public, is_official, created_at, updated_at`
- **battles** — one row per battle.
  `id, host_id, name, description, visibility ('public'|'private'), invite_code, battle_type ('1v1'|'2v2'|'ffa5'|'ffa10'), market, allowed_symbols[], starting_balance, max_risk_pct, max_daily_loss_pct, max_drawdown_pct, max_trades, win_condition, target_value (nullable, for +5R or profit target), start_at, end_at, timezone, status ('draft'|'upcoming'|'live'|'completed'|'cancelled'), max_participants, featured boolean, winner_user_id nullable, created_at, updated_at`
- **battle_participants** — join table.
  `id, battle_id, user_id, team ('A'|'B'|null), paper_account_id (auto-provisioned battle account), joined_at, left_at, status ('joined'|'active'|'disqualified'|'finished'), UNIQUE(battle_id, user_id)`
- **battle_rankings** — live snapshot; recomputed on trade close & on demand.
  `id, battle_id, user_id, rank, pnl, r_multiple, win_rate, trades_count, max_drawdown, score, updated_at, UNIQUE(battle_id, user_id)`
- **battle_results** — final immutable outcome.
  `id, battle_id, user_id, final_rank, pnl, r_multiple, win_rate, trades_count, max_drawdown, xp_awarded, coins_awarded, created_at, UNIQUE(battle_id, user_id)`
- **battle_logs** — rule violations & lifecycle events.
  `id, battle_id, user_id nullable, event_type, message, metadata jsonb, created_at`
- **battle_notifications** — per-user battle notifications.
  `id, battle_id, user_id, kind, title, body, read_at, created_at`

Extend `public.paper_trades` semantics without altering: add nullable `battle_id uuid references battles(id)` column to `paper_trades` and `paper_accounts`. Trades placed under a battle-scoped account are tagged and validated by trigger.

**Trigger `enforce_battle_rules_on_trade`** (BEFORE INSERT on paper_trades): if `battle_id` set → check symbol allowlist, risk %, trading window, battle status. On violation → log to `battle_logs` and RAISE.

**Trigger `update_battle_ranking_on_close`** (AFTER UPDATE of status on paper_trades where new.status='closed' and battle_id not null): recompute rankings for that battle+user; upsert `battle_rankings`.

**Function `finalize_battle(_battle_id)`**: sets status='completed', ranks participants by win_condition, writes `battle_results`, awards XP (100 winner / 25 finish) and coins via `xp_transactions` + `coin_transactions`, sets `winner_user_id`.

**Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE battles, battle_participants, battle_rankings, battle_notifications;`

RLS:
- battles: anyone reads public+upcoming/live/completed; hosts read own drafts; private battles require participant membership OR invite lookup by code (SECURITY DEFINER `join_battle_by_code`).
- battle_participants/rankings/results: readable if user is participant OR battle is public.
- write access via SECURITY DEFINER server functions only.

## 2. Server functions (`src/lib/battle-arena.functions.ts`)

All under `requireSupabaseAuth`:
- `listBattles({ scope: 'featured'|'live'|'upcoming'|'mine'|'history', limit })`
- `getBattle({ id })` → battle + participants + rankings + rules
- `createBattle({ ...form })` — validates, generates invite_code for private
- `joinBattle({ battleId })` / `joinByInviteCode({ code })` — auto-provisions battle-scoped paper account (starting balance from rules)
- `leaveBattle({ battleId })` (only pre-start)
- `cancelBattle({ battleId })` (host only, pre-start)
- `startBattleNow({ battleId })` (host, if start_at ≤ now)
- `finalizeBattle({ battleId })` — RPC wrapper
- `listMyBattleStats()` — wins/losses/avg finish
- `getBattleHistory({ battleId })` — results + trade list + equity curve
- Admin variants under `src/lib/admin/battles.functions.ts` (feature/delete/edit any)

Client-side background: an interval in Arena home calls a lightweight `tickBattles()` server fn that transitions `upcoming→live` and `live→completed` (calls `finalize_battle`). Also triggerable by pg cron later.

## 3. Routes

Replace stub `src/routes/_authenticated/battle-arena.tsx` (currently ComingSoon) with a layout + children:
- `battle-arena.tsx` → tabs layout with `<Outlet/>`
- `battle-arena.index.tsx` → Arena home dashboard
- `battle-arena.create.tsx` → Create wizard (5 steps: basics → market/symbols → risk → schedule → review)
- `battle-arena.history.tsx` → completed battles list + personal stats
- `battle-arena.$battleId.tsx` → battle detail (lobby / live / results based on status)

Unhide "Battle Arena" in `src/components/layout/app-shell.tsx` navigation.

## 4. Components (`src/components/battle-arena/`)

- `ArenaHero.tsx` — featured battle carousel
- `BattleCard.tsx` — used in lists
- `BattleStatusBadge.tsx`
- `CountdownTimer.tsx`
- `LiveLeaderboard.tsx` — realtime subscription to `battle_rankings`
- `ParticipantsList.tsx`
- `RulesPanel.tsx`
- `CreateBattleWizard.tsx`
- `JoinBattleDialog.tsx` (invite code)
- `MyBattleStats.tsx`
- `BattleResultsView.tsx` — podium + trades + equity curve (reuse Recharts)
- `BattleTradeGate.tsx` — small wrapper for the trading workspace when trading inside a battle account

## 5. Integration points (minimal, no behavior change to existing modules)

- **Paper Trading context**: when active `paper_account.battle_id` is set, show a `BattleBadge` in `TopToolbar` and pass `battle_id` through to `paper_trades` insert (already inherits from account default via trigger `set_trade_battle_id_from_account`).
- **Statistics/Journal**: no changes — battle trades are regular paper trades tagged by `battle_id`; journal already links via `create_journal_draft_from_trade`.
- **XP**: reuse `xp_transactions` insert on `finalize_battle`.
- **Leaderboards / Social**: not modified — future work.
- **Notifications**: use existing `notification_recipients` pipeline where possible; battle-specific stream stays in `battle_notifications` for the widget.
- **Admin Panel**: new tab under `/admin` for Battles (list, feature, cancel, delete). Uses `is_platform_admin`.

## 6. Realtime UX

- Battle detail page subscribes to `battle_rankings` + `battle_participants` filtered by `battle_id`.
- Arena home subscribes to `battles` (status changes).
- Cleanup channels on unmount.

## 7. Out of scope (explicitly)

Guild wars, tournaments, brackets, prize pools, real money, broker integrations, seasons.

## 8. Delivery order

1. Migration (one call).
2. Server functions + admin server functions.
3. Routes + components.
4. Nav unhide + small `TopToolbar` battle badge.
5. Typecheck; smoke via Playwright on `/battle-arena`.
