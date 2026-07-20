# Trading Workspace Pro Upgrade

Enhancing the existing Trading Workspace, Paper Trading, Journal, and Replay Studio without rebuilding them. Keeps TradingView Charting Library as the primary chart.

## Scope & Phasing

Given the size, I'll ship this in **4 sequential phases** in one turn each, but I need your go-ahead first because the total work is large (~40 files, 3 migrations). Each phase is independently useful:

### Phase 1 — Chart Trading Layer (on top of TradingView)
- Target/RR tool: click to place Entry → drag SL/TP → live overlay showing RR, Risk $, Reward $, pips, position size, lot size, % risk
- Right-click chart context menu: Buy/Sell Market, Buy/Sell Limit, Buy/Sell Stop, Set Alert, Copy Price, Create Drawing (uses clicked price)
- Draggable Entry/SL/TP lines for open positions and pending orders, with live floating PnL, profit/loss zones, direction arrow
- Chart-native price alerts

Files: `src/components/trading/chart/ChartOverlay.tsx`, `TargetTool.tsx`, `ChartContextMenu.tsx`, `PositionLines.tsx`, `useChartPriceMath.ts`

### Phase 2 — Prop-Firm Risk Rules
- Migration: `risk_rule_profiles`, `risk_rule_violations`, `daily_risk_snapshots` tables
- Presets: FTMO, 5%ers, Funding Pips, FundedNext, MyFundedFX, TradersHIVE Default + Custom
- Rule fields: max daily loss, max overall loss, profit target, max DD, max risk/trade, min trading days, max positions, max lot, news restriction, weekend holding, max daily trades, session restriction
- Live Risk Dashboard widget (daily loss remaining, DD, target %, violations, warnings)
- Server-side enforcement in `paper-trading.functions.ts` — reject trades that violate active profile
- Today's PnL topbar widget (today profit/loss, open PnL, closed PnL, current DD, target %)

Files: migration + `src/lib/risk-rules/` + `src/components/trading/RiskDashboard.tsx`, `TodayPnLWidget.tsx`, `/settings/risk-rules` route

### Phase 3 — Order & Position Management + Journal Screenshots
- Partial close, break-even, trailing stop, modify/cancel pending, close all, reverse position (server fns + UI buttons in position panel)
- Position panel columns: swap, commission, risk, RR, current pips, floating PnL
- Journal enhancements: open/close time, duration, holding time (computed)
- Screenshots: storage bucket `trade-screenshots`, before/after entries auto-captured from TradingView, manual upload/replace, gallery in journal entry
- Trade metadata: entry reason, exit reason, mistakes, lessons, emotion, market conditions, setup, strategy, tags (extend `journal_entries` where fields missing)
- Keyboard shortcuts: Buy (B), Sell (S), Close (X), Cancel orders (C), Toggle replay (R), Screenshot (P), Hide drawings (H)

Files: migration + `useKeyboardShortcuts.ts`, `PositionActions.tsx`, `TradeScreenshotGallery.tsx`, extend Journal entry form

### Phase 4 — Replay Studio + Stats + Dark Mode Polish
- Replay: FX-Replay-style timeline scrubber, better playback controls (speed presets, step forward/back N candles), session sidebar, trade history panel, bookmarks strip
- Stats: today / weekly / current-session widgets, avg holding time, avg RR, avg trade duration (server fn + dashboard cards)
- Dark mode audit: fix low-contrast tokens for charts/tables/heatmaps/bars/icons in `src/styles.css`; ensure semantic tokens used everywhere in workspace
- Responsive pass: workspace collapses tool rails and stacks panels on tablet/mobile

## Technical Notes
- All price math shared via `src/lib/trading/price-math.ts` (pips, position size, PnL, RR)
- TradingView integration via `widget.activeChart().createOrderLine()` / `createPositionLine()` / `subscribe('mouse_down')` for right-click coords
- Realtime updates via existing Market Data Engine subscriptions; drag handlers debounced via rAF, no re-render storms
- Server enforcement of risk rules is authoritative — client UI is just a preview

## Confirm to proceed
Reply **"go phase 1"** (or "go all") and I'll ship Phase 1 immediately, then continue sequentially. Each phase = one message with all files + migration in parallel.
