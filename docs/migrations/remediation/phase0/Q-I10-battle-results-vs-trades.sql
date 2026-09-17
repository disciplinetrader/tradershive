-- Q-I10 — Battle results inconsistent with underlying trades
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 54 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I10  Battle results inconsistent with underlying trades
WITH tr AS (
  SELECT battle_id, user_id, sum(pnl) AS trade_pnl, count(*) AS trade_n
    FROM public.paper_trades
   WHERE battle_id IS NOT NULL AND status='closed'
   GROUP BY battle_id, user_id)
SELECT r.battle_id, r.user_id, r.final_rank, r.pnl AS result_pnl, tr.trade_pnl,
       r.trades_count AS result_trades, tr.trade_n,
       b.winner_user_id, b.ranked,
       CASE WHEN tr.user_id IS NULL AND coalesce(r.trades_count,0) > 0 THEN 'result_without_trades'
            WHEN abs(coalesce(r.pnl,0) - coalesce(tr.trade_pnl,0)) > 0.01 THEN 'pnl_mismatch'
            WHEN coalesce(r.trades_count,0) <> coalesce(tr.trade_n,0) THEN 'count_mismatch'
            WHEN r.final_rank = 1 AND b.winner_user_id IS DISTINCT FROM r.user_id THEN 'winner_mismatch'
            WHEN NOT EXISTS (SELECT 1 FROM public.battle_participants p
                              WHERE p.battle_id=r.battle_id AND p.user_id=r.user_id) THEN 'result_for_non_participant'
       END AS anomaly
  FROM public.battle_results r
  JOIN public.battles b ON b.id = r.battle_id
  LEFT JOIN tr ON tr.battle_id = r.battle_id AND tr.user_id = r.user_id
 WHERE (tr.user_id IS NULL AND coalesce(r.trades_count,0) > 0)
    OR abs(coalesce(r.pnl,0) - coalesce(tr.trade_pnl,0)) > 0.01
    OR coalesce(r.trades_count,0) <> coalesce(tr.trade_n,0)
    OR (r.final_rank = 1 AND b.winner_user_id IS DISTINCT FROM r.user_id)
    OR NOT EXISTS (SELECT 1 FROM public.battle_participants p WHERE p.battle_id=r.battle_id AND p.user_id=r.user_id)
 ORDER BY b.updated_at DESC
 LIMIT 200;
