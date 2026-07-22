
-- journal_entries: new qualitative fields
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS opened_tz TEXT,
  ADD COLUMN IF NOT EXISTS closed_tz TEXT,
  ADD COLUMN IF NOT EXISTS session_auto_detected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence SMALLINT,
  ADD COLUMN IF NOT EXISTS entry_reason_html TEXT,
  ADD COLUMN IF NOT EXISTS entry_reason_text TEXT,
  ADD COLUMN IF NOT EXISTS strategy_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS mistake_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_confidence_range;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100));

-- Add london_new_york overlap session value
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'journal_session' AND e.enumlabel = 'london_ny_overlap'
  ) THEN
    ALTER TYPE public.journal_session ADD VALUE 'london_ny_overlap';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'journal_session' AND e.enumlabel = 'tokyo'
  ) THEN
    ALTER TYPE public.journal_session ADD VALUE 'tokyo';
  END IF;
END $$;

-- journal_attachments: caption + category + ordering for screenshots
ALTER TABLE public.journal_attachments
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS journal_attachments_entry_sort_idx
  ON public.journal_attachments (entry_id, sort_order);
