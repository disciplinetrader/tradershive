# First-Time UX Simplification

Goal: every screen answers one question up front; advanced surfaces stay one click away.

## Guiding rules
- **One primary answer** per screen, in the first viewport.
- **Two tiers**: Essentials (default) + Advanced (collapsible / behind a toggle).
- **No feature removal** — only reorganize, collapse, or defer.
- Persist each user's expand/collapse choice in `localStorage` so power users aren't nagged.

## Dashboard — "How am I performing?"
Essentials (default view):
1. Greeting + streak (compact, one row)
2. Today's P&L / Equity / Win rate (3-tile hero)
3. Equity curve (single primary chart)
4. Quick actions (Trade, Journal, Replay) — max 3 buttons

Move behind a **"Show more" toggle** (collapsed by default):
- Achievements grid, Leaderboard preview, Notifications, Quick Notes, Calendar heatmap, Productivity, Watchlist duplicate, Market Overview (already lives in /market)

Implementation: wrap secondary widgets in a single `<Collapsible defaultOpen={false}>` labeled "More insights". Keep the existing `CustomizeSheet` for power users.

## Journal — "What happened in this trade?"
List view: already good after recent pass. One tweak — collapse `JournalStats` KPI row into a compact 1-line summary bar with a "View stats" expander.

Detail view: keep current View/Edit mode. Move the Psychology + Performance cards below the fold on mobile (already stacked); on desktop reorder so Chart + Trade Summary are the first column, Psychology/Review collapsed under "Reflection" accordion by default only when empty.

## Replay — "How do I place and manage a trade?"
`replay.index.tsx` (339 lines) is the biggest offender. Currently shows library + challenges + performance + settings tiles all at once.

Restructure landing to a **single primary CTA**: "Start a replay session" with 3 recommended scenarios. Move Library / Challenges / Performance / Trades / Settings into secondary tabs (they already exist as routes — just demote them from the landing grid).

## Paper Trading — "Place a trade with clear risk"
Chart workspace already dense. Changes:
- Collapse `BottomTabs` by default on first visit (Positions/Orders/History) — remember state.
- Collapse right Watchlist panel by default on first visit.
- Toolbar: group Indicators / Alerts / Replay / Fullscreen into a single "Tools" popover on <lg widths (already partly done responsively).

## Analytics — "What can I learn?"
`analytics.tsx` has 14 sub-routes as tabs. Group them:
- **Overview** (index) — hero KPIs + equity + calendar
- **Performance** — performance, sessions, symbols, trades
- **Behavior** — behaviour, risk, ai
- **Compare & Reports** — compare, reports, championships, replay

Two-level nav: 4 primary tabs, each with a secondary strip. Keeps URLs stable; only the tabbar UI changes.

Also: KPI grid — show 4 primary tiles, hide remaining behind "Show all KPIs".

## Implementation order (this turn)
Quick wins I'll ship now:
1. Dashboard: wrap secondary widgets in "More insights" collapsible, persisted.
2. Journal list: compact `JournalStats` bar with expander.
3. Paper Trading: `bottomOpen` / `rightOpen` default false + `localStorage` persistence.
4. Analytics: KPI grid — show 4, expand for the rest.
5. Replay landing: promote "Start session" CTA, demote grid to secondary section.

Larger restructures I'd like sign-off on before touching:
- Analytics tab regrouping (4 primary groups) — changes navigation muscle memory.
- Journal detail Psychology/Review accordion behavior (only when empty vs always).

## Technical notes
- New tiny hook `usePersistentDisclosure(key, defaultOpen)` in `src/hooks/` returning `[open, setOpen]` backed by `localStorage`.
- Use existing `Collapsible` from shadcn (`src/components/ui/collapsible.tsx`) — already installed.
- No schema, no server changes; presentation only.
