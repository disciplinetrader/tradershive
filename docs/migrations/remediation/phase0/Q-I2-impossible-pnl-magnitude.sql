-- Q-I2 — Impossible P&L — per-symbol outliers of implied value-per-price-unit-per-lot.
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 44 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I2  Impossible P&L — per-symbol outliers of implied value-per-price-unit-per-lot.
--       Robust to unknown contract specs: compares each trade to its symbol's median.
WITH k AS (
  SELECT id, user_id, account_id, symbol, battle_id, championship_id, pnl, entry_price, exit_price, lot_size, closed_at,
         abs(pnl) / NULLIF(abs(exit_price - entry_price) * lot_size, 0) AS k
    FROM public.paper_trades
   WHERE status='closed' AND deleted_at IS NULL AND exit_price IS NOT NULL
     AND lot_size > 0 AND exit_price <> entry_price),
med AS (SELECT symbol, percentile_cont(0.5) WITHIN GROUP (ORDER BY k::float8) AS k_med, count(*) AS n
          FROM k GROUP BY symbol)
SELECT k.id, k.user_id, k.account_id, k.symbol, k.battle_id, k.championship_id, k.pnl,
       round((k.k::float8 / NULLIF(m.k_med,0))::numeric, 2) AS ratio_to_symbol_median, m.n AS symbol_sample, k.closed_at
  FROM k JOIN med m USING (symbol)
 WHERE m.n >= 5 AND (k.k > 10 * m.k_med OR k.k < m.k_med / 10)
 ORDER BY (k.battle_id IS NOT NULL OR k.championship_id IS NOT NULL) DESC, abs(k.pnl) DESC
 LIMIT 200;
