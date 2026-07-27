# Playbook Builder

Turn the existing Strategies module into TradersHIVE's Playbook Builder. Reuse existing DB (strategies, strategy_checklists / checklist_items, strategy_examples, strategy_versions, strategy_attachments) so the work is a UI/logic overhaul, not a rewrite. Every journal/paper trade already carries `strategy_id`, so linking is free.

## Scope

**In**
- Playbook Library (grid + search/filter/favorites)
- Playbook Detail page (structured sections, cover, collapsibles)
- Playbook Editor (create/edit rules, checklist, mistakes, screenshots)
- Checklist Mode (pre-trade run, required-items gate, "mark as followed")
- Example Trades panel: pulls journal + paper trades by `strategy_id`, shows KPIs (Win Rate, Avg R, PF, Avg Hold, best/worst)
- Setup Evolution: last 30/90 days trend, version-over-version compare
- AI-ready empty section (locked/placeholder card, no provider wiring)
- Integration hooks: OrderPanel (paper), Replay session, Journal entry — "Attach playbook & run checklist"

**Out (this pass)**
- No AI generation
- No community sharing changes (existing strategies.shared stays)
- No new tables unless strictly needed
- Doesn't touch Auth, Landing, Dashboard, Paper engine, Journal engine, Statistics engine

## Data model

Reuse existing tables. Small additive migration only:

- `strategies`: add `mistakes jsonb default '[]'`, `checklist_required_ids text[] default '{}'` (which items gate "followed"), `cover_url` already exists.
- `strategy_checklist_runs` (NEW): logs each pre-trade checklist execution
  - `id, user_id, strategy_id, context` ('paper'|'replay'|'journal'|'manual'), `context_ref_id uuid null`, `items jsonb` ([{id,label,checked,required}]), `all_required_passed boolean`, `notes text`, `created_at`.
  - Owner-only RLS, GRANT to authenticated + service_role.
- No changes to journal/paper schemas — link via existing `strategy_id`.

Server aggregator (`src/lib/playbook.functions.ts`, protected):
- `listPlaybooks({ search, tags, market, timeframe, favoritesOnly })`
- `getPlaybook(id)` → strategy + checklist + attachments + latest run
- `getPlaybookStats(id, rangeDays)` → aggregates from `journal_entries` + `paper_trades` where `strategy_id = id AND user_id = auth.uid()`: trades, wins/losses/BE, win rate, avg R, PF, avg hold time, best/worst trade ids
- `getPlaybookEvolution(id)` → 30d vs previous 30d deltas + per-version snapshots from `strategy_versions`
- `savePlaybook`, `toggleFavorite`, `logChecklistRun`, `uploadCover` (Storage bucket `playbook-covers`, owner-scoped policies)

## UI

Routes (rework, no new top-level nav item — "Strategies" in sidebar renamed to "Playbooks"):

- `/_authenticated/strategies` → keep; redirect landing to `/strategies/playbooks`
- `/_authenticated/strategies/playbooks` → Library grid (cards with cover, name, category, market badges, tags, favorite star, KPI mini-row: Trades · WR · Avg R)
- `/_authenticated/strategies/playbooks/$id` → Detail with tabs: Overview · Rules · Checklist · Examples · Evolution · AI (locked)
- `/_authenticated/strategies/playbooks/$id/edit` → Editor
- Checklist Mode → drawer/modal component `PlaybookChecklistDialog`, usable from OrderPanel, Replay HUD, and Journal entry form

Components (new/rewritten under `src/components/playbook/`):
- `PlaybookCard`, `PlaybookGrid`, `PlaybookFilters`
- `PlaybookDetailHeader` (cover, favorite, edit)
- `SectionCard` (collapsible, large heading)
- `RulesEditor` (entry/exit/SL/risk — reuses existing `RuleList`)
- `MistakesList`, `TagsInput`, `CoverUploader`
- `ChecklistBuilder` (edit) + `ChecklistRunner` (run mode with required-gate)
- `ExamplesPanel` (KPI row + trade table linking to `/journal/$id` and `/paper/trades/$id`)
- `EvolutionPanel` (sparkline + 30d/prev-30d comparison + version diff)
- `AiInsightsPlaceholder` (locked-card empty state)

Design: reuses existing design tokens (dark theme, semantic colors). Cards use `Card`, tabs from shadcn, collapsibles from Radix. Large H1/H2, generous spacing, minimal chrome. Cover displayed as 16:9 top band with gradient overlay.

## Integrations

- **Paper Trading OrderPanel**: existing `strategy_id` selector — add "Run checklist" button that opens `ChecklistRunner`; on submit stores `strategy_checklist_runs` and, if `all_required_passed=false`, shows a confirm dialog before submit.
- **Replay Studio**: HUD "Playbook" pill → open runner; run is logged with `context='replay'`, `context_ref_id=session_id`.
- **Journal ManualEntryDialog**: when `strategy_id` chosen, show a mini-checklist snapshot; auto-attaches last run for that strategy within 15 min.
- **Analytics**: no engine change; existing per-strategy stats now surface via Playbook detail (uses the same server aggregator so numbers stay consistent).

## Search

Library search combines: text over `name/description/tags`, filter chips for Market, Timeframe, Category, Favorites, "Has trades". Server-side via `.functions.ts` using `ilike` + array overlap; sorted by `is_favorite desc, updated_at desc`.

## Technical

Files:
```text
supabase/migrations/<ts>_playbook_builder.sql
src/lib/playbook.functions.ts
src/lib/playbook/stats.ts
src/lib/playbook/types.ts
src/components/playbook/*                      (new)
src/routes/_authenticated/strategies.playbooks.tsx        (rewrite → library)
src/routes/_authenticated/strategies.playbooks.$id.tsx    (detail)
src/routes/_authenticated/strategies.playbooks.$id.edit.tsx (editor)
src/components/paper-trading/OrderPanel.tsx    (add "Run checklist" hook)
src/components/replay/ReplayHUD.tsx            (add playbook pill)
src/components/journal/ManualEntryDialog.tsx   (attach recent run)
src/components/app-shell.tsx                   (rename nav "Strategies" → "Playbooks")
```

- All reads/writes through `createServerFn` with `requireSupabaseAuth`; RLS scoped to `auth.uid()`.
- Storage bucket `playbook-covers` (private) with owner-only policies; signed URLs served through a server fn.
- TanStack Query with `ensureQueryData` in loaders; mutations invalidate keys `['playbook', id]` and `['playbooks']`.
- Optimistic favorite toggle.
- Console logs stripped by existing Vite config.
- Accessibility: focus rings, keyboard-navigable checklist, dialog labelled with playbook name.

## Verification

- Type check the codebase.
- Manual walk: create playbook → add checklist → run from Paper OrderPanel → close trade → detail shows the trade in Examples with correct KPIs.
- Confirm evolution numbers match Analytics for the same strategy.
