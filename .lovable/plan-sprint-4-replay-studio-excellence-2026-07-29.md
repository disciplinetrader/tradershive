# Sprint 4 — Replay Studio Excellence

## Mission

Turn Replay Studio into the deliberate-practice engine of TradersHIVE. Every replay should teach something. Focus is simplify, polish, integrate — not expand.

## Current state (audit)

- Creation dialog already single-page (`CreatorWizard`) with recents, prefs, preload. Solid, but slow feeling: two "Surprise Me" buttons, "Start Position" hidden as `<select>` at bottom, preload runs on click (adds 1–3s before nav), no session-length preset (1h / 1 day / 1 week), no "Resume last" hint.
- Session route (`replay.session.tsx`) is already 3-tab (Trade / Journal / Review), floating auto-hide controls, slim timeline, HUD. Good structural baseline.
- Persistence gaps: `speed`, `sideOpen`, `sideTab`, `controlsVisible` all local state — lost on reload. Cursor is server-persisted (`cursor_ts`) but chart zoom / indicators / sidebar are not.
- Controls: rich but noisy — two dropdown menus + checkpoint menu compete for space; keyboard help covers only 7 shortcuts but engine supports more (`+ / -` for speed, `f` for FF, `s` for snapshot are missing).
- HUD is dense but has no floating-PnL change flash and no session-progress bar next to counters.
- PostSessionSummary shows 9 metrics + AI panel, but no "top mistake / top strength / next step" callout — the mission's "one recommended next step" is missing.
- AI Coach is manual (button in summary). No triggers on repeated mistakes or rule violations.
- Loading state is a raw `animate-pulse` block — no skeleton chart, no session metadata visible while candles fetch.
- Snapshot upload uses public `signedUrl` fetch pattern; fine, but not shareable via a lightweight replay link.

## Top 25 UX improvements

1. Add a first-row **"Resume [symbol] · [progress %]"** banner on `/replay` when an active session exists — 1 click back into practice.
2. Reorder CreatorWizard: Symbol → Timeframe → Range → Balance → Start (advanced collapsible).
3. Session-length presets in creator: `1h`, `4h`, `1 day`, `1 week`, `Custom` — auto-fill `from`/`to` for common cases.
4. Show a **"~12s to load"** hint next to Start Backtest based on candle count estimate.
5. Move preload to run in background after nav (skeleton on session page), so creation feels instant.
6. Skeleton chart with session metadata + progress bar on `/replay/session` while candles load, instead of blank pulse block.
7. Replay HUD floating-PnL: flash green/red on change (reuse `FlashCell` from `blotter-shared`).
8. Add a subtle mini-progress bar under HUD showing `cursorIdx / total`.
9. Collapse ReplayControls checkpoint + jump-to menus into a single **"Navigate"** menu (grouped headers) — reduces top-row density.
10. Add speed `+`/`-` keyboard shortcuts and surface in help sheet.
11. Add `s` snapshot, `f` fast-forward-to-next-trade shortcuts.
12. Timeline: show session-band tint (Asia / London / NY) so context is glanceable.
13. Timeline: right-click on bar → "Bookmark here" without leaving keyboard flow.
14. Post-session: prepend a single **"Next step"** callout above metrics — one sentence pulled from AI debrief or heuristic fallback.
15. Post-session: highlight **biggest strength** and **key mistake** as chips before the metrics grid.
16. Post-session: replace 3×3 metric grid with 2 tiers — hero (Net PnL, Win Rate, Grade) then compact secondary row.
17. Auto-open Post-session when replay reaches end (progress == 100%), not just on Finish click.
18. Empty state on `/replay/library` — "No sessions yet. Create your first backtest in 20 seconds" with primary CTA.
19. In-session Rule reminder toast when a trade violates the checklist (uses existing `ChecklistPanel` data).
20. Reflection prompt when pausing >60s: subtle "Why did you pause?" chip in HUD, one-tap dismiss.
21. Add ⌘K palette scoped to replay: "Bookmark here", "Add note", "Jump to London Open", "Finish session".
22. Move Snapshot button into the top-toolbar overflow — reduce chrome on chart.
23. Persist `sideOpen`, `sideTab`, `speed` per user in `localStorage` under `replay.workspace.prefs.v1`.
24. Add tooltip with clock time to Timeline hover (already partial — extend with candle count remaining).
25. Standardize icon-only buttons in Replay to include `aria-label` + Tooltip (audit found 3 missing).

## Top 10 workflow improvements

1. Session-length presets (creation).
2. Background preload after nav (instant nav feel).
3. Auto-open Post-session on completion.
4. Persist workspace prefs (speed, side panel, tab).
5. Command palette (⌘K) with replay verbs.
6. Rule-reminder toast on checklist violation.
7. "Resume last" tile on `/replay`.
8. Reflection prompt after long pause.
9. Consolidated Navigate menu (checkpoints + jumps).
10. Bookmarks quick-add from timeline right-click and `m` shortcut.

## Top 10 performance improvements

1. Memoize `tradeMarks` / `bmMarks` in ReplayTimeline with dependency on `candles.length` + last-timestamp, not full arrays.
2. Move floating-PnL calc in HUD into a `useMemo` keyed on `[price, openTrades.length, openTrades map of entry_price]`.
3. Defer candle-array recomputation for `visibleCandles` slice with `useMemo` keyed on `cursorIdx` (currently recomputed every render).
4. Split `ReplayProvider` into 3 contexts (candles, trades, ui) so tab UI toggles don't re-render chart.
5. Debounce localStorage writes for workspace prefs (150ms, like blotter).
6. Preload candles concurrently while creating session row (parallel await).
7. `IntersectionObserver`-gate right-rail queries (notes, screenshots) — only fetch when expanded.
8. Pause playback timer when `document.hidden` (already done for polling elsewhere — add here).
9. Convert marker JSX in Timeline from N `<div>` per trade to a single SVG with `<use>` refs — cheaper for 100+ trades.
10. `keepPreviousData` on `getReplaySessionSummary` in Post-session dialog to prevent shimmer between refetches.

## Top 10 accessibility improvements

1. `role="toolbar"` + `aria-label="Replay controls"` on ReplayControls container.
2. `role="slider"` with `aria-valuetext` (formatted time) on timeline bar.
3. Focus trap + return focus on Keyboard Shortcut and Post-session dialogs (verify shadcn defaults).
4. Add visible focus rings to timeline hover markers (currently mouse-only).
5. Announce speed/play changes via `aria-live="polite"` region.
6. Ensure all icon buttons have `aria-label` (audit hit).
7. Ensure tab order: toolbar → chart region → side rail → timeline.
8. Add `lang="en"` on kbd hints for screen readers.
9. Contrast fix: timeline `text-[10px] text-muted-foreground` on `bg-card/60` audits below AA — bump to `text-muted-foreground/90` on solid background.
10. Provide non-keyboard alt for `?` help (button already there — verify parity).

## Top 10 simplifications

1. Merge `Fast forward`, `Jump to`, `Save checkpoint` menus into one **Navigate** dropdown with three sections.
2. Drop `TradingMode` "netting" toggle from surface — keep in Settings only.
3. Remove duplicate "Snapshot" placement (currently in top-bar AND controls potential).
4. Consolidate `NotesPanel` + `BookmarksPanel` + `CheckpointsPanel` + `ChecklistPanel` into one **Journal** tab with sub-tabs (already close — verify).
5. Drop redundant "session mode" info in header (already shown in HUD).
6. Remove `replayAgain` button from HUD ellipsis — leave in Post-session and Controls only.
7. Delete `NoSession` extra CTA — one primary "New Replay" is enough.
8. Collapse `PostSessionSummary` share row: keep Journal + Community, drop Analytics + close (dialog X exists).
9. Trim Timeline legend — icons in situ already communicate; legend only appears on hover.
10. One "Grade" pill in HUD after finish, remove separate ScoreCard header duplication.

## Estimated deltas

- Replay creation: **~45s → ~20s** (presets, reorder, background preload).
- Clicks to first candle: **6 → 3** (Symbol click, TF click, Start).
- Perceived TTI on session page: **~2.5s → ~0.7s** (skeleton chart + background preload).
- Chart-region re-renders per second at 4x: **~12 → ~3** (context split + memoized PnL).
- Timeline marker layout time (100 trades): **~14ms → ~3ms** (SVG batch).

## What ships this sprint (concrete changes)

Given scope, ship the highest-leverage subset now; leave the rest in this doc as tracked backlog.

**Ship now:**
- Persist replay workspace prefs (speed, sideOpen, sideTab) — new `use-replay-workspace-prefs.ts`.
- Skeleton chart + metadata on `/replay/session` loading state.
- Session-length presets + reordered CreatorWizard fields.
- Consolidate `Fast forward` + `Jump to` + `Save checkpoint` into a single Navigate menu in `ReplayControls`.
- Extend keyboard shortcuts: `+`/`-` speed, `m` bookmark, `s` snapshot; update help sheet.
- Post-session: add "Next step" callout, hero-tier metrics, auto-open on completion (progress >= 100 && !manual dismiss).
- Timeline: session-band tint, memoized markers, `aria-valuetext`.
- HUD: PnL flash + mini progress bar.
- `/replay` index: "Resume last" tile when an active session exists.
- A11y sweep: `role="toolbar"`, missing `aria-label`s, contrast bump.

**Backlog (tracked, not shipping):**
- Command palette, reflection prompt, SVG marker batch, context split, IntersectionObserver-gated rail queries, timeline right-click bookmark, rule-reminder toast.

## Technical notes

- New file: `src/hooks/use-replay-workspace-prefs.ts` mirroring `use-workspace-prefs.ts` shape (150ms debounce).
- New file: `src/components/replay/ReplaySkeleton.tsx` — chart shimmer + metadata header from `session` query (available before candles).
- Edit: `src/components/replay/CreatorWizard.tsx` — add `SESSION_PRESETS` array, replace Start Position `<select>` with a Popover "Advanced".
- Edit: `src/components/replay/ReplayControls.tsx` — merge 3 menus, extend `onKey` handler, update `SHORTCUTS` list.
- Edit: `src/components/replay/ReplayHUD.tsx` — wrap floating PnL in `FlashCell` (import from `blotter-shared`), add progress bar.
- Edit: `src/components/replay/ReplayTimeline.tsx` — add session-band `<div>` layer, memoize marker arrays with `[candles.length, first.time, last.time, arr.length]` keys, add `aria-valuetext`.
- Edit: `src/components/replay/PostSessionSummary.tsx` — add `NextStepCallout`, reorganize metrics.
- Edit: `src/routes/_authenticated/replay.session.tsx` — replace pulse block with `<ReplaySkeleton/>`, wire `sideOpen`/`sideTab`/`speed` to new prefs hook, auto-open summary via `useEffect` on completion.
- Edit: `src/routes/_authenticated/replay.index.tsx` — Resume-last tile above the fold when `active` exists.
