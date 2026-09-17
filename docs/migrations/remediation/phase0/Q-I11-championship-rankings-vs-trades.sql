-- Q-I11 — Championship rankings inconsistent with underlying trades
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 55 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I11  Championship rankings inconsistent with underlying trades
WITH tr AS (
  SELECT championship_id, user_id, sum(pnl) AS trade_pnl, count(*) AS trade_n
    FROM public.paper_trades
   WHERE championship_id IS NOT NULL AND status='closed'
   GROUP BY 1, 2)
SELECT k.championship_id, k.user_id, k.rank, k.pnl AS ranking_pnl, tr.trade_pnl, k.total_trades, tr.trade_n, k.updated_at
  FROM public.championship_rankings k
  LEFT JOIN tr ON tr.championship_id = k.championship_id AND tr.user_id = k.user_id
 WHERE abs(coalesce(k.pnl,0) - coalesce(tr.trade_pnl,0)) > 0.01
    OR coalesce(k.total_trades,0) <> coalesce(tr.trade_n,0)
 ORDER BY k.updated_at DESC
 LIMIT 200;
