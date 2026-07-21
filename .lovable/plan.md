
## AI Replay Coach

A personalized trading mentor layered on top of Replay Studio. Zero changes to replay mechanics, historical data, or existing analytics. Everything derives from real replay session data.

### 1. Database (new migration)

New tables — all RLS-locked to `auth.uid()`, GRANTs to `authenticated` + `service_role`:

- `replay_debriefs` — one row per completed replay. Columns: `id, user_id, session_id (unique), overall_summary, strengths[], weaknesses[], best_trade jsonb, worst_trade jsonb, risk_review, execution_review, discipline_review, psychology_review, improvement_suggestions[], action_items[], grade text, confidence numeric, model text, created_at, updated_at`.
- `replay_mistakes` — one row per detected mistake. Columns: `id, user_id, session_id, trade_id nullable, kind text (enum-like: entered_early|entered_late|fomo|revenge|moved_sl|no_sl|poor_rm|overtrading|held_loser|closed_winner_early|ignored_trend|poor_rr|broke_objective), severity (low|med|high), evidence jsonb, detected_at`.
- `replay_trader_profile` — one row per user (upsert). Columns: `user_id pk, style text, strengths[], weaknesses[], consistency, risk_discipline, execution_quality, patience, decision_quality, confidence, updated_at, snapshot jsonb`.
- `replay_confidence_history` — daily/weekly snapshots. Columns: `id, user_id, taken_at, execution, risk, psychology, discipline, overall, deltas jsonb, reasons jsonb`.
- `replay_homework` — generated practice cards. Columns: `id, user_id, market, symbol, timeframe, session_hint, difficulty, target_r, max_trades, reason, status (pending|in_progress|completed|skipped), created_at, completed_at, source_session_id nullable`.
- `replay_recommendations` — dynamic coaching suggestions. Columns: `id, user_id, kind (practice|reduce_size|avoid_day|wait_longer|increase_rr|reduce_freq|adaptive_replay), title, description, evidence jsonb, priority, dismissed_at nullable, created_at`.
- `replay_coach_reports` — weekly/monthly summaries. Columns: `id, user_id, period (weekly|monthly), period_start, period_end, biggest_improvement, biggest_weakness, best_session_id, worst_session_id, homework_recommendation, next_focus, stats jsonb, body jsonb, created_at, unique(user_id, period, period_start)`.
- `replay_coach_memory` — long-term k/v memory. Columns: `id, user_id, kind (recurring_mistake|best_market|best_session|best_timeframe|successful_strategy|weakness), key text, value jsonb, weight numeric, last_seen_at, unique(user_id, kind, key)`.

### 2. Server functions (`src/lib/replay-coach.functions.ts`)

All `.middleware([requireSupabaseAuth])`, Zod-validated.

Pure analytics (no LLM):
- `analyzeReplayMistakes({ session_id })` — reads `replay_trades`, `replay_checklist_items`, `replay_bookmarks`, session objectives. Runs deterministic rules to insert `replay_mistakes`. Rules: no SL, risk >2%, SL moved wider (compare initial vs closed SL), holding losers (bars_open in losers > 2× bars_open in winners), closing winners at <1R when TP was >1R, RR<1 taken, >10 trades in session, trades outside session objective symbol/timeframe.
- `computePatternInsights({ range })` — aggregates last N replay sessions/trades → best/worst market, symbol, timeframe, session, RR range, holding time, mode. Returns JSON.
- `computeTraderProfile()` — rolls last 30 sessions into style + 6 sub-scores. Upserts `replay_trader_profile`.
- `computeConfidenceScores()` — computes 5 confidence scores from recent trades vs prior 30d; inserts `replay_confidence_history` with `reasons` explaining deltas.
- `computeImprovementTracking({ period })` — weekly/monthly/quarterly/yearly deltas of score, mistakes, RR, win rate.

LLM-backed (Lovable AI Gateway, `openai/gpt-5.5`, Zod `Output.object`, `NoObjectGeneratedError` fallback → parse `error.text`):
- `generateReplayDebrief({ session_id })` — feeds trades/checklist/bookmarks/notes/score/mistakes into prompt → structured debrief → upsert `replay_debriefs`. Also updates `replay_coach_memory`.
- `generateHomework()` — reads profile + weakest area → LLM proposes 1 practice card → inserts `replay_homework`.
- `generateRecommendations()` — LLM produces 3-5 personalized tips → inserts into `replay_recommendations`.
- `generateWeeklyReport()` / `generateMonthlyReport()` — aggregated stats + narrative → inserts `replay_coach_reports`.
- `getCoachMemory()` — reads memory summary for display.

Read helpers: `getReplayDebrief`, `listReplayMistakes`, `getTraderProfile`, `listHomework`, `completeHomework`, `dismissRecommendation`, `listRecommendations`, `getConfidenceTrend`, `listCoachReports`, `getReplayEvolution` (first/latest snapshot + trend series).

### 3. Prompts

Extend `src/lib/ai/prompts.ts`:
- `ReplayDebriefSchema` (matches columns above).
- `HomeworkSchema` — `{ market, symbol, timeframe, session_hint, difficulty, target_r, max_trades, reason }`.
- `ReplayReportSchema` — reused for weekly/monthly.
System prompt appended to `COACH_SYSTEM_PROMPT` for replay-specific tone.

### 4. Auto-trigger on session finish

In `src/components/replay/context.tsx` `finish()` after the score writes:
- Fire-and-forget `analyzeReplayMistakes` → `generateReplayDebrief` → `computeTraderProfile` → `computeConfidenceScores` → `generateRecommendations`.
- `PostSessionSummary` gains a Coach tab that shows debrief + top 3 mistakes + updated confidence deltas.

### 5. UI

**New routes** under `/ai/coach/*` — the "Coach hub":
- `ai.coach.tsx` (layout with sub-nav: Overview, Profile, Mistakes, Homework, Reports, Evolution).
- `ai.coach.index.tsx` (Overview): confidence radar, recent debriefs, next homework, top recommendations.
- `ai.coach.profile.tsx`: trader profile card, 6-metric bars, memory highlights.
- `ai.coach.mistakes.tsx`: mistake ledger with frequency chart and per-kind trend.
- `ai.coach.homework.tsx`: cards with "Start now" (deep-link into `/replay?prefill=...`), complete/skip.
- `ai.coach.reports.tsx`: weekly/monthly report timeline with "Generate now" button.
- `ai.coach.evolution.tsx`: first-vs-latest comparison, score trendline.

**Existing surfaces upgraded** (no rebuilds):
- `AiReviewPanel.tsx` (replay session sidebar): switch to `generateReplayDebrief` output; render structured strengths/weaknesses/best-trade/worst-trade sections plus top mistakes.
- `PostSessionSummary.tsx`: append Coach section with debrief preview and CTA to `/ai/coach`.
- Add "Coach" tab entry to the `/ai` layout nav.

Reuses existing `GlassCard`, chart tokens, animation patterns, and `--success`/`--danger` semantics. Fully themed under both light/dark.

### 6. Performance & caching

- Debriefs are one-per-session; regenerate is opt-in.
- Pattern insights + profile use `staleTime: 5 min` in `useQuery`, invalidated after `finish()`.
- Confidence history uses windowed reads (last 90 days).
- All heavy aggregation runs in the DB or a single server-fn call; the client only renders.

### 7. Rate limiting & keys

- All LLM calls go through the existing `checkAiRateLimit` in `src/lib/ai/rate-limit.server.ts` under a `replay_coach` bucket.
- `LOVABLE_API_KEY` remains server-only.

### 8. Integrations

Read-only wiring into: Replay Studio (source), Paper Trading (compare replay vs live), Statistics (shared aggregation helpers), Achievements/Progression (award XP on homework completion via existing `awardXp`), memory ready for future Playbooks/Community.

### 9. Backward compatibility

- No changes to `replay_sessions`, `replay_trades`, `replay_scores`, engine, or market-data.
- Existing `AiReviewPanel` keeps working; only its data source swaps behind the query key.
- Old `replay_ai_reviews` rows remain readable; new debriefs live in `replay_debriefs`.

### 10. Deliverables checklist

- 1 migration (7 tables, RLS, GRANTs).
- 1 new server-function module + schema additions to prompts.
- 1 new context wiring in replay `finish()`.
- 6 new route files under `/ai/coach/*` + nav entry.
- Upgraded `AiReviewPanel` and `PostSessionSummary`.
- Typecheck clean.
