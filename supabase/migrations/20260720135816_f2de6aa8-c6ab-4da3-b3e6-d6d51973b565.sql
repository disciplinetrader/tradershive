
ALTER TABLE public.paper_accounts
  ADD COLUMN IF NOT EXISTS margin_call_level numeric(6,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS stop_out_level numeric(6,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS negative_balance_protection boolean NOT NULL DEFAULT true;

ALTER TABLE public.paper_accounts
  ADD CONSTRAINT paper_accounts_margin_levels_ck
  CHECK (margin_call_level >= stop_out_level AND stop_out_level >= 0 AND margin_call_level <= 1000);

ALTER TYPE public.paper_close_reason ADD VALUE IF NOT EXISTS 'stop_out';
