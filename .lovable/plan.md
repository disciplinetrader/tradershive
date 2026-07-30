# Journal X — Product Design Proposal

Turn the Journal from a logging tool into the **learning layer** of TradersHIVE: Replay = practice, Journal = learn, AI Coach = improve, Community = compete.

## 1. TradeZella audit

| Area | What they do | Verdict for us |
| --- | --- | --- |
| IA | Dashboard / Trades / Calendar / Notebook / Reports / Playbooks / Backtesting / Replay as one product | KEEP the flat, purposeful sectioning |
| Dashboard | Zella Score + widget grid, multi-account switcher | IMPROVE — single health score is powerful; ours must explain *why* it moved |
| Calendar | Month grid with daily P/L, weekly totals column | REDESIGN — day cells carry only money; no behaviour signal |
| Trade detail | Summary → chart → executions → notes → tags → playbook | REDESIGN into a narrative, not stacked panels |
| Analytics | 50+ reports, excellent filtering, clean charts | KEEP clarity, REMOVE report sprawl (curated insight-first) |
| Playbooks | Manual attach, rule checklist, per-setup stats | IMPROVE — auto-match every trade, score compliance |
| Mistakes/tags | Free tags + mistake tags, manual | REDESIGN — taxonomy + AI detection |
| Psychology | Basic mood/rating fields | REDESIGN — full state model, correlated to results |
| Replay | Trade / Day / Scenario replay | BEAT IT — we already own a replay engine; close the loop with measured improvement |
| Notebook | Separate notes app | REMOVE as separate surface; notes live on trades/days |
| Mobile | Responsive review-only | KEEP that scope |

**Why it feels polished:** one metric ladder (score → drivers → trades), consistent card/table rhythm, dense but never cramped typography, every screen has exactly one job, and filters are global and persistent.

## 2. TradersHIVE Journal audit

**Strengths:** deep data model (60-column `journal_entries`, attachments, tags, taxonomy, history), auto-title, field-level autosave, drafts banner, calendar/timeline/table views, strong AI + Replay assets already built.

**Weaknesses**
- Two editing surfaces (`JournalDrawer` 1157 lines, `ManualEntryDialog` 950 lines) that overlap.
- Trade detail (`journal.$entryId`) is a stack of panels; no chart, no replay, no next step.
- Journal intelligence is scattered across `/mistakes`, `/ai.psychology`, `/ai.playbooks`, `/analytics.calendar`, `/strategies.playbooks` — users never find it.
- Calendar cells show P/L only; timeline view is thin.
- Stats page (667 lines) duplicates `/analytics`.
- No trade→replay→compare loop despite both halves existing.
- Filters are per-view, not persistent; search is a bar, not a system.

## 3. New architecture — Trade → Story → Insight → Improvement

```text
/journal            Dashboard   what happened + health score
/journal/trades     Trades      table/cards, global filters, bulk review
/journal/calendar   Calendar    day = full trading story
/journal/day/$date  Day story   session recap, all trades, AI debrief
/journal/t/$id      Trade story the flagship page
/journal/analytics  Analytics   insight-first, curated
/journal/playbooks  Playbooks   compliance scoring
/journal/mistakes   Mistakes    taxonomy + heatmap
/journal/psychology Psychology  state vs performance
/journal/coach      AI Coach    reviews, homework, patterns
/journal/reports    Reports     periodic exports
/journal/settings   Settings    accounts, tags, defaults
```
Legacy `/mistakes`, `/analytics/calendar`, `/ai/psychology`, `/ai/playbooks` redirect into these. Journal keeps one top-level sidebar item with a sub-nav rail.

## 4–5. Navigation + Dashboard

Sub-nav is a compact horizontal rail (icon+label, keyboard `g` shortcuts). A persistent **filter bar** (account, date range, symbol, setup, tag) is shared by every Journal section and stored per user.

Dashboard rows: **Hive Score** (discipline + consistency + risk + execution, with delta and the 3 drivers) → KPI strip (Net P/L, Win %, Avg R, Profit factor, Expectancy, Max DD) → equity + R-distribution charts → **Today/latest AI debrief** → mini-calendar → "3 things to fix this week" with one-click Replay drills.

## 6. Trade Story page

Sticky left spine (section jump + progress), scrolling narrative, each section ends with the next action:

Summary (direction, R, P/L, grade) → **Interactive chart** with entry/exit/SL/TP markers → **Replay this trade** → Execution timeline (entries, adds, SL moves, exits) → Stats → Screenshots (Before / During / Exit / Post / Replay) → Notes (autosave) → **Playbook match %** with met/missed/broken rules → Mistakes (AI-suggested, confirmable) → Psychology → AI review → Similar trades → Improvement plan → Homework → **Practice again**.

## 7. Calendar

Day cell: net P/L, win rate, R, trade count, discipline dot, best setup, worst mistake, replay badge, AI rating. Week column: totals + consistency. Heatmap toggles (P/L, R, discipline, emotion, volume). Click → Day Story page.

## 8. Analytics

Top: 5 AI-detected insights ("You lose 68% of trades opened in the first 5 min after a loss"). Then curated sections: time (hours/days/sessions), setups, risk & position sizing, rule violations, confidence vs performance, emotion vs performance, replay improvement trend, consistency score. Every chart is filter-aware and drill-through to filtered trades.

## 9. AI integration

Per trade: executive summary, mistake detection, execution/risk review, rule violations, advice, homework, replay recommendation, similar historical trades. Per day: session debrief. Per week/month: pattern report. Reuses existing `ai_trade_reviews`, `ai_recommendations`, `ai_reports`, `replay_homework`; queued via `ai_analysis_queue`, never blocking the UI.

## 10. Replay integration (killer loop)

`Replay this trade` seeds a replay session from the trade's symbol/timeframe/window → user re-trades it → **Compare** view (original vs replay: entry timing, R, adherence, mistakes avoided) → improvement delta stored on the trade → AI feedback. Trade page then shows a "practiced 3× / +0.8R improvement" ribbon.

## 11. Psychology system

Pre-trade and post-trade capture (sliders, ≤10s): confidence, fear, greed, FOMO, stress, patience, discipline, revenge, hesitation, mood, energy, optional sleep. Surfaces: state radar per trade, state-vs-P/L scatter, tilt detector (consecutive-loss behaviour), weekly emotional trend.

## 12. Screenshots & media

Typed slots (before / during / exit / post / replay), paste-to-upload, lightbox with compare, drawing layer reusing the chart drawing engine, AI annotation later. Private bucket + signed URLs.

## 13. Playbooks

One playbook model (merge `strategies.playbooks` + `ai_playbooks`): rules with weights + checklist. Auto-match by symbol/session/setup, produce match %, missing rules, broken rules, strengths, weaknesses, AI feedback. Playbook page shows per-rule expectancy.

## 14. Mobile

Review-and-capture only: dashboard, calendar, trade story (read + notes + psychology + screenshots), quick log. Heavy analytics stays desktop-first with a "best on desktop" affordance.

## 15–18. Component plan

- **Keep:** `TradeTable`, `TradeCard`, `NotesEditor`, `ScreenshotUploader`, `InstrumentSearchInput`, `DraftsBanner`, autosave hook, auto-title.
- **Remove:** `JournalStats` (folded into Analytics), `TimelineView` (folded into Day Story), duplicate calendar in `/analytics`.
- **Merge:** `JournalDrawer` + `ManualEntryDialog` → single `TradeEditor` (drawer on desktop, sheet on mobile); `JournalFilters` + `JournalSearchBar` → `JournalFilterBar` with ⌘K.
- **New:** `JournalSubNav`, `HiveScoreCard`, `InsightCard`, `CalendarDayCell`, `DayStory`, `TradeStory` + spine, `TradeChartPanel`, `ExecutionTimeline`, `PlaybookMatchCard`, `MistakeChips`, `PsychologyCapture`, `PsychRadar`, `ReplayCompareCard`, `SimilarTrades`, `ImprovementPlan`, `MediaGallery`.

## 19. Phases

1. **Foundation** — routes, sub-nav, shared filter bar, redirects, unified `TradeEditor`.
2. **Trade Story** — narrative page, chart, execution timeline, media slots, notes.
3. **Calendar + Day Story** — rich cells, heatmaps, day debrief.
4. **Intelligence** — Playbook matching, Mistakes taxonomy, Psychology capture + correlations.
5. **AI + Replay loop** — per-trade review, homework, replay seeding, compare & improvement delta.
6. **Analytics + Reports + Dashboard score**, mobile pass, community hooks (share/mentor-review stubs, no UI yet).

## 20. Risks & opportunities

- **Risk:** schema breadth — mitigate with additive migrations and per-phase RLS + grants.
- **Risk:** AI cost/latency — queue + cache, never block render.
- **Risk:** redirect breakage — keep legacy paths as redirects for one release.
- **Risk:** scope; each phase must ship standalone.
- **Opportunity:** the Replay↔Journal improvement loop is something TradeZella cannot match; the Hive Score is the retention hook.

## Technical notes

Existing tables cover most of this (`journal_entries`, `journal_attachments`, `journal_taxonomy`, `ai_*`, `replay_*`, `strategy_playbooks`). New additions expected: `journal_psychology` (per-trade state), `journal_playbook_match`, `journal_replay_links` (trade ↔ replay session + delta). All server work via `createServerFn` in thin `*.functions.ts` wrappers with helpers in `*.server.ts`; every new table gets GRANTs + owner-scoped RLS.
