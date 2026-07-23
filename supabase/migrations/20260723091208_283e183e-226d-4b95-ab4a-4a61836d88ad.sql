DO $$ BEGIN
  CREATE TYPE public.journal_trade_type AS ENUM ('intraday','swing','long_term','scalp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS trade_type public.journal_trade_type;