-- Q-I7 — Battle/championship trades outside the event window or by non-participants
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 50 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I7  Battle/championship trades outside the event window or by non-participants
SELECT 'battle' AS kind, t.id AS trade_id, t.user_id, t.battle_id AS event_id, t.created_at, t.opened_at, t.closed_at, t.pnl,
       (t.created_at < b.start_at OR t.created_at > b.end_at) AS created_outside_window,
       NOT EXISTS (SELECT 1 FROM public.battle_participants p WHERE p.battle_id=t.battle_id AND p.user_id=t.user_id) AS not_participant
  FROM public.paper_trades t JOIN public.battles b ON b.id = t.battle_id
 WHERE t.status='closed'
   AND ((t.created_at < b.start_at OR t.created_at > b.end_at)
        OR NOT EXISTS (SELECT 1 FROM public.battle_participants p WHERE p.battle_id=t.battle_id AND p.user_id=t.user_id))
UNION ALL
SELECT 'championship', t.id, t.user_id, t.championship_id, t.created_at, t.opened_at, t.closed_at, t.pnl,
       (t.opened_at < c.start_at OR t.opened_at > c.end_at),
       NOT EXISTS (SELECT 1 FROM public.championship_participants p WHERE p.championship_id=t.championship_id AND p.user_id=t.user_id)
  FROM public.paper_trades t JOIN public.championships c ON c.id = t.championship_id
 WHERE t.status='closed'
   AND ((t.opened_at < c.start_at OR t.opened_at > c.end_at)
        OR NOT EXISTS (SELECT 1 FROM public.championship_participants p WHERE p.championship_id=t.championship_id AND p.user_id=t.user_id))
 ORDER BY 1, 6 DESC
 LIMIT 200;
