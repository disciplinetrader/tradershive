DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'paper_trades'
      AND column_name = 'fx_rate'
  ) THEN
    ALTER TABLE public.paper_trades ADD COLUMN fx_rate NUMERIC(12,6) NULL;
  END IF;
END $$;