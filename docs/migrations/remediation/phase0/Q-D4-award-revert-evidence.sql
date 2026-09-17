-- Q-D4 — Evidence of trigger reverting server-side awards (S-6 / B-4):
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 19 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-D4  Evidence of trigger reverting server-side awards (S-6 / B-4):
--       latest ledger balance_after vs current profile value.
--       Many mismatches where profile == default (xp 0 / coins 0) => awards reverted.
WITH last_xp AS (
  SELECT DISTINCT ON (user_id) user_id, balance_after, created_at
    FROM public.xp_transactions ORDER BY user_id, created_at DESC),
last_coin AS (
  SELECT DISTINCT ON (user_id) user_id, balance_after, created_at
    FROM public.coin_transactions ORDER BY user_id, created_at DESC)
SELECT count(*)                                                      AS users_with_xp_ledger,
       count(*) FILTER (WHERE p.xp = lx.balance_after)               AS xp_matches_ledger,
       count(*) FILTER (WHERE p.xp IS DISTINCT FROM lx.balance_after) AS xp_mismatch,
       count(*) FILTER (WHERE coalesce(p.xp,0) = 0 AND lx.balance_after > 0) AS xp_zero_but_ledger_positive,
       (SELECT count(*) FROM last_coin lc JOIN public.profiles p2 ON p2.id = lc.user_id
         WHERE p2.coins IS DISTINCT FROM lc.balance_after)           AS coins_mismatch,
       (SELECT count(*) FROM last_coin)                              AS users_with_coin_ledger
  FROM last_xp lx
  JOIN public.profiles p ON p.id = lx.user_id;
