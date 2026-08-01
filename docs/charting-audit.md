# Trading Workspace — Charting Audit (pre-migration)

Date: 2026-08-01. No chart code was replaced to produce this report.

## 1. Current chart library and version

| Field | Value |
| --- | --- |
| Library | **TradingView Lightweight Charts** |
| Version | `5.2.0` (declared `^5.2.0`, installed 5.2.0) |
| Package/import path | `lightweight-charts` (npm) |
| Main init file | `src/lib/chart/adapters/lightweight.ts` (897 lines) |
| Consumer | `src/components/chart/ChartEngine.tsx` → `src/components/trading/TradingWorkspace.tsx` |
| Licence | **Apache-2.0** (`node_modules/lightweight-charts/LICENSE`, `"license": "Apache-2.0"`, author "TradingView, Inc.") |

**It is NOT** Advanced Charts / Charting Library, **NOT** the embeddable widget, and **NOT** a custom
renderer on a third-party library. Everything is drawn through `lightweight-charts` plus our own
`ISeriesPrimitive` canvas layers.

## 2. Evidence from the repository

- `package.json:64` → `"lightweight-charts": "^5.2.0"`. No other chart dependency exists.
- `node_modules/lightweight-charts/package.json` → version `5.2.0`, `license: Apache-2.0`.
- Files referencing TradingView at all: `src/lib/chart/types.ts`, `src/lib/chart/adapter.ts`,
  `src/lib/chart/adapters/lightweight.ts`, `src/lib/chart/tv-loader.ts`,
  `src/lib/market-data/tv-datafeed.ts`, `src/components/chart/ChartEngine.tsx`, plus two READMEs.
- `public/` contains only `logo.png`. **There is no `public/charting_library/` directory** — no
  Advanced Charts distribution is present, official or otherwise.
- `src/lib/chart/tv-loader.ts` is a *stub* loader that would `<script src="/charting_library/charting_library.standalone.js">`
  if a licensed copy were ever installed; today it always resolves `null`.
- `src/lib/market-data/tv-datafeed.ts` is a ready-written UDF-style datafeed adapter
  (`onReady` / `searchSymbols` / `resolveSymbol` / `getBars` / `subscribeBars` / `unsubscribeBars`)
  bound to `marketData` — written in anticipation, never executed.

## 3. Why the TradingView logo appears

Browser-verified on `/trading`: the DOM contains

```
<a href="https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=localhost/trading">
```

`utm_campaign=lwc-chart` is the **Lightweight Charts v4.2+ `attributionLogo` option**, which defaults
to `true`. We never set `layout.attributionLogo` anywhere in the repo (grep returns zero hits), so the
default renders. It is the library's own attribution mark, not evidence of an Advanced Charts licence.

## 4. Licence / access status

- Current use is **legally permitted**: Apache-2.0 allows commercial use, modification and
  distribution; obligations are to retain the licence text and NOTICE (satisfied by npm distribution).
- Apache-2.0 does **not** legally require the visible logo. TradingView's own product page asks that
  attribution be kept, and their terms require the link to remain if you use the free library without
  a separate agreement. **Recommendation: leave `attributionLogo` at its default until someone with
  authority signs off.** No change made in this pass.
- **We do NOT have Advanced Charts access.** Advanced Charts is free-of-charge but gated behind an
  application + signed licence agreement with TradingView, delivered as a private GitHub repo. Nothing
  in this repository indicates such an agreement exists. No unofficial copy will be introduced.

## 5. Feature matrix (source + browser verified on `/trading`, 1280×1800, authenticated)

Legend: ✅ working · 🟡 partial · 🔴 present but broken · ⬜ missing · ❔ not browser-verified

### Chart basics
| Item | Status | Note |
| --- | --- | --- |
| Candlestick chart | ✅ | Renders live candles |
| X-axis time scale | ✅ | Visible, labelled, not clipped by terminal |
| Y-axis price scale | ✅ | Visible with last-price + crosshair labels |
| Crosshair | ✅ | `crosshair` setting wired |
| Zoom / Pan | ✅ | `zoomBy` / `panBy` on the adapter |
| Timeframe switching | ✅ | Toolbar favourites |
| Symbol switching | ✅ | Symbol search + watchlist |
| Price labels / current-price line | ✅ | Red last-price tag visible |
| Volume pane | ✅ | Bottom-margin histogram visible |
| Fullscreen | ✅ | `/trading/fullscreen` route |
| Responsive resizing | 🟡 | Works; `autoSize` in hidden containers previously needed a patch |

### Drawing tools
| Item | Status | Note |
| --- | --- | --- |
| Trend line / Horizontal / Vertical / Ray / Rectangle / Text | ✅ | Custom canvas renderer, `src/lib/chart/drawings/render.ts` |
| Position tool | ✅ | `drawings/position.ts`, ATR geometry, chart-anchored |
| Measurement tools | 🟡 | Present in renderer; not exercised in browser this pass |
| Selection / editing / deletion | ✅ | `DrawingStore` with undo/redo |
| Locking / visibility | 🟡 | Model supports it; UI surface is thin |
| Persistence | ✅ | `features/replay/drawings/persistence.ts` |
| Object tree | ⬜ | Not implemented |
| Fibonacci / channels / anchored tools | 🟡 | Subset of the 20+ renderer types; not grouped in the rail |

### Indicators
| Item | Status | Note |
| --- | --- | --- |
| Indicator list / add | ✅ | `src/lib/chart/indicators.ts` (SMA, EMA, VWAP, Ichimoku, SuperTrend, BB, ATR, Donchian, RSI, MACD, S/R, Fib, sessions, SMC/ICT) |
| Overlay indicators | ✅ | `syncOverlayIndicators` |
| Separate panes | ✅ | `syncSubPaneIndicators` (RSI/MACD/ATR/Stoch) |
| Settings dialog | 🟡 | Limited per-indicator parameter editing |
| Removal / persistence | ✅ | `chart/storage.ts` |
| Replay compatibility | ✅ | Replay feeds only released bars; indicators are pure functions over that array |

### Trading
| Item | Status |
| --- | --- |
| Buy/Sell controls, order ticket, market/limit/stop | ✅ |
| Pending-order chart rendering / edit / cancel | ✅ (`PendingOrderLines.tsx`, TradingView-style chips) |
| Open-position rendering, SL/TP render + drag | ✅ (`PositionLinesLive.tsx`) |
| Break-even, trailing stops, multi-TP | ✅ (`orders/position-manager.ts`, `trailing.ts`, `take-profit.ts`) |
| Execution marks / ClosedTrade stamps | ✅ (`render.ts` anchored markers) |
| Paper trading terminal | ✅ |

### Workspace layout
| Item | Status |
| --- | --- |
| Left drawing rail, right dock, bottom terminal | ✅ (all three visible in the browser capture) |
| Watchlist / Order / Positions / Pending / Account tabs | ✅ |
| Chart resize when panels open/close | 🟡 works, occasional reflow jitter |
| Desktop / Tablet / Mobile | ✅ / 🟡 / 🟡 (bottom sheets on mobile) |

Console errors on load: **none**.

## 6. Recommended path — Option A now, Option B as an opt-in track

**Recommendation: keep Lightweight Charts as production, and pursue Advanced Charts only behind a
licence-gated adapter.** Reasons:

- Option B is **blocked on a licence we do not hold**. Advanced Charts cannot be installed from npm;
  without the signed agreement there is no legal path, and unofficial builds are excluded by policy.
- The `ChartAdapter` interface already isolates the renderer. Advanced Charts can arrive later as
  `adapters/tradingview.ts` with zero consumer churn — that is exactly what the interface was built for.
- Remaining Option-A work is real but bounded: grouped/anchored drawing tools, object tree, richer
  indicator settings, chart templates + saved layouts, and multi-pane polish. None of these are blocked.
- **Option C (Trading Platform) is not recommended.** We own the canonical order, position, account,
  risk, ClosedTrade, Replay and Journal engines. Adopting TV trading primitives would create a second
  execution surface, which violates the one-canonical-engine rule for no gain.

## 7. Datafeed integration plan (if/when a licence lands)

`src/lib/market-data/tv-datafeed.ts` already implements the UDF contract against `marketData`. Gaps to
close before it is production-worthy: session strings per market (currently hard-coded `24x7`),
timezone from dataset rather than `Etc/UTC`, volume precision per instrument, provider/entitlement
error surfacing distinct from `noData`, and provenance passthrough. Provider routing
(`historical/routing.ts`: crypto→Binance, others→Twelve Data) stays untouched — the datafeed calls
`marketData.getCandles`, never a provider. No bar is ever synthesized.

## 8. Replay integration plan

Advanced Charts would receive bars only from `runObservation()`'s released window. `getBars` in a
replay-scoped datafeed must clamp `to` to the clock's cursor and return `noData` beyond it;
`subscribeBars` is driven by clock ticks, never by a live provider. The chart gets no future bars, so
indicators stay look-ahead safe by construction. Autosave, resume, checksum and lifecycle remain in the
replay engine — the chart is a projection.

## 9. Drawing migration plan

Advanced Charts owns its own drawing model, so the two systems must not coexist permanently. Plan:
export current `DrawingStore` records to a neutral JSON schema (already close to one), write a one-way
importer into TV's `save/load adapter` keyed by `(user, layout, symbol, timeframe, session)`, run both
read-only side by side during the PoC, then retire our renderer in the same change that flips
production. Versioned rows, owner-isolated by RLS, cross-device via the existing persistence table.

## 10. Paper-trading overlay plan

Advanced Charts without Trading Platform exposes shapes + the `createOrderLine`-less public API only,
so our order/position layers would move to chart-native shapes where possible and otherwise to a DOM
overlay driven by TV's `chart().getTimeScale()` coordinate callbacks and visible-range subscriptions —
resynced on zoom, pan, resize, symbol change, timeframe change, fullscreen, replay and orientation.
Filled entry prices stay immutable; the chart never mutates order state, it only dispatches into
`orders/service.ts`.

## 11. Risks and blockers

1. **Blocker:** no Advanced Charts licence. Everything in Option B is gated on it.
2. Advanced Charts bundle is large and ships as static assets — needs Worker-safe static hosting.
3. Drawing migration is one-way; needs a rollback flag.
4. Overlay sync fidelity on mobile orientation change is the highest-risk unknown.

## 12. Sequence and blast radius

Stages 1–2 are this document. Stage 3 (isolated PoC route) is delivered licence-gated. Stages 4–13
remain unstarted and are contingent on the licence.

Modules that would eventually be affected: `src/lib/chart/*` (adapter, adapters, drawings, indicators,
storage, tv-loader), `src/lib/market-data/tv-datafeed.ts`, `src/components/chart/ChartEngine.tsx`,
`src/components/trading/TradingWorkspace.tsx` + `chart/*` overlays, `src/components/replay/studio/StudioChart.tsx`,
`src/components/journal/replay/ComparisonChart.tsx`, and drawing persistence under `src/features/replay/drawings/`.
Roughly 25–35 files; the production chart is not touched until parity is proven.
