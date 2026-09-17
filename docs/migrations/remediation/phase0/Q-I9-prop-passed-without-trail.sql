-- Q-I9 — Prop challenges passed without a credible evaluation trail
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 52 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I9  Prop challenges passed without a credible evaluation trail
SELECT c.id, c.user_id, c.name, c.status, c.result, c.account_size, c.starting_equity, c.current_equity,
       c.profit_target_pct, c.min_trading_days, c.trading_days_used, c.completed_at,
       a.starting_balance AS linked_starting_balance, a.balance AS linked_balance,
       (SELECT count(*) FROM public.prop_challenge_days d WHERE d.challenge_id = c.id) AS day_rows,
       (SELECT count(*) FROM public.prop_challenge_days d WHERE d.challenge_id = c.id AND d.trades_count > 0) AS trading_day_rows,
       (SELECT coalesce(sum(t.pnl),0) FROM public.paper_trades t
         WHERE t.account_id = c.paper_account_id AND t.status='closed'
           AND t.closed_at >= c.started_at) AS realized_since_start,
       concat_ws(', ',
         CASE WHEN (SELECT count(*) FROM public.prop_challenge_days d WHERE d.challenge_id=c.id)=0 THEN 'no_day_rows' END,
         CASE WHEN c.trading_days_used < c.min_trading_days THEN 'days_below_min' END,
         CASE WHEN a.starting_balance IS DISTINCT FROM c.account_size THEN 'linked_account_size_mismatch' END,
         CASE WHEN c.current_equity - c.starting_equity < c.starting_equity * c.profit_target_pct / 100 THEN 'equity_below_target' END,
         CASE WHEN (SELECT coalesce(sum(t.pnl),0) FROM public.paper_trades t
                     WHERE t.account_id=c.paper_account_id AND t.status='closed' AND t.closed_at >= c.started_at)
                   < c.starting_equity * c.profit_target_pct / 100 THEN 'realized_below_target' END,
         CASE WHEN c.completed_at IS NULL THEN 'no_completed_at' END,
         CASE WHEN c.completed_at < c.started_at + interval '1 day' THEN 'passed_within_1_day' END
       ) AS flags
  FROM public.prop_challenges c
  LEFT JOIN public.paper_accounts a ON a.id = c.paper_account_id
 WHERE c.status = 'passed' OR c.result = 'passed'
 ORDER BY c.completed_at DESC NULLS FIRST
 LIMIT 200;
