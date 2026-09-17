-- Q-I1 — Impossible P&L — sign contradicts price movement beyond costs, or closed
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 43 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I1  Impossible P&L — sign contradicts price movement beyond costs, or closed
--       without exit price, or P&L on a zero price move.
SELECT count(*) FILTER (WHERE exit_price IS NULL)                                                   AS closed_no_exit_price,
       count(*) FILTER (WHERE direction='long'  AND exit_price > entry_price
                          AND pnl < -(coalesce(commission,0)+coalesce(swap,0)) - 0.01)             AS long_up_but_loss,
       count(*) FILTER (WHERE direction='long'  AND exit_price < entry_price AND pnl > 0.01)        AS long_down_but_profit,
       count(*) FILTER (WHERE direction='short' AND exit_price < entry_price
                          AND pnl < -(coalesce(commission,0)+coalesce(swap,0)) - 0.01)             AS short_down_but_loss,
       count(*) FILTER (WHERE direction='short' AND exit_price > entry_price AND pnl > 0.01)        AS short_up_but_profit,
       count(*) FILTER (WHERE exit_price = entry_price AND abs(pnl) > coalesce(commission,0)+coalesce(swap,0)+0.01) AS flat_move_nonzero_pnl,
       count(*) AS closed_trades_total
  FROM public.paper_trades
 WHERE status = 'closed' AND deleted_at IS NULL;
