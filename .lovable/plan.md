## Direction

Linear-inspired modern minimal: denser information, hairline borders, restrained color (accent only on active/positive/negative), tabular numerics, generous line-height in body copy, quiet motion. Existing dark/light tokens stay; a few tokens tighten (border opacity, surface elevation, focus ring).

## Global shell (foundation)

- `src/styles.css`: tighten `--border` to a lower-contrast hairline, add `--surface-1/2/3` elevation tokens, unify `--radius` to 10px, add `.mono-nums` utility (`font-variant-numeric: tabular-nums`), refine focus ring to 2px `--ring` with 2px offset, add `.hairline` utility for 1px borders that adapt to theme.
- `src/components/layout/app-shell.tsx`: convert the sidebar to `collapsible="icon"` behavior with a persistent icon rail on mobile via off-canvas `Sheet`; add a compact top bar that stacks (search collapses to icon on <sm). Add `safe-area-inset` padding.
- `src/components/layout/topbar.tsx`: single-row on mobile with icon-only actions ≥44px; breadcrumb truncates with `min-w-0` + `truncate`.
- Add a shared `PageHeader` primitive (title, description, actions slot) used across Journal/Analytics/Trading for consistent hierarchy.

## Journal module

- List page (`_authenticated/journal.tsx`): 
  - Filters bar becomes a single-line, horizontally scrollable chip strip on mobile with a "Filter" sheet for advanced options.
  - `TradeCard` grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`, tighter padding, hairline border, R-multiple rendered in mono, position-type dot instead of full badge on mobile.
  - `TradeTable`: sticky header, condensed rows (h-11), hidden secondary columns below `md`, click row → details.
  - Calendar/Timeline: mobile switches to a stacked list variant.
- Details (`journal.$entryId.tsx`): two-column on `lg:` (chart + summary | psychology + notes), single column on mobile with a sticky action bar (Edit / Back). Trim card chrome; use hairlines.
- `ManualEntryDialog`: convert to `responsive-dialog` (drawer on mobile), section stepper stays but becomes a top segmented control that scrolls horizontally on narrow.

## Trading Workspace

- `ChartWorkspace.tsx`:
  - Below `md`: hide `LeftToolRail` and `RightIconRail`, expose them via a bottom action bar + off-canvas `Sheet`s.
  - Right panel becomes a bottom sheet on mobile; on tablet it collapses to icon rail by default.
  - Bottom tabs collapse to a swipeable tabbed sheet on mobile.
  - Toolbar wraps into two rows on `<lg` with symbol/timeframe pinned left, tools scrolling right.
- `ChartToolbar`, `ChartInfoBar`: tabular-nums, hairline dividers, remove drop-shadows.
- `Watchlist` / `TradePanel`: full-width on mobile inside the sheet, condensed rows.

## Analytics Center

- Filters bar → sticky, horizontally scrollable on mobile.
- `KpiGrid`: `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`, KPI tiles use hairline border, mono numerics, tiny sparkline aligned right.
- Charts: constrain heights with `aspect-video`/`aspect-[5/2]` so they scale; legend wraps.
- Group tables + reports: horizontal scroll wrapper with sticky first column on mobile.
- Behavioural / Risk panels: single-column stack < `lg`, two-column ≥ `lg`.

## Accessibility pass (all scopes)

- All icon-only buttons get `aria-label`.
- Replace `h-screen` with `h-dvh` in workspace/details layouts.
- Ensure tap targets ≥44×44 on primary actions (`min-h-11 min-w-11` on icon buttons in bars).
- Focus-visible ring on every interactive element (via updated token).
- Landmarks: exactly one `<main>` per route (verify shell wraps `<Outlet />`).
- Color-only signals get an icon (win/loss arrows already present — extend to session badges).

## Technical notes

- No business-logic changes; presentation only.
- No new dependencies; reuse `sheet`, `drawer`, `responsive-dialog`, `Sidebar`.
- Motion stays subtle: 150–200ms ease-out on hover/enter; no layout animations that could re-trigger the earlier `AnimatePresence` crash.
- Tokens edited in `src/styles.css` under existing `:root` / `.dark` blocks; no `tailwind.config.js` (v4 CSS-first).
- Verification: `tsgo`, then Playwright screenshots at 375/768/1280 for Journal list, Journal details, Trading workspace, Analytics center.

## Out of scope

Auth, Landing, Dashboard, Paper Trading engine, Challenges, and any backend/RLS changes — untouched per project rules.