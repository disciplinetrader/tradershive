# Replay Studio Pro Upgrade

Non-destructive enhancement layer. Existing engine, DB tables, market data and playback loop stay intact. New behavior is layered on top.

## 1. High-Speed Playback (32x / 64x / 128x)

`src/lib/replay/constants.ts`
- Extend `SPEEDS` to `[0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128]`.

`src/components/replay/context.tsx` (playback loop)
- Replace the "one candle per tick" advance with a **batched** advance: each rAF tick advances `Math.max(1, Math.round(speed / 8))` candles at speeds >16x, with a minimum tick interval clamp (`~16ms`) so we stay at 60fps and never emit >~128 candles/sec.
- Guard SL/TP auto-close loop to iterate the skipped candle range (walk `[prevIdx+1 .. cursorIdx]` instead of only the current candle) so hits are not lost during batched jumps.

## 2. Smart Navigation Engine

New helper `src/lib/replay/navigation.ts` — pure functions over `candles[]`, `session`, `bookmarks`, `trades`, `checkpoints`:
- `nextSession / prevSession` (uses `inferSession` from `src/lib/statistics/session.ts`)
- `jumpToSessionOpen('london' | 'new_york' | 'asia')`, `jumpToSessionClose`
- `nextBookmark / prevBookmark`, `nextTrade / prevTrade`, `tradeEntry / tradeExit`
- `nextObjective / prevObjective` (over checklist unchecked items mapped to timestamps)
- `nextDay / prevDay`

Wired through new context methods `jumpTo(target)` that set `cursorIdx` instantly without touching `playing`.

## 3. Fast Forward Until Event

Context adds `fastForwardUntil(event)` where `event ∈ next_order_trigger | next_pending_order | next_sl | next_tp | next_bookmark | next_session | next_day`.
- Runs synchronously through `candles[cursorIdx+1..]` computing pending-order triggers and SL/TP hits, stops at first match, sets `cursorIdx`, auto-pauses.
- Uses the same trigger math as (4) so behavior is consistent.

## 4. Pending Order Simulation (Buy/Sell Limit & Stop)

`ReplayTrade` already stores `order_type` ("market" | "limit" | "stop") + `direction`. We add trigger detection while advancing:
- Long Limit: candle.low ≤ entry
- Long Stop: candle.high ≥ entry
- Short Limit: candle.high ≥ entry
- Short Stop: candle.low ≤ entry

On trigger: server fn call to mark the trade `status: 'open'` with `opened_at = candle.time` (extends `updateReplayTradeTrigger` in `src/lib/replay.functions.ts`). We record timeline events (Order Created on insert, Order Triggered on fill, Order Cancelled on delete) via reusing existing `replay_events` table.

`TradePanel.tsx` gains a Pending toggle with entry-price input + order type; when replay is paused, users can place a Buy Limit @ price etc.

## 5. Replay Checkpoints

New table `replay_checkpoints` (migration):
```
id uuid pk, session_id uuid fk, user_id uuid, label text, checkpoint_ts timestamptz,
kind text check in ('london_open','ny_open','asia_open','trade_entry','trade_exit',
'liquidity_sweep','bookmark','custom'), created_at timestamptz default now()
```
Full RLS (owner-only), GRANTs to authenticated + service_role.

Server fns in `src/lib/replay.functions.ts`: `listCheckpoints`, `createCheckpoint`, `deleteCheckpoint`.

Context: `checkpoints`, `addCheckpoint(kind,label?)`, `jumpToCheckpoint(id)`, `nextCheckpoint / prevCheckpoint`.

## 6. Replay Templates

New table `replay_templates`:
```
id uuid pk, user_id uuid, name text, market text, symbol text, timeframe text,
mode text, playback_speed numeric, difficulty text, favorite_session text,
objectives jsonb default '[]', settings jsonb default '{}',
is_shared bool default false, created_at timestamptz, updated_at timestamptz
```
RLS + GRANTs.

Server fns: `listTemplates`, `saveTemplate` (from a live session), `applyTemplate` (returns config used by CreatorWizard prefill).

UI: "Save as template" button in ReplayHUD's overflow menu; "Templates" tab in `replay.index.tsx` list rendering preset chips (London Gold Practice, Silver Bullet, ICT Practice, Random London, Crypto Scalping) as system defaults inserted on first load.

## 7. Replay Again — no reload

`replay.session.tsx`: change `onReplayAgain` from `window.location.reload()` to a new `context.replayAgain()` that:
- Calls `restart()` (cursor → start bar)
- Deletes all open trades from this session via server fn `resetReplayProgress({session_id})` (also clears bookmarks/notes optionally — currently only resets trades + score cache)
- Invalidates `["replay", id]` query.
Instant, preserves scenario/settings.

## 8. Auto-Save on Unload

Context adds a `beforeunload` + `visibilitychange` listener that uses `navigator.sendBeacon` (or a synchronous fetch fallback) to POST cursor + speed to a new server route `src/routes/api/public/replay-heartbeat.ts` protected by session token — or, simpler and safer: call existing `updateReplaySession` synchronously via `keepalive: true` fetch. Chose the latter — no new public endpoint.

Existing 5-second debounce stays; the unload flush is additive.

## 9. Long Session Support (chunked candle loading)

`src/lib/replay/market-data.ts` and `context.tsx`:
- Session range extended by `range_start` / `range_end` (already in schema — up to 1y).
- Loader chunks by day/week: initial fetch = first chunk (7 days); background prefetch of next chunk when `cursorIdx > candles.length - 500`.
- `candles` state becomes append-only.

Keep synthetic provider as fallback; Binance/Stooq already support windowed queries — reuse.

## 10. Upgraded Toolbar

Redesigned `ReplayControls.tsx`:
- Row 1: Restart · Replay Again · Prev Checkpoint · Prev Bookmark · Prev Trade · Play/Pause · Next Trade · Next Bookmark · Next Checkpoint · Fast-Forward menu
- Row 2: Speed pills (0.25x…128x, wraps on mobile) · Timeline slider · Jump-To dropdown (London/NY/Asia/Close/Next Day/Prev Day) · Current session badge
- All buttons use `Tooltip`; icons from lucide (`Flag`, `Zap`, `Bookmark`, `ArrowRightToLine`, etc.).

## 11. Performance & Theming Pass

- Memoize `visibleCandles` slice ceiling (already done) + virtualize any long list panels (bookmarks/checkpoints via existing lists — cap render at 200 items with "show more").
- Verify all new components use semantic tokens (`bg-card`, `text-foreground`, `border-border`, `text-success`/`text-danger`) — no hex.
- Responsive: toolbar wraps at `< sm`, speed pills collapse into a `Select` on `< md`.

## 12. Files Touched / Added

Added:
- `src/lib/replay/navigation.ts`
- `src/components/replay/JumpToMenu.tsx`
- `src/components/replay/FastForwardMenu.tsx`
- `src/components/replay/CheckpointsPanel.tsx`
- `src/components/replay/TemplatesDialog.tsx`
- 1 migration (checkpoints + templates tables, RLS, GRANTs, seed 5 default templates on first user access via `applyDefaultTemplates` fn)

Modified:
- `src/lib/replay/constants.ts` (speeds)
- `src/lib/replay/types.ts` (Checkpoint, Template types)
- `src/lib/replay.functions.ts` (checkpoint/template fns, order-trigger fn, resetReplayProgress)
- `src/components/replay/context.tsx` (batched loop, walk-range SL/TP, pending-order triggers, jumpTo/fastForwardUntil/checkpoint/template/replayAgain APIs, autosave flush, chunk prefetch)
- `src/components/replay/ReplayControls.tsx` (new toolbar)
- `src/components/replay/TradePanel.tsx` (pending orders UI)
- `src/routes/_authenticated/replay.session.tsx` (Replay Again wiring, CheckpointsPanel mount)

Untouched: engine renderer (`ReplayChart.tsx`), historical market data provider code, scoring, existing scenario picker, HUD, DB migrations for old tables.

## 13. Backward Compatibility

- All new context fields are additive.
- Old sessions without checkpoints/templates render normally (empty arrays).
- Old speed values (≤16) still valid.
- No breaking DB migrations.
