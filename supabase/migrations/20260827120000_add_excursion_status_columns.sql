-- Record WHY an entry has no excursion, separately from WHETHER it was measured.
--
-- `mfe_r IS NULL` has three different meanings and only one of them should ever
-- be retried. Without somewhere to write the distinction, the backfill cannot
-- tell a trade that can never be measured from one whose candles simply are not
-- published yet, so it re-attempts both on every run against a metered provider:
--
--   ok        measured
--   no_stop   TERMINAL. mfe_r is mfe_pnl/risk_pnl, so with no stop there is no
--             R to compute — ever. mfe_pnl is still stored and still useful.
--   unusable  TERMINAL. No fill price, no size, no times, unknown symbol, or an
--             inverted range. Re-running changes none of that.
--   no_data   RETRYABLE. No non-synthetic candles cover the window TODAY;
--             historical coverage improves over time.
--   error     RETRYABLE. Provider failure or rate limit. A rate limit must land
--             here and never in no_data, or a transient budget ceiling
--             permanently excludes a perfectly computable trade.
--
-- Deliberately NOT an enum: the vocabulary is owned by ExcursionStatus in
-- lib/journal/excursions.functions.ts, and adding a status should not require a
-- migration in an environment where migrations are applied by hand.
--
-- `excursion_attempted_at` stays SEPARATE from the existing
-- `excursion_computed_at`. The journal panel reads computed_at as "this was
-- measured", so stamping it on a failed attempt would render a failure as a
-- successful measurement — which is the specific lie this whole vocabulary
-- exists to prevent.
--
-- Applied by hand in the Lovable SQL editor on 2026-08-27 and verified there
-- with an information_schema query returning exactly the two rows below
-- (timestamptz and text, both nullable). This file exists so the change is in
-- version control: an environment built from these migrations alone would
-- otherwise lack both columns, and the failure mode is silent — the coverage
-- query 42703s, the panel renders nothing, and the backfill looks unbuilt
-- rather than broken. That cost a debugging session once already.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS excursion_status text,
  ADD COLUMN IF NOT EXISTS excursion_attempted_at timestamptz;
