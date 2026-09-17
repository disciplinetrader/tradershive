-- Q-I4 — Duplicate settlement — more than one 'closed' event per trade
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 46 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I4  Duplicate settlement — more than one 'closed' event per trade
SELECT h.trade_id, count(*) AS close_events,
       array_agg((h.payload->>'pnl') ORDER BY h.created_at) AS pnls,
       min(h.created_at) AS first_close, max(h.created_at) AS last_close
  FROM public.position_history h
 WHERE h.event = 'closed'
 GROUP BY h.trade_id
HAVING count(*) > 1
 ORDER BY close_events DESC, last_close DESC
 LIMIT 200;
