
# Platform-Wide Polish Audit

A single-pass polish sweep across TradersHIVE. No new features — only consistency, theme correctness, accessibility, and code hygiene.

## Scope

Ship in **4 sequential batches** in one turn each. Each batch is self-contained and safe to merge independently.

### Batch 1 — Design tokens & theme correctness (highest leverage)
- Sweep `src/**/*.{tsx,ts}` with `rg` for hardcoded colors: `text-white`, `text-black`, `bg-white`, `bg-black`, `bg-gray-*`, `text-gray-*`, `border-gray-*`, `text-green-*`, `text-red-*`, `bg-slate-*`, hex literals `#[0-9a-f]{3,8}`, and `rgba(`. Replace with semantic tokens (`text-foreground`, `bg-card`, `bg-muted`, `text-success`, `text-danger`, `border-border`, etc.).
- Audit `src/styles.css` — verify all semantic tokens (`--success`, `--warning`, `--info`, `--danger`) render legibly in both themes; bump muted-foreground contrast in dark mode to hit WCAG AA (currently 0.7 lightness → target ≥ 0.72).
- Add missing dark-mode surface tokens for tables, heatmaps, chart gridlines, and skeletons where components use bare grays.
- Fix chart libraries that read hardcoded `#fff` / `#000` — inject CSS-var-driven color from `getComputedStyle(document.documentElement)`.

### Batch 2 — Accessibility & consistency polish
- Icon-only buttons: audit `<Button size="icon">` occurrences and add `aria-label` where missing (topbar, chart rails, close buttons on dialogs/toasts).
- Focus states: verify `:focus-visible` ring uses `--ring` token and is visible in both themes (already in `styles.css` base — check components that override).
- Consistent border-radius: unify ad-hoc `rounded-xl` / `rounded-2xl` / `rounded-[10px]` on cards to project's `rounded-2xl` (matches `--radius`).
- Standardize animation duration to `duration-200` / `duration-300` — remove one-off `duration-500`+ on interactive elements.
- Ensure every `<Skeleton>` uses `bg-muted` (auto-themes) instead of `bg-gray-200`.
- Single `<main>` per route — verify no duplicate landmarks.

### Batch 3 — Empty / error / loading state polish
- Create shared `<EmptyState>` component (`src/components/common/EmptyState.tsx`) with icon + title + description + optional action, using semantic tokens.
- Replace inline "No X yet" strings across Journal, Battle Arena, Community, Championship, Replay Library, Statistics with the shared component.
- Standardize error toasts on `showError()` from `src/lib/client-errors.ts` (already exists — sweep remaining `catch { toast.error("...") }` sites).
- Ensure every route with a loader has both `errorComponent` and `notFoundComponent`; add missing ones using a shared `<RouteError>` + `<RouteNotFound>` in `src/components/common/`.

### Batch 4 — Code hygiene & performance
- Run `tsgo` and fix any warnings surfaced.
- `rg` for unused imports flagged by ESLint, prune.
- Memoize the two known re-render hotspots: `TradingWorkspace` overlay lists and `LiveScoreboard` participant rows.
- Verify heavy routes (`/replay/*`, `/trading`, `/admin/*`) are already code-split by TanStack file-based routing — no change needed unless bundle audit flags a specific eager import.
- Remove dead files identified by `rg` orphan scan (e.g. `OrderLinesOverlay.tsx` if fully replaced by `PositionLinesLive.tsx`).

## Out of scope
- No workflow / IA changes.
- No new features, routes, DB migrations, or server functions.
- No changes to Authentication, Landing, Dashboard business logic, Paper Trading engine, Journal logic, Challenges, or Statistics calculations — presentation-layer only where those pages appear.

## Deliverable
A final report listing: pages reviewed, components touched, hardcoded colors replaced (count), a11y fixes (count), empty/error states standardized, dead files removed, remaining known debt.

## Confirm to proceed
Reply **"go"** (or "go batch 1", "go all") and I'll ship Batch 1 immediately, then continue sequentially. Each batch = one message with all edits in parallel.
