# Stabilization Sprint Plan

Scope: no new features. Resolve every Critical and High issue from the last QA report, then re-audit. Work is grouped into waves so each wave can ship and be verified independently. No redesign — only fixes and polish on the existing implementation.

## Wave 1 — Release Blockers (Critical)

**C1 — Locale-safe number/date formatting**
Audit every `toLocaleString`, `toLocaleDateString`, `Intl.NumberFormat`, and `Intl.DateTimeFormat` call. Force `"en-US"` locale (or a shared `APP_LOCALE` constant) and safe options. Add helpers `formatNumber`, `formatCurrency`, `formatPercent`, `formatDate`, `formatDateTime` in `src/lib/format.ts` and migrate call sites. Prevents `RangeError` on non-EN browser locales.

**C2 — Hydration / SSR mismatches**
Replace `typeof window` guards inside `useState` initializers with `useEffect` reads or a `useHydrated()` hook (theme, sidebar collapsed state, saved symbol, replay settings). Ensures server HTML matches first client render.

**C3 — Invalid DOM nesting**
Fix `<a>` inside `<a>`, `<button>` inside `<button>`, `<div>` inside `<p>`, and hydration-breaking `<Link asChild>` patterns flagged across shell, cards, and tables.

**C4 — Recurring `listFeed` server-function 500** (visible in current runtime error log)
Wrap `listFeed` in `src/lib/community.functions.ts` in the standard `handleServerFnError` guard, return an empty page on empty auth/state instead of throwing, and add a `notFound`/empty component in the community route.

**C5 — Silent failures**
Standardize all `catch { /* noop */ }` blocks in server-fn call sites to route through `toast.error(getFriendlyError(e))`. No swallow.

**C6 — Market-data provider status consistency**
Single source: `marketData.health()`. Remove duplicate polling in `ProviderStatusStrip` and `MarketStatusBadge`. Show `connecting` distinctly from `error`.

**C7 — Loading state correctness**
Every `useQuery`-backed panel: use `isPending` (not `!data`) so cached data doesn't flash skeletons; every loader route: real skeleton components instead of `h-24 animate-pulse` blocks with wrong aspect.

## Wave 2 — Replay Engine audit

Verify each capability against `src/components/replay/*` and `src/lib/replay*`:
Start / Pause / Resume / Replay Again / Save / Resume / Navigation / Fast-Forward / Chart Nav / Trade Exec / Position Mgmt / Netting / Hedging / Pending Orders / SL / TP / Break-Even / Trailing Stop / Partial Close / Reverse / History / Analytics / AI Review / Trade Details integration / Analytics propagation.

For each: reproduce, fix regression, add a unit test where math is involved (partial-close weighted avg, BE trigger, trailing distance, reverse-nets vs hedges).

## Wave 3 — Paper Trading audit

`src/lib/paper-trading/*` + `src/components/paper-trading/*`:
execution, lifecycle transitions, persistence across refresh, margin/stop-out/negative-balance rules, PnL magnitude, Analytics propagation (invalidate `['analytics']` on close), Trade Details integration.

## Wave 4 — Analytics accuracy

Validate `src/lib/statistics/calculations.ts`:
Win Rate, Gross/Net PnL, RR realized/planned, Profit Factor, Expectancy, Max/Peak DD, MFE, MAE, Trade Count, Session/Symbol/Replay/Championship/Backtest groupings. Add snapshot tests with a fixed fixture set. Ensure `queryClient.invalidateQueries({ queryKey: ['analytics'] })` fires on every write path (paper close, replay finish, championship trade).

## Wave 5 — UI/UX polish (no redesign)

Spacing/alignment/typography audit against existing tokens. Empty states via a new shared `<EmptyState/>`. Consistent skeletons. Hover/focus states on every interactive element. Dark-mode contrast pass. Mobile pass on Trading Workspace, Replay, Analytics.

## Wave 6 — Performance

Virtualize History and Journal tables (`@tanstack/react-virtual`). Memoize heavy chart series builders. Batch replay tick updates already in place — verify no leaks on unmount. Audit `useEffect` deps for infinite loops. Add `React.memo` on `PositionsTable` rows, `LeaderboardTable` rows, `FeedList` items.

## Wave 7 — Accessibility

Single `<main>` per page. Heading levels sequential. `aria-label` on every icon-only Button. Focus-visible rings. Radix primitives instead of custom widgets where custom widgets fail axe. Color-token audit (no `text-gray-*`).

## Wave 8 — Consistency

Terminology sweep: Analytics / Replay Studio / Paper Trading / Championships / Trades / Journal / AI Coach. Rename stray "Statistics", "Backtest Studio", "Tournament" strings across nav, buttons, dialogs, toasts.

## Wave 9 — Final QA

Re-run: static review + live smoke test of all 17 top-level routes, console + pageerror capture, axe-core pass, mobile viewport pass. Deliver a final release report with Resolved / Remaining / Known Limitations / Perf notes / A11y summary / Production Readiness score.

## Notes / constraints

- No new features. Fixes only; small additive helpers (`format.ts`, `useHydrated`, `EmptyState`) are allowed.
- Untouched modules per prior instructions: Authentication, Landing, Dashboard content, Paper Trading behavior (fix bugs only), Journal, Challenges, Statistics math (fix bugs only).
- Each wave ships independently. I will pause for your confirmation between waves so you can review the diff before I move on.

## Deliverables per wave

Wave 1 first: a single PR-sized batch resolving all Critical items above, with the recurring `listFeed` 500 gone, no hydration warnings on any of the 17 routes, and locale-safe formatting sitewide. Then I stop and hand over for review before starting Wave 2.
