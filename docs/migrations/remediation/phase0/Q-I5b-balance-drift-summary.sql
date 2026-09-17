-- Q-I5b — Summary counts for Q-I5 (unbounded)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 48 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I5b  Summary counts for Q-I5 (unbounded)
WITH closed AS (
  SELECT account_id, sum(pnl) AS closed_pnl FROM public.paper_trades
   WHERE status='closed' AND deleted_at IS NULL GROUP BY account_id),
partial AS (
  SELECT account_id, sum((payload->>'pnl')::numeric) AS partial_pnl
    FROM public.position_history WHERE event='partial_close' GROUP BY account_id),
d AS (
  SELECT a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0)) AS drift
    FROM public.paper_accounts a
    LEFT JOIN closed c ON c.account_id=a.id LEFT JOIN partial p ON p.account_id=a.id
   WHERE a.deleted_at IS NULL)
SELECT count(*) AS accounts,
       count(*) FILTER (WHERE abs(drift) <= 1)  AS consistent,
       count(*) FILTER (WHERE drift > 1)        AS balance_above_settlements,
       count(*) FILTER (WHERE drift < -1)       AS balance_below_settlements,
       round(max(drift),2) AS max_positive_drift, round(min(drift),2) AS max_negative_drift
  FROM d;
