# Replay Studio → FXReplay-grade backtesting

Practice is gone (nav item removed, `/practice` and `/practice/*` now redirect to Replay Studio so old links still work).

Next: close the gap between our Replay Studio and FXReplay / TradingView bar-replay. Below is what they have, what we have, and what I would build.

## Gap audit

| Capability | FXReplay | TradersHIVE today |
| --- | --- | --- |
| Full-screen terminal chart | Edge-to-edge, no app chrome | Chart boxed inside page tabs, ~14rem of chrome above |
| Drawing tools on replay chart | Full toolset, persisted per session | None — replay chart is a bare projection |
| Indicators | Full library | None on the replay chart |
| Change timeframe mid-session | Yes, cursor preserved | Locked to the dataset timeframe |
| Order entry | Chart-native ticket, drag SL/TP, risk % sizing, limit/stop | Buy/Sell market buttons in the sidebar only |
| Position management | Partial close, scale, break-even, trailing | Close-all only |
| Account HUD | Balance / equity / P&L / drawdown always visible | Buried in tabs |
| Playback | Play/pause, speeds, step, **jump to date/time** | Play/pause, speeds, step (no seek/jump) |
| Session end | Results screen with equity curve + stats | Notice banner, then navigates away |

## What I will build

**Phase A — Terminal shell (foundation)**
- Studio takes the full viewport: hide the app sidebar and the replay sub-tabs while in a session, `100dvh` layout, chart edge-to-edge.
- Top strip: symbol, dataset, timeframe switcher, account HUD (balance, equity, open P&L, day P&L, max drawdown).
- Bottom transport bar: play/pause, step bar, skip 10, speeds, **draggable seek slider** and a "jump to date/time" picker that re-seeks the clock deterministically.

**Phase B — Real charting inside replay**
- Replace the bare `StudioChart` projection with the workspace `ChartEngine` in replay-feed mode, so replay inherits drawings, the left tool rail, indicators, chart types and the object tree.
- Drawings and indicator config persist on the replay session record, so a resumed session looks identical.
- Timeframe switcher aggregates the loaded base bars up (1m → 5m/15m/1H…), keeping the exact clock cursor. No look-ahead: aggregation only ever uses consumed bars.

**Phase C — Chart-native trading**
- Reuse `ChartOrderLayer` / `FloatingOrderTicket` from the live workspace: drag SL/TP lines, hover actions, axis-pinned P&L labels.
- Order ticket: market / limit / stop, risk-% sizing off the session's starting balance, R:R preview.
- Position management: partial close, scale in/out, move to break-even, trailing stop — same execution engine, so trades stay canonical and keep syncing to Journal.
- Keyboard: `Space` play/pause, `→`/`⇧→` step, `B`/`S` buy/sell, `X` close, `Esc` exit.

**Phase D — Session results**
- On finish: full-screen results with equity curve, R distribution, win rate, expectancy, best/worst trade, and a "save to Journal / review trades" hand-off.

## Technical notes

- No new execution logic: everything routes through the existing `ReplaySessionController` → `ReplayClock` → canonical order stores, so determinism and autosave/resume are preserved.
- Timeframe aggregation is a pure function over consumed candles; the clock keeps stepping the base timeframe underneath.
- Seek/jump replays observations from the session start to the target index rather than mutating state, keeping the run reproducible.
- Chart reuse means one drawing/indicator codebase for both Trading Workspace and Replay Studio.

## Scope check

Phases A–D are a lot for one pass. Default order is A → B → C → D, shipping each phase working. Tell me if you would rather I start with chart-native trading (Phase C) instead.
