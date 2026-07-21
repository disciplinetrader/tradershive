## Goal
Split concerns: **Dashboard** stays action-oriented ("what next?"). Create a new **Analytics Center** at `/analytics` that is the professional performance lab ("how am I performing?"). Reuse `StatisticsProvider`, `computeKpis`, and existing chart components — no duplicated analytics logic. The old `/statistics` routes stay in place (referenced by other modules) and will be aliased/redirected to the new Analytics sections in a later pass; this pass focuses on the new experience.

## Scope of this pass
Ship the full new Analytics Center IA + landing + all sub-sections listed below, wired to real data via the existing `StatisticsProvider`. New capabilities on top of existing statistics logic:

1. **Analytics Home** (`/analytics`)
   - Performance Overview strip (Net Profit, Win Rate, PF, Expectancy, Avg RR, Max DD, Recovery Factor, Trades)
   - Quick Performance Cards (last 7d / 30d / 90d, computed from filtered set)
   - Performance Trend (equity sparkline reused from `EquityCurveCard`)
   - Recent Improvements + Recent Weaknesses (delta vs previous period, reuses `CompareCard` math)
   - AI Summary card (calls existing `getLatestPerformance` from `ai.functions`)
   - Recent Reports (reuses `ReportsView` list)
   - Saved Backtests, Recent Strategies, Comparison Shortcuts

2. **Analytics Navigation** — sub-routes under `/analytics`:
   - `overview` (home), `performance`, `trades`, `risk`, `sessions`, `symbols`, `replay`, `backtests`, `championships`, `ai-insights`, `reports`, `compare`
   - Each sub-route composes existing cards (`Charts.tsx`, `RiskPanel`, `GroupTables`, `CalendarHeatmap`, `SessionCards`, `EmotionMistake`, `InsightsPanel`) — no math rewritten.

3. **Backtest Selector**
   - Top-of-page dropdown: "Overall" | each `replay_sessions` row tagged as backtest (status = completed).
   - Selection lives in `AnalyticsProvider` (wraps `StatisticsProvider`) and is applied by filtering `raw` to that session's trades (`replay_trades` joined into `AnalyticsTrade` shape via a small adapter in `src/lib/statistics/backtest-source.ts`).
   - All charts/tables update instantly (context-driven), no page reloads.

4. **Compare Mode** (`/analytics/compare`)
   - Two selectors: left = Overall/Backtest/Championship/Replay; right = same.
   - Side-by-side KPI table (Win Rate, RR, Profit, DD, PF, Trade Count, Avg Duration, Best/Worst symbols) computed via `computeKpis` on each dataset.

5. **Sections** (compose existing components, add small new views only where nothing exists):
   - Trades: new `TradeAnalytics.tsx` (frequency, avg hold, execution quality, best/worst trade) computed from filtered set.
   - Symbols: reuse `GroupTables` grouped by symbol.
   - Replay: new `ReplayAnalytics.tsx` (score avg, execution, mistakes count, homework % from `replay_*` tables via a new server fn `getReplayAnalytics`).
   - AI Insights: reuse `InsightsPanel`, `EmotionAnalysis`, `MistakeAnalysis`; add strengths/weaknesses/regression list computed from delta between last-30d and prior-30d KPIs.
   - Reports: reuse `ReportsView` with PDF/CSV/Image export buttons (CSV already; add PDF via `window.print` styled sheet and PNG via `html-to-image`).

6. **Filters & Search**
   - Reuse `FiltersBar` (already supports date, market, symbol, session, etc.).
   - Add an instant search input in the Analytics header that filters trades/backtests/reports by symbol/tag/id in a client-side `useMemo` over `raw`.

7. **Perf & polish**
   - All lists virtualized only where already virtualized; expensive charts already memoized. Backtest Selector switches by swapping the `raw` array in context — O(n) filter, safe for 10k+ trades.
   - Dark/light: only use existing tokens (`--primary`, `--success`, `--danger`, `--muted-foreground`, glass utilities). No hardcoded colors.
   - Responsive: existing grid patterns (`sm:grid-cols-2 xl:grid-cols-3`) reused throughout.

## Non-goals (this pass)
- Sharpe/Sortino, Strategy analytics, full comparison for future Strategy-vs-Strategy: rendered as "future" placeholders per prompt.
- No changes to Dashboard, Paper Trading, Journal, Statistics logic files, AI Coach, Replay Studio, Championships, Trade Details.
- Old `/statistics/*` routes stay working; a follow-up pass will add redirects from `/statistics` → `/analytics` once other modules' deep links are updated.

## File map
New:
- `src/routes/_authenticated/analytics.tsx` (layout + tabs + Backtest Selector + search)
- `src/routes/_authenticated/analytics.index.tsx` (Home)
- `src/routes/_authenticated/analytics.performance.tsx`
- `src/routes/_authenticated/analytics.trades.tsx`
- `src/routes/_authenticated/analytics.risk.tsx`
- `src/routes/_authenticated/analytics.sessions.tsx`
- `src/routes/_authenticated/analytics.symbols.tsx`
- `src/routes/_authenticated/analytics.replay.tsx`
- `src/routes/_authenticated/analytics.backtests.tsx`
- `src/routes/_authenticated/analytics.championships.tsx`
- `src/routes/_authenticated/analytics.ai-insights.tsx`
- `src/routes/_authenticated/analytics.reports.tsx`
- `src/routes/_authenticated/analytics.compare.tsx`
- `src/components/analytics/AnalyticsProvider.tsx` (wraps StatisticsProvider, holds backtest selection + search)
- `src/components/analytics/BacktestSelector.tsx`
- `src/components/analytics/AnalyticsHome.tsx` (composes home cards)
- `src/components/analytics/QuickPerformanceCards.tsx`
- `src/components/analytics/StrengthsWeaknesses.tsx`
- `src/components/analytics/AiSummaryCard.tsx`
- `src/components/analytics/TradeAnalytics.tsx`
- `src/components/analytics/ReplayAnalytics.tsx`
- `src/components/analytics/CompareView.tsx`
- `src/lib/statistics/backtest-source.ts` (adapts replay_trades → AnalyticsTrade)
- `src/lib/analytics.functions.ts` (`listBacktests`, `getReplayAnalytics`)

Reused unchanged: everything under `src/components/statistics/` and `src/lib/statistics/`.

## Technical notes
- `AnalyticsProvider` renders `StatisticsProvider` internally and exposes selected backtest + search via its own React context. When a backtest is selected, it fetches once via `useQuery(['analytics','bt',id], listBacktestTrades)` and passes those trades to `StatisticsProvider` via a new optional `overrideTrades` prop (small, additive change to `context.tsx`).
- Server fns follow existing patterns (`requireSupabaseAuth` middleware, `.inputValidator().handler()`).
- Nav entry "Analytics" added to sidebar next to existing "Statistics"; Dashboard link kept as-is.

## Deliverables
Complete, production-ready Analytics Center wired to real Supabase data through the existing statistics engine, with Backtest Selector, Compare Mode, and every listed section rendering real metrics.
