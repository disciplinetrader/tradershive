## Goal

Refine the existing dark theme across the whole app — no visual redesign, no logic changes. Tighten spacing, typography, contrast, focus states, motion, and mobile layouts so every screen feels closer to Linear/Vercel quality.

## Scope (all three selected)

1. Trading Workspace (chart, order panel, positions/orders tables, mobile dock)
2. Dashboard & Navigation (app shell, topbar, sidebar, dashboard cards)
3. Whole‑app sweep (shared primitives that propagate everywhere)

Explicitly untouched per project rules: Authentication, Landing, Journal business logic, Challenges rules, Statistics math, Paper Trading engine, backend, DB.

## Work items

### A. Design tokens & primitives (propagates everywhere)
- Audit `src/styles.css`: normalize surface elevations (bg / card / popover / muted), border tokens, focus ring token (3px `--ring` with proper offset), radius scale.
- Add motion tokens (`--ease-standard`, `--dur-fast/med`) and standardize hover/press transitions.
- Replace stray hardcoded colors (`text-white`, `bg-black`, hex) found in components with semantic tokens.

### B. Accessibility pass
- Add `aria-label` to every icon-only Button across chart toolbar, right rail, left rail, topbar, sidebar triggers, table row actions.
- Ensure single `<main>` per route (root layout only); remove duplicates found in scan.
- Focus-visible ring on all interactive elements via a shared utility; keyboard-reachable table rows and cards (`role="button"`, `tabIndex=0`, Enter/Space handlers) where missing.
- Bump `size="icon"` primary tap targets to `min-h-11 min-w-11` on mobile.
- Swap `h-screen` for `h-dvh` in full-height layouts (workspace, replay, chart).
- Placeholder + muted text tokens over arbitrary `text-gray-*`.

### C. Responsiveness
- App shell: collapsible sidebar behavior on tablet, off-canvas on mobile with persistent trigger in topbar.
- Trading Workspace: verified stack order on <md (chart → tabs → order panel drawer), safe-area padding, sticky mobile trade dock polish.
- Header rows across modules use the `grid-cols-[minmax(0,1fr)_auto]` + `min-w-0` + `shrink-0` pattern to survive narrow widths.
- Tables get horizontal scroll containers with sticky first column where useful (Positions, Orders, History, Leaderboards, Analytics group tables).
- Dashboard cards reflow to single column with reordered priority on mobile.

### D. Modern polish
- Consistent card treatment: subtle border, `bg-card/60` + backdrop blur on layered surfaces, tighter internal padding scale.
- Typography scale tightened (display / h1 / h2 / body / caption) and applied to page headers.
- Micro-interactions: 120–180ms ease-out on hover/press, gentle scale (0.98) on primary buttons, fade-in on route transitions already in place — standardize durations.
- SegmentedTabs, KPI tiles, badges: unified radius and hover state.
- Empty states across modules get a consistent illustration slot + primary CTA pattern.

### E. Verification
- `tsgo` typecheck.
- Playwright screenshots at 375, 768, 1280, 1600 widths for: `/dashboard`, `/trading`, `/analytics`, `/journal`, `/leaderboard`, `/replay`.
- Spot-check keyboard nav (Tab order, focus rings) and axe-style manual pass on the same routes.

## Non‑goals

- No new features, no route changes, no schema changes.
- No palette shift — same brand blue `#3B82F6` / success `#22C55E` on `#0A0F14`.
- No component library swap; stays on shadcn + Tailwind v4.

## Risk

Whole-app sweep touches many files. Mitigation: land token + primitive changes first (biggest leverage, smallest diff), then module-by-module in the order Trading → Navigation/Dashboard → remaining modules. Each module verified before moving on.
