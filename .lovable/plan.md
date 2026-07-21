## Responsive & Mobile UX Sprint

Scope: refine responsiveness and mobile UX only. No new features, no redesigns. All existing desktop layouts preserved at `md`+ breakpoints.

### Wave 1 — Foundations (shared primitives)
- `src/styles.css`: add safe-area utilities (`safe-top`, `safe-x`), fluid type helpers, and `min-h-touch` (44px) utility. Ensure body avoids horizontal overflow (`overflow-x: hidden` on `html, body` with guarded exceptions).
- `src/components/layout/app-shell.tsx` + `topbar.tsx`: sticky top with safe-area padding, larger tap targets on mobile bottom nav, hide desktop-only chrome under `md`.
- New `src/components/ui/responsive-table.tsx` helper: renders `<table>` on `md+`, stacked cards on mobile. Use in high-traffic tables (Positions, Orders, History, Trades, Leaderboard, Admin lists).
- New `src/components/ui/inline-search.tsx`: expandable icon→input with autofocus + collapse-on-blur-if-empty. Replaces command-palette trigger on mobile (desktop keeps ⌘K).

### Wave 2 — Trading Workspace (`/trading`)
- `TradingWorkspace.tsx`: on mobile, single-column with chart-first (fixed ~55vh), collapsible bottom sheet for Positions/Orders/History (BottomTabs), and a floating "Trade" FAB opening `TradePanel` as a Sheet. Watchlist becomes a horizontal ribbon at top. Toolbar collapses non-essential tools into an overflow menu.
- `LeftToolRail.tsx`: hide on mobile; expose via toolbar overflow.
- `RightIconRail.tsx`, `ChartInfoBar.tsx`, `ChartToolbar.tsx`, `BottomTabs.tsx`: compact spacing under `sm`, scrollable tab strip, sticky action bar with safe-area.
- `OrderLinesOverlay`: enlarge drag hit-areas on touch.

### Wave 3 — Journal add/edit
- `ManualEntryDialog.tsx` + `JournalDrawer.tsx` + `NotesEditor.tsx`: full-screen Sheet on mobile, sticky Save/Cancel footer with safe-area, larger textareas (min-h 40vh), field spacing, image upload button sized to 44px, `enterKeyHint`/`inputMode` on inputs.

### Wave 4 — Search
- Swap search-icon triggers in `topbar.tsx` and relevant pages to `InlineSearch`. Preserve global command palette on `⌘K`.

### Wave 5 — Battle Arena
- `battle-arena.tsx` grid → single column on mobile. `LiveScoreboard`, `LiveLeaderboard`, `ParticipantsList` use `responsive-table`. `BattleChat` becomes a bottom sheet on mobile with sticky composer. `LiveBattleHeader` stacks; countdown wraps.

### Wave 6 — Page-by-page responsive polish
Adjust padding/grid columns, table→card, sticky headers, safe-area for:
- Dashboard, Analytics (all sub-routes), Replay Studio (chart+HUD stacking, controls as bottom sheet), Paper Trading legacy screens, Trade Details, Trades, Championships (leaderboard cards), AI Coach, Achievements, Community (composer + feed), Leaderboards, Settings, Login/Register/Auth, Admin shell.
- Standard fixes per page: `p-4 md:p-6`, `grid-cols-1 md:grid-cols-*`, `text-2xl md:text-3xl`, `min-w-0` + `truncate` on flex text children, `shrink-0` on icons.

### Wave 7 — Modals/Drawers/Forms consistency
- Ensure every shadcn `Dialog` used for input flows switches to `Sheet side="bottom"` on mobile (via `useIsMobile`). Sticky footers, scrollable body, `max-h-[90dvh]`.
- Standardize form spacing (`space-y-4`), 44px inputs on mobile, `aria-*` intact.

### Wave 8 — Charts
- Confirm zoom/pan/crosshair usable on touch: enable `handleScroll.touch` + `handleScale.pinch` in `lightweight` adapter. Compact chart toolbar under `sm`.

### Wave 9 — Verification
- Playwright screenshots at 320, 375, 414, 768, 1024, 1440 for: `/trading`, `/journal`, `/battle-arena`, `/dashboard`, `/analytics`, `/replay`, `/community`, `/leaderboards`, `/settings`.
- Typecheck + verify no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).

### Technical notes
- Reuse `useIsMobile()` hook; do not add new state libs.
- Only touch presentation/layout code. No changes to server functions, schemas, business logic, or Auth/Landing/Dashboard data logic.
- Keep desktop layouts byte-identical at `md`+ where possible (all changes gated by mobile-first classes).

### Deliverable
Concise summary of pages/components changed, remaining known issues, and screenshot evidence.
