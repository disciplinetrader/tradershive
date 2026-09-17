-- Q-I3 — Closed trades with no server-side 'closed' event (possible direct PostgREST writes).
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 45 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I3  Closed trades with no server-side 'closed' event (possible direct PostgREST writes).
--       Excludes battle trades (replay battle writer inserts closed rows by design — BA-11).
SELECT (t.battle_id IS NOT NULL) AS is_battle, (t.championship_id IS NOT NULL) AS is_championship,
       count(*) AS closed_without_close_event,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.position_history o
                                           WHERE o.trade_id = t.id AND o.event = 'opened')) AS also_no_open_event,
       sum(t.pnl) AS pnl_sum
  FROM public.paper_trades t
 WHERE t.status = 'closed' AND t.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.position_history h WHERE h.trade_id = t.id AND h.event = 'closed')
 GROUP BY 1, 2
 ORDER BY 1, 2;
