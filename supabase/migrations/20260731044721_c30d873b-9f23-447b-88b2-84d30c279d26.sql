ALTER TABLE public.replay_sessions
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_start timestamptz,
  ADD COLUMN IF NOT EXISTS requested_end timestamptz,
  ADD COLUMN IF NOT EXISTS actual_start timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end timestamptz,
  ADD COLUMN IF NOT EXISTS candle_count integer,
  ADD COLUMN IF NOT EXISTS expected_candle_count integer,
  ADD COLUMN IF NOT EXISTS coverage_status text,
  ADD COLUMN IF NOT EXISTS known_gaps jsonb,
  ADD COLUMN IF NOT EXISTS canonical_symbol text,
  ADD COLUMN IF NOT EXISTS exchange text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS adjustment_mode text,
  ADD COLUMN IF NOT EXISTS data_version text,
  ADD COLUMN IF NOT EXISTS provenance_recorded_at timestamptz;

CREATE INDEX IF NOT EXISTS replay_sessions_coverage_status_idx
  ON public.replay_sessions (coverage_status)
  WHERE coverage_status IS NOT NULL;