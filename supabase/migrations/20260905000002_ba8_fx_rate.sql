-- BA-8: add fx_rate to paper_trades for per-trade pip value capture
--
-- Existing rows get NULL — they will fall back to the symbol catalog's
-- computed pipValuePerLot (which is correct after the BA-8 catalog fix).
-- New rows capture the FX rate at trade open so P&L is computed from the
-- rate that was current at trade open, not the current catalog value.

ALTER TABLE public.paper_trades
 ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(12, 6) NULL;

COMMENT ON COLUMN public.paper_trades.fx_rate IS
 'FX rate (quote currency units per 1 USD) used to compute pipValuePerLot '
 || 'for this trade. NULL for trades opened before BA-8 deployed, and for '
 || 'USD-quoted pairs where fxRate = 1.0. Used instead of the symbol catalog '
 || 'rate so P&L is computed from the rate captured at trade open, preventing '
 || 'mid-trade drift.';
