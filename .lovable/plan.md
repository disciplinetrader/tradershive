# Phase 5 — Professional Chart Trading

Build on top of the existing chart engine, adapter, `paper_trades` / `paper_orders`, and Order Management. **No changes** to Trading Engine internals, Yahoo Finance, or the Trading Workspace layout — only what's rendered inside the chart column.

## What ships

1. **Unified chart trading overlay** replacing today's SL/TP-only `OrderLinesOverlay`. Renders every trade artifact directly on the chart:
   - Open positions (entry, SL, TP, live P/L badge, side chip)
   - Pending orders (trigger, optional limit, SL, TP)
   - A "draft" order being placed from the chart
   - Trailing-stop marker for positions with `trailing_stop_pips`
   - Closed-position markers (entry ▲ / exit ▼) via adapter `setExternalMarkers`
2. **Chart-native order entry** — click on the chart to open a draft. Buy Market / Sell Market / Buy Limit / Sell Limit / Buy Stop / Sell Stop are chosen from a popover pinned to the click price. Confirm places via existing `openTrade` / `placeOrder` server functions.
3. **Drag & drop** — entry line, SL, TP, pending trigger and trailing stop all draggable. On release: side-aware validation (`validateStops`), then persist:
   - Open positions → `modifyTrade` (SL/TP)
   - Pending orders → new `modifyOrder` server fn (trigger / limit / SL / TP)
   - Draft → local state
4. **Live R/R box** shown while dragging or building a draft. Uses the existing pure `tradeCalculation` for risk $, reward $, RR, risk %, margin, notional, spread/commission estimates, potential P/L.
5. **Per-position quick actions** floating next to each position ribbon: Close, Partial (25/50/75%), Move to BE, Reverse, Attach trailing. Wired to `closeTrade`, `partialCloseTrade`, `moveToBreakEven`, `openTrade` (reverse), and a new `attachTrailing` fn writing `trailing_stop_pips`.
6. **Pending-order actions**: Modify (drag), Cancel, Duplicate.
7. **Account scoping**: overlay reads `usePaper().accountId`. Chip in top-right of chart shows active account; toggle "Show all accounts" filters positions/orders returned from realtime.
8. **Performance**: draft/drag state is local (`useRef` + rAF) — no server round-trip until drop. Overlay reuses a single ResizeObserver and a single `requestAnimationFrame` reproject loop; each line/ribbon is memo-keyed by id.

## New / touched files

New:
- `src/lib/chart-trading/types.ts` — `ChartDraft`, `ChartLine`, `LineKind`, `ChartOrderAction`
- `src/lib/chart-trading/math.ts` — draft → R/R metrics via `tradeCalculation`
- `src/lib/chart-trading/persist.ts` — thin wrappers over existing server fns (openTrade, placeOrder, modifyTrade, modifyOrder, cancelOrder, partialCloseTrade, moveToBreakEven, closeTrade)
- `src/components/chart/ChartTradingOverlay.tsx` — master overlay (positions + orders + draft + closed markers)
- `src/components/chart/RiskRewardBox.tsx` — pinned R/R panel
- `src/components/chart/DraftOrderPopover.tsx` — order-type picker at click price
- `src/components/chart/PositionRibbon.tsx` — per-position action pill
- `src/components/chart/PendingOrderRibbon.tsx` — per-order action pill
- `src/components/chart/ChartAccountChip.tsx` — active account + Show All toggle

Touched (surgical):
- `src/components/chart/ChartWorkspace.tsx` — swap `OrderLinesOverlay` for `ChartTradingOverlay`, keep the rest of the layout, and pass account/symbol/settings through.
- `src/lib/paper-trading.functions.ts` — add `modifyOrder`, `attachTrailing` server functions (additive, no schema change; uses existing `trailing_stop_pips` column already present on `paper_trades` and the `paper_orders` columns).
- `src/lib/order-management/index.ts` — no changes; overlay talks directly to server fns to keep the existing paper-trading write path as the single source of truth.

## Trading Engine contract

The overlay never touches `src/lib/trading-engine/*` or Yahoo Finance. It writes exclusively through the existing `paper_trades` / `paper_orders` server functions, which already fan events out to Analytics, Journal, position history, and stats. Replay Studio can reuse `ChartTradingOverlay` in a future pass because it depends only on `ChartAdapter` — no Workspace coupling.

## Explicitly out of scope

- No redesign of Trading Workspace toolbars, watchlist, or bottom tabs.
- No changes to Trading Engine, cost model, sizing, or Yahoo provider.
- Closed-trade heatmap on the chart is limited to entry/exit markers (adapter markers API); rich annotations for BE / partial / cancelled events land in a follow-up pass.

Please approve and I'll build it in one implementation pass.