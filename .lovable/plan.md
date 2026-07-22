# Responsive Design System — Full-App Rework

This is an architecture change, not a page-by-page patch. We introduce one system, then migrate every route to use it.

## 1. Foundation — Design Tokens & Breakpoints

Add to `src/styles.css` under `@theme`:

```text
Breakpoints (Tailwind screens)
  xs   → 375px   Mobile Small / Standard phones
  sm   → 480px   Mobile Large / Phablet
  md   → 768px   Tablet Portrait
  lg   → 1024px  Tablet Landscape / Small Laptop
  xl   → 1280px  Laptop
  2xl  → 1536px  Desktop
  3xl  → 1920px  Large Desktop / Ultrawide
```

Fluid tokens (CSS `clamp()`):
- Typography scale: `--text-xs` … `--text-3xl` all fluid
- Spacing scale: `--space-1` … `--space-10` fluid
- Container padding: `--pad-page` = `clamp(0.75rem, 2vw, 2rem)`
- Radius, shadow: already unified — keep

## 2. Layout Primitives (new)

New shared components under `src/components/layout/`:

- `PageContainer` — replaces every ad-hoc wrapper; applies fluid page padding, max-width, and safe-area insets. Every route mounts inside it.
- `ResponsiveGrid` — auto-fit CSS grid (`repeat(auto-fit, minmax(var(--min), 1fr))`) with `min` prop; kills all fixed-column grids that break on tablet.
- `Stack` / `Cluster` — vertical / wrap-flex primitives with responsive gap tokens.
- `SplitPane` — two-column layout that stacks below a configurable breakpoint (default `lg`); used by Trading, Replay, Analytics detail, Journal detail.
- `SectionHeader` — standard title + actions row with `grid-cols-[minmax(0,1fr)_auto]` + `sm:flex` pattern (from responsive-layout rules), used everywhere instead of hand-rolled headers.
- `ScrollArea` wrapper for tables/timelines so nothing produces page-level horizontal scroll.

## 3. Component Audit & Fixes

Global rules applied via find-and-replace + primitive adoption:
- Remove all `w-[NNNpx]` fixed widths on panels; convert to `min-w-0 flex-1` or grid `minmax(0,1fr)`.
- Every text container gets `min-w-0`; every icon/avatar gets `shrink-0`; every single-line heading gets `truncate`.
- All Dialogs → responsive: full-screen sheet on `< md`, centered dialog on `≥ md` via a shared `ResponsiveDialog`.
- All Tables → wrap in `ScrollArea` OR convert to card list on `< md` via new `DataList` fallback.
- All Toolbars → `flex flex-wrap` with `gap-2` and consistent `min-h-touch` (44px) targets.
- Charts → parent-sized (`ResizeObserver`), never fixed `height`.

## 4. Trading Workspace (highest priority)

Rebuild layout as a true responsive grid, not stacked-vs-side-by-side flip:

```text
< md  (phone)   : chart 55vh, tabs [Trade | Watchlist | Positions] below
md–lg (tablet)  : chart + collapsible Trade panel (240px) side-by-side, watchlist as bottom drawer
≥ lg  (laptop+) : chart | Trade panel | Watchlist rail | bottom Positions
≥ 2xl           : add MultiChartStrip + AI panel column
```

Buy/Sell always visible from `md` upward. Bottom dock stays only on `< md`.

## 5. Migration Waves

Wave A — Foundation (tokens, primitives, ResponsiveDialog, DataList, ScrollArea wrappers). No visual change yet.

Wave B — High-traffic routes: Trading Workspace, Analytics Center, Journal, Paper Trading, Dashboard.

Wave C — Replay Studio, Championships, Battle Arena, Community, AI Coach.

Wave D — Achievements, Settings, Admin, Auth polish, Landing sanity check.

Wave E — QA sweep at 320 / 375 / 390 / 414 / 768 / 820 / 1024 / 1280 / 1440 / 1920 via Playwright screenshots; fix any residual overflow/clip.

## 6. Guardrails

- Add an ESLint rule / doc note forbidding raw `w-[Npx]` and `min-w-[Npx]` outside `src/components/layout/`.
- Add a Storybook-less "responsive playground" route `/dev/responsive` (dev-only) listing every primitive at each breakpoint for regression checks.
- Do NOT touch: Auth flow logic, Landing copy, Dashboard data wiring, Paper Trading engine, Journal data model, Challenges logic, Statistics math — layout only, per prior constraints.

## Technical Notes

- Tailwind v4: breakpoints declared via `@theme` custom `--breakpoint-*` tokens; fluid type via `--text-*: clamp(...)`.
- Primitives are presentational only — no data fetching, so migration is mechanical.
- Estimated file touches: ~6 new primitives, ~40 route/component edits, 1 styles.css update.
- No DB changes, no server function changes.

Reply "go" to start with Wave A, or tell me to reorder waves / drop routes.
