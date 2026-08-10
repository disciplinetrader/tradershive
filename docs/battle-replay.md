# Replay battles

Battles that run on a fixed historical dataset instead of the live feed.

Status: **steps 0–4 shipped, unranked only.** Step 5 (server-side fill
validation) is what makes them trustworthy enough to award Hive Rating.

---

## Why replay battles are unranked

Enforced by a database CHECK constraint, `battles_replay_must_be_unranked`, not
by application code alone.

Until the server decides which observation a fill lands on, the client is the
authority on its own fills — and the full candle tape, **including every future
bar**, is in browser memory by construction (`ReplayDataset.candles` is the
complete array; the clock renders by slicing it). Disabling the scrubber stops
accidental forward-seeking. It does not stop anyone reading the future out of
devtools.

Hive Rating, XP, coins and season rewards cannot be un-awarded retroactively, so
this is enforced structurally: a bug in `createBattle` must not be able to mint a
ranked replay battle. **Step 5 drops that constraint. Nothing else should.**

---

## Replay battles are restricted to USD-quoted symbols

**Do not widen this without reading BA-10 and BA-8 in
[`known-issues.md`](./known-issues.md).**

There are two P&L implementations in this codebase. Battle replay fills are
priced by the **engine** formula (`(exit − fill) × sign × quantity`), because
that is what `runObservation` produces and translating it would create a second
number that could disagree with the leaderboard.

The engine reports P&L in **quote currency**. `paper_trades.pnl` is in **account
currency (USD)**. Those coincide only when the instrument is quoted in USD.

So a replay battle may only use a symbol where the two formulas provably agree.
The test is not a string match on the symbol name — it is derived from the
symbol's own metadata:

```
pipValuePerLot / pipSize === contractSize
```

That identity holds exactly when no currency conversion is involved. It is
implemented as `isEnginePricedSymbol()` in
[`src/lib/replay/battle-pnl.ts`](../src/lib/replay/battle-pnl.ts) and enforced in
`createBattle`.

Deriving the restriction rather than hardcoding a list means it stays correct if
someone adds a symbol: a new USD-quoted instrument is allowed automatically, and
a new cross pair is refused automatically.

**Widening this to cross pairs requires a currency conversion layer first.**
Without one, a USD/JPY replay battle would write yen into a USD column — roughly
157× inflation, and the mechanism behind BA-5.

Currently allowed: all crypto (`*/USDT`), USD-quoted forex (`EUR/USD`,
`GBP/USD`, `AUD/USD`, …), indices and metals. Refused: `USD/JPY`, `GBP/JPY`,
`EUR/JPY`, `USD/CAD`, `USD/CHF`, `EUR/GBP`.

---

## How the market moves

The cursor is **derived, never stored or streamed**:

```
cursor = f(now − battles.start_at, battles.replay_speed, dataset)
```

Every participant computes the same number from the same row, and `ReplayClock`
is deterministic in observations, so an identical cursor means an identical
market. There is no per-tick write, nothing to drift, and no second source of
truth. See [`battle-cursor.ts`](../src/lib/replay/battle-cursor.ts).

Consequences worth knowing:

- **Nobody can pause the market.** There is no pause API on a battle session by
  construction — the only way to move is `advanceBattleSession`, which reads
  wall-clock time. The scrubber's "Freeze" stops your own chart; the engine
  behind it keeps advancing and your stops keep resolving.
- **A backgrounded tab cannot fall behind.** The advance loop is `setInterval`,
  not `requestAnimationFrame`, because rAF does not fire in a hidden tab. A late
  tick replays everything it missed.
- **Speed is fixed at creation**, shared by everyone, clamped to 0.5–8×.
- **Forward seek, skip and speed controls do not exist in the battle build** —
  absent, not disabled. A disabled control is an invitation to find the code
  path behind it.

---

## Battle time vs market time

Two clocks, deliberately decoupled.

| | Drives | Source |
|---|---|---|
| Battle time | `filling → ready → countdown → live → completed`, the countdown, settlement | `start_at` / `end_at`, wall clock |
| Market time | which candle is forming | the derived cursor |

**Wall-clock ends the battle.** Dataset exhaustion is prevented at creation
instead: `validateBattleReplayRange` refuses a battle whose tape cannot cover its
duration at its speed, because a battle that runs out mid-flight strands every
participant at a frozen market holding open positions.

This is why `enforce_battle_rules_on_trade` compares **`created_at`** (battle
wall-clock) against `[start_at, end_at]` rather than `opened_at`. A replayed
trade's `opened_at` is *market* time — a 2023 candle — which would fail the
window outright. Both are stored: `opened_at` for the market, `created_at` for
the battle, `observation_cursor` for the exact bar.

---

## Creating one — the dataset identity round-trip

`replay_dataset_id` is `provider:SYMBOL:timeframe:start:end:checksum`, where the
checksum is FNV-1a over every OHLC value in order. **It is computed at load time
and cannot be written by hand**, which is why there is a seed script
(`scripts/seed-replay-battle.ts`) rather than a SQL insert. A guessed id
produces a battle that is created successfully and then refuses to start, which
reads as a bug rather than as bad input.

Anyone building the wizard step has to clear three traps.

### 1 · The creating client must call `getReplayCandles` the way the battle will

`BattleReplayProvider` passes `symbol`, `timeframe`, `from`, `to` and `market`
and **no `warmupBars`**. Replay Studio passes `warmupBars` and offsets its start
cursor to compensate. Requesting warm-up at creation prepends bars the battle
client never sees, so the two sides checksum different tapes.

`market` matters as much as the rest: it feeds session-aware coverage
(`checkCoverage`), and the battle client passes `battles.market`. If creation
used a different value, one side can decide the range is uncovered and fire an
on-demand backfill — which writes new rows underneath the checksum.

### 2 · The stored bounds are narrower than the window you requested

This is the one that is easy to miss. `replay_from` and `replay_to` hold the
**first and last candle times**, not the range that was asked for — and
`BattleReplayProvider` requests those stored bounds back. Since `readStored`
filters `ts >= from AND ts <= to`, the battle client therefore issues a
*narrower* query than the creating client did.

It is expected to return the same rows. Expected is not sufficient for a value
whose only failure mode is a battle that dies at the opening bell, in front of
competitors. So the seed script rebuilds the dataset a second time from the
bounds it is about to store and refuses to insert unless both ids match. A
match is proof; the argument above is not.

### 3 · The tape was once truncated without saying so — fixed, keep the assertion

Worth knowing because it shaped the code you are reading. PostgREST caps
responses at 1000 rows, and `readStored` asked for `.limit(10000)` — a limit the
server would never honour. A month of 5m bars returned 1,000 of 8,644.

The loud case was harmless. The quiet one was not: a range of 1,000–1,666 bars
came back truncated yet still passed `checkCoverage`, since `1000/1666` clears
the 0.6 minimum. And because the checksum is computed over *whatever arrived*,
truncation did **not** surface as a dataset mismatch — every participant loaded
the same short tape, agreed on it perfectly, and the battle ran on data that
ended early. `validateBattleReplayRange` could not help either; it validates the
bar count it is handed.

`readStored` now pages until it has read every row the exact count promises, and
raises if it ever comes up short. **Keep that final assertion.** Paging is meant
to make truncation impossible, and the assertion is what will tell you when that
stops being true — which is precisely what was missing the first time.

The remaining ceiling is `MAX_CANDLES` (50,000), a deliberate refusal threshold
rather than a silent cut. At 1x that is about 14 hours of battle, so duration is
no longer the binding constraint it was.

---

## Auditability

`paper_trades` carries `observation_cursor` for replay-battle fills — the exact
observation index the fill landed on. Without it a disputed result cannot be
reconstructed, because market time alone does not identify a bar uniquely once
intrabar observations are involved.

That column is also the seam step 5 needs: server-side validation means
recomputing which observation a submitted fill *should* have landed on and
comparing it against what the client claimed.
