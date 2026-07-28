
# Trading Workspace — Final Polish Sprint

Scope is polish and stabilization on the live workspace (`src/components/trading/TradingWorkspace.tsx`, its subcomponents, and `useTradingShortcuts`). No new features, no route or data-layer changes. Everything below is bounded to the workspace and its immediate helpers.

The audit surfaced one live-blocking bug worth fixing in this pass because it breaks the buy/sell journey:

- Runtime error `entry_price: Number must be greater than 0` on `openTrade`. Happens when a market order is submitted before the live quote lands (falls back to `entryNum = 0`). Fix in the order flow, not by adding features.

## Deliverables mapped to the 15 checkpoints

1. Toolbar Polish (`TradingWorkspace.tsx` toolbar row)
   - Introduce three semantic zones with `<Divider />` between: `[Symbol | Price]`  ·  `[Timeframe | Chart type | Indicators]`  ·  `[Plan | Screenshot | Shortcuts | Focus | Details]`.
   - Normalize icon sizes to `h-3.5 w-3.5`, button heights to `h-7`, gap `gap-1`.
   - Convert overflow-prone `flex flex-wrap` to `grid-cols-[minmax(0,1fr)_auto] sm:flex` per responsive rules; symbol/price cluster gets `min-w-0` + `truncate`, action cluster `shrink-0`.
   - No horizontal scroll on the toolbar down to 390 px; secondary text (name, bid/ask/spread badges) already hides at `xl:`; verify break at `md/lg`.

2. Tooltips (all icon-only buttons in toolbar, left rail, right icon rail)
   - Replace bare `title=` on Plan/Screenshot/Shortcuts/Focus/Details with `<Tooltip>` from shadcn (already wrapped in `TooltipProvider`), with a two-line body: name + shortcut kbd.
   - `LeftToolRail.tsx` and `RightIconRail.tsx`: wrap each icon `<button>` in `Tooltip` and add `aria-label` (right-side placement so it doesn't cover the rail).
   - Tooltip copy comes from a single map so the shortcut sheet and tooltips can't drift.

3. Timeframe UX
   - Replace the dropdown-only timeframe with an inline pill row `1m 5m 15m 1H` + `More ▼` for the rest (`30m 4H 1D 1W`), matching TradingView. Active pill uses `bg-primary/15 text-primary`, keyboard navigable with left/right arrows and Enter.
   - Preserve the dropdown as the `More` popover — no state model changes.

4. Indicator UX
   - Toolbar trigger renders `Indicators • N` when N>0, and a sub-count `SMC • M` chip when SMC active (M = enabled SMC parts).
   - Inside the dropdown, add a compact "Active (N)" section at top with per-indicator remove (×) buttons so users see and manage active items without hunting.
   - Grouping (Overlays / Oscillators / Sessions & Levels / SMC) already exists — keep, just tighten spacing.

5. Order Experience (`OrderPanel.tsx`, `TradePanel.tsx`, shortcuts)
   - Fix `entry_price: Number must be greater than 0`: in market orders, only submit when `livePrice ?? entryNum > 0`; if not, disable the CTA and show inline "Waiting for live price…" chip (no toast). Same guard in `TradePanel.tsx`.
   - Replace the two `toast.info("Buy side selected …")` / `toast.info("Sell side selected")` from `useTradingShortcuts` handlers with a persistent inline "Armed: BUY / SELL — Enter to submit, Esc to cancel" chip inside the OrderPanel header (driven by the existing `emitTradeIntent({kind:"focus_side"})` bus).
   - Enter already submits; add `Esc` on the panel to clear the armed side and blur the focused field.
   - `TabsList` Buy/Sell already color-codes; add `aria-pressed` on the active tab for AT clarity.

6. Chart Experience — verification pass (no new code unless a defect surfaces)
   - Confirm resize (ResizeObserver already installed), symbol switch, timeframe switch, indicator toggle, drawing hide (H), planner overlay, focus mode. Rely on existing screenshot flow.

7. Right Panel (`Trade | Journal | Notes | Playbook | Stats`)
   - Consistent tab spacing (`px-2 py-1 gap-1`), icon size `h-3.5 w-3.5`, labels visible from `sm:`.
   - Add loading states: journal/notes/stats use existing skeletons; add one to Playbook attach panel (empty text-only placeholder today).
   - Empty states: each tab must answer "why empty / what to do next" with one primary CTA. Trade → "Waiting for a paper account" + `Create account`. Journal → "No entries yet for {symbol}" + `Log this session`. Notes → "Jot ideas that stay pinned to this symbol" + focus textarea. Playbook → existing text becomes an EmptyState card with `Browse playbooks`. Stats → "Trade to see today's stats" + `Focus Buy`.

8. Keyboard UX
   - Move the shortcut list into a single `WORKSPACE_SHORTCUTS` const in `useTradingShortcuts.ts` used by both `useTradingShortcuts` and the shortcuts help pop (no drift).
   - Show a one-time hint "Press ? for shortcuts" toast (using persisted flag `hive.hint.shortcuts.seen` in localStorage) on the third workspace visit, then never again.
   - Verify `Ctrl/⌘+Enter` submit hint appears in the sheet (already listed).

9. Focus Mode
   - On enter, show a one-time toast "Focus Mode enabled — Esc or F to exit" via `toast.custom` with `hive.hint.focus.seen` flag; the persistent center pill (already present) remains.

10. Empty States — see item 7 for right-panel; also update `PositionsTable`, `OrdersTable`, `HistoryTable`, `WatchlistPanel` fallbacks to the standard `EmptyState` component from Sprint 2 (they currently render bare rows or blank).

11. Responsive Audit
    - Verify at 390 / 768 / 1024 / 1440. Concrete fixes expected: at 390 collapse right rail to icon-only trigger (already does at `md:`), verify bottom Tabs uses `overflow-x-auto no-scrollbar` (already), ensure `TradePanel` grid gap doesn't overflow.
    - Toolbar row uses grid at mobile, flex from `sm:` per responsive-layout knowledge.

12. Accessibility
    - Every icon-only button in the workspace (`LeftToolRail`, `RightIconRail`, toolbar action cluster, right-panel collapse, resize handle) gets `aria-label`.
    - `AlertsDialog` and any other `Dialog` used from the workspace: confirm `DialogTitle` + `DialogDescription`; add `VisuallyHidden` where the title is intentionally hidden.
    - Add visible focus ring: `focus-visible:ring-2 focus-visible:ring-primary/60` on toolbar buttons and tab triggers.
    - Tooltip content uses `<TooltipContent side="bottom" role="tooltip">` implicit via Radix.

13. Performance (low-risk only)
    - Memoize `activeIndicatorCount`, `indicators`, `openHere` (already `useMemo`, verify deps).
    - Move the two `useEffect`s that call `update()` for prefs into a single debounced effect (100 ms) so rapid toggles don't storm localStorage.
    - Remove the unconditional `refetchInterval: 4000` when the tab is hidden using `document.visibilityState` guard via `refetchIntervalInBackground: false`.

14. Production Cleanup
    - Remove `console.warn` in `paper-trading/context.tsx` and `ChartEngine.tsx` (replace with silent toast on user-visible failures only).
    - Drop the unused `activeTool`/`onToolChange` in `ChartToolbar` `Props` (workspace no longer wires them).
    - Remove the empty-hint "coming in next phase" toasts from `useTradingShortcuts` (`R`, `C`) — keep no-op or wire to existing planner cancel; either way, no `toast.info("coming in next phase")` in production.
    - Prune the `Chip P L I B 3 1` decorative row in `ChartToolbar.tsx` (dead placeholder, not wired).
    - Delete `src/components/chart/TradePanel.tsx` if unreferenced by the shipped workspace (check imports; the live route uses `OrderPanel`).

15. Final QA
    - Rerun the Playwright pass at 390 / 768 / 1440, screenshot each viewport, and confirm: chart canvas non-transparent pixels > 0 for BTC/USDT; Buy/Sell submit succeeds with `entryNum > 0`; Esc clears armed side; `?` toggles help; `F` toggles focus; no console errors, no unmet-a11y warnings.

## Files changed (planned)

- `src/components/trading/TradingWorkspace.tsx` — toolbar zones, tooltips, timeframe pills, indicator chip label, armed-side chip, focus/shortcut hints, a11y labels, debounced prefs writer, empty-state wiring, cleanup.
- `src/components/paper-trading/OrderPanel.tsx` — market-order guard on `entryNum`/`livePrice`, inline armed chip, Esc handler, focus ring.
- `src/components/chart/TradePanel.tsx` — same market-order guard (in case still referenced); otherwise delete after import check.
- `src/components/chart/ChartToolbar.tsx` — remove dead `Chip` row, drop unused props.
- `src/components/chart/LeftToolRail.tsx`, `RightIconRail.tsx` — Tooltip wrappers + `aria-label`.
- `src/components/paper-trading/PositionsTable.tsx`, `OrdersTable.tsx`, `HistoryTable.tsx`, `WatchlistPanel.tsx` — standardized `EmptyState`.
- `src/hooks/useTradingShortcuts.ts` — single source-of-truth shortcut map, remove no-op toasts.
- `src/hooks/use-workspace-prefs.ts` — debounced write.
- `src/components/paper-trading/context.tsx`, `src/components/chart/ChartEngine.tsx` — drop `console.warn`.

## Explicitly out of scope

- Any Replay Studio changes (next sprint).
- Right-rail information architecture (already re-done in Sprint 1).
- Data-provider or market-engine changes (owned by chart-loading sprint).
- New charts, drawings, indicators, or panels.
- Any Supabase schema / migration work.

## Deliverables at end of sprint

1. Updated UX score (/100) and comparison to the 74/100 baseline.
2. Files-changed list.
3. Improvements completed (checkbox map to the 15 items above).
4. Remaining issues (if any) and whether they block beta.
5. Post-beta candidates (things intentionally deferred).
6. Explicit recommendation: "Trading Workspace Ready for Closed Beta" — only if the QA pass is clean at all four viewports with zero console errors.

Ready to ship this on approval.
