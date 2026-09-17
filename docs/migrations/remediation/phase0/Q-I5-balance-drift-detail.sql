-- Q-I5 — Balance inconsistent with settlements (three-way invariant, BA-5 / BA-11)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 47 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I5  Balance inconsistent with settlements (three-way invariant, BA-5 / BA-11)
--       expected = starting_balance + Σ closed pnl + Σ partial_close pnl
--       Non-zero drift can be legitimate only via NBP floor; large positive drift is suspicious.
WITH closed AS (
  SELECT account_id, sum(pnl) AS closed_pnl, count(*) AS n_closed,
         sum(pnl) FILTER (WHERE battle_id IS NOT NULL) AS battle_pnl
    FROM public.paper_trades WHERE status='closed' AND deleted_at IS NULL GROUP BY account_id),
partial AS (
  SELECT account_id, sum((payload->>'pnl')::numeric) AS partial_pnl
    FROM public.position_history WHERE event='partial_close' GROUP BY account_id)
SELECT a.id AS account_id, a.user_id, a.name, a.battle_id, a.championship_id,
       a.starting_balance, a.balance, c.closed_pnl, p.partial_pnl, c.battle_pnl,
       s.net_pnl AS stats_net_pnl, s.total_trades AS stats_trades, c.n_closed,
       round(a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0)), 2) AS balance_drift,
       round(coalesce(s.net_pnl,0) - (a.balance - a.starting_balance), 2)                               AS stats_vs_balance_drift
  FROM public.paper_accounts a
  LEFT JOIN closed c ON c.account_id = a.id
  LEFT JOIN partial p ON p.account_id = a.id
  LEFT JOIN public.account_statistics s ON s.account_id = a.id
 WHERE a.deleted_at IS NULL
   AND (abs(a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0))) > 1
        OR abs(coalesce(s.net_pnl,0) - (a.balance - a.starting_balance)) > 1)
 ORDER BY abs(a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0))) DESC
 LIMIT 200;
