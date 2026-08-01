# Replay Studio → FX Replay parity

Our studio today: 1,224 lines total. A bare chart projection, a sidebar with market Buy/Sell, play/pause/step transport, and a reflection panel. FX Replay's studio is a full trading terminal. Here is the gap and the build order.

## Gap audit

| FX Replay | TradersHIVE today |
| --- | --- |
| Full-screen terminal, chart edge-to-edge | Chart boxed under app chrome + replay tabs |
| Full drawing toolset on the replay chart | None |
| Full indicator library, same in replay and live | None on the replay chart |
| Any timeframe mid-session, down to seconds | Locked to the dataset timeframe |
| Replay mode: jump to any date, "Go-To" jumps (sessions, price levels, trade closes) | Play/pause/step only, no seek |
| Multi-pair / multi-chart in one session | Single chart |
| Chart-native order entry, drag SL/TP, risk-% sizing | Sidebar market buttons only |
| Position management: partials, scale, break-even, trailing | Close-all only |
| Always-visible account bar (balance, equity, P&L, drawdown) | Buried in tabs |
| Prop-firm rule simulation during the session | Exists elsewhere, not wired into replay |
| Post-session analytics + projections | Basic review page |
| Economic calendar overlaid on the timeline | None |

Note: FX Replay's own scripting language (FXR Script) is out of scope — that is a language runtime, not a feature.

## Build order

**Phase A — Terminal shell**
Studio takes the whole viewport: app sidebar and replay tabs hide during a session, `100dvh` layout, chart edge-to-edge. Top strip carries symbol, dataset, timeframe switcher and a live account HUD (balance, equity, open P&L, day P&L, peak drawdown). Bottom transport bar gets a draggable seek slider plus a jump-to-date/time picker that re-seeks the clock deterministically. Exit button returns to the review screen.

**Phase B — Real charting inside replay**
Swap the bare `StudioChart` for the workspace `ChartEngine` running in replay-feed mode, so replay inherits drawings, the left tool rail, indicators, chart types and the object tree. Drawings and indicator config persist on the session record so a resumed session looks identical. Timeframe switcher aggregates loaded base bars up (1m → 5m/15m/1H/4H/D) while holding the exact clock cursor — aggregation only ever touches consumed bars, so no look-ahead.

**Phase C — Chart-native trading**
Reuse `ChartOrderLayer` and `FloatingOrderTicket` from the live workspace: drag SL/TP, hover actions, axis-pinned P&L labels. Order ticket supports market/limit/stop with risk-% sizing off the session's starting balance and an R:R preview. Position management gains partial close, scale in/out, move to break-even and trailing stop. Keyboard: `Space` play/pause, `→` / `⇧→` step, `B` / `S` buy/sell, `X` close, `Esc` exit.

**Phase D — Go-To and multi-chart**
Go-To menu jumps the clock to the next/previous session open (Asia/London/NY), a typed date, or a past trade close. Multi-pair layout reuses the workspace `ChartLayoutProvider` so 2–4 panes advance on one shared replay clock.

**Phase E — Session results**
Finish screen with equity curve, R distribution, win rate, expectancy, best/worst trade, a projection of the same edge over 100/200/300 trades, and a hand-off into Journal and the improvement loop.

## UI/UX direction

FX Replay reads as a dark, dense, chrome-light trading terminal: the chart owns the screen, controls are thin bars pinned top and bottom, everything else is a collapsible dock. Our studio still looks like a web page with a chart inside it. Phase A is where that flips; B–E fill it in. Existing design tokens carry over, so this is layout and density work, not a re-theme.

## Technical notes

- No new execution logic — everything routes through the existing `ReplaySessionController` → `ReplayClock` → canonical order stores, preserving determinism, autosave and resume.
- Timeframe aggregation is a pure function over consumed candles; the clock keeps stepping the base timeframe underneath.
- Seek and Go-To replay observations from session start to the target index rather than mutating state, so runs stay reproducible.
- Sharing `ChartEngine` means one drawing/indicator codebase across Trading Workspace and Replay Studio.

## Scope

That is a lot for one pass. Default order is A → B → C → D → E, each phase shipped working. Say the word if you would rather I lead with chart-native trading (C) instead of the shell.
