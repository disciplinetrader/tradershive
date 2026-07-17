
-- Enums
DO $$ BEGIN CREATE TYPE public.journal_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.journal_grade AS ENUM ('A+','A','B','C','D','F');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.journal_session AS ENUM ('london','new_york','asia','sydney','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.journal_taxonomy_kind AS ENUM ('setup','emotion','mistake');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- journal_entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.paper_trades(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.paper_accounts(id) ON DELETE SET NULL,
  market TEXT,
  symbol TEXT,
  direction TEXT CHECK (direction IN ('long','short')),
  entry_price NUMERIC(20,8),
  exit_price NUMERIC(20,8),
  stop_loss NUMERIC(20,8),
  take_profit NUMERIC(20,8),
  lot_size NUMERIC(20,4),
  rr NUMERIC(10,4),
  risk_pct NUMERIC(10,4),
  reward_pct NUMERIC(10,4),
  pnl NUMERIC(20,2),
  commission NUMERIC(20,2) DEFAULT 0,
  swap NUMERIC(20,2) DEFAULT 0,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  session public.journal_session,
  setup TEXT,
  strategy TEXT,
  grade public.journal_grade,
  entry_quality SMALLINT CHECK (entry_quality BETWEEN 0 AND 5),
  exit_quality SMALLINT CHECK (exit_quality BETWEEN 0 AND 5),
  risk_mgmt SMALLINT CHECK (risk_mgmt BETWEEN 0 AND 5),
  patience SMALLINT CHECK (patience BETWEEN 0 AND 5),
  execution SMALLINT CHECK (execution BETWEEN 0 AND 5),
  discipline SMALLINT CHECK (discipline BETWEEN 0 AND 5),
  emotions TEXT[] NOT NULL DEFAULT '{}',
  mistakes TEXT[] NOT NULL DEFAULT '{}',
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes_html TEXT,
  notes_text TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  status public.journal_status NOT NULL DEFAULT 'draft',
  is_public BOOLEAN NOT NULL DEFAULT false,
  share_token TEXT UNIQUE,
  ai_review JSONB,
  ai_psychology JSONB,
  ai_mistake_detection JSONB,
  ai_suggestions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_closed ON public.journal_entries(user_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_status ON public.journal_entries(user_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_trade ON public.journal_entries(trade_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_symbol ON public.journal_entries(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_journal_entries_share_token ON public.journal_entries(share_token) WHERE share_token IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT SELECT ON public.journal_entries TO anon;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their journal entries" ON public.journal_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can read shared journal entries" ON public.journal_entries
  FOR SELECT TO anon, authenticated USING (is_public = true AND share_token IS NOT NULL);
CREATE TRIGGER trg_journal_entries_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- journal_tags + junction
CREATE TABLE IF NOT EXISTS public.journal_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_tags TO authenticated;
GRANT ALL ON public.journal_tags TO service_role;
ALTER TABLE public.journal_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their tags" ON public.journal_tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.journal_entry_tags (
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.journal_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON public.journal_entry_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_entry_tags_user ON public.journal_entry_tags(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_tags TO authenticated;
GRANT SELECT ON public.journal_entry_tags TO anon;
GRANT ALL ON public.journal_entry_tags TO service_role;
ALTER TABLE public.journal_entry_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their entry tags" ON public.journal_entry_tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can read tags of shared entries" ON public.journal_entry_tags
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries e
                 WHERE e.id = entry_id AND e.is_public = true AND e.share_token IS NOT NULL));

-- journal_attachments
CREATE TABLE IF NOT EXISTS public.journal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','pdf','video','other')),
  name TEXT,
  size_bytes BIGINT,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_attach_entry ON public.journal_attachments(entry_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_attachments TO authenticated;
GRANT SELECT ON public.journal_attachments TO anon;
GRANT ALL ON public.journal_attachments TO service_role;
ALTER TABLE public.journal_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their attachments" ON public.journal_attachments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can read attachments of shared entries" ON public.journal_attachments
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries e
                 WHERE e.id = entry_id AND e.is_public = true AND e.share_token IS NOT NULL));

-- journal_history
CREATE TABLE IF NOT EXISTS public.journal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_history_entry ON public.journal_history(entry_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_history TO authenticated;
GRANT ALL ON public.journal_history TO service_role;
ALTER TABLE public.journal_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their journal history" ON public.journal_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- journal_taxonomy
CREATE TABLE IF NOT EXISTS public.journal_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.journal_taxonomy_kind NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_taxonomy TO authenticated;
GRANT ALL ON public.journal_taxonomy TO service_role;
ALTER TABLE public.journal_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their taxonomy" ON public.journal_taxonomy
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-draft trigger
CREATE OR REPLACE FUNCTION public.create_journal_draft_from_trade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sec INTEGER;
BEGIN
  IF NEW.status <> 'closed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE trade_id = NEW.id) THEN RETURN NEW; END IF;
  sec := NULL;
  IF NEW.opened_at IS NOT NULL AND NEW.closed_at IS NOT NULL THEN
    sec := GREATEST(0, EXTRACT(EPOCH FROM (NEW.closed_at - NEW.opened_at))::INTEGER);
  END IF;
  INSERT INTO public.journal_entries (
    user_id, trade_id, account_id, market, symbol, direction,
    entry_price, exit_price, stop_loss, take_profit, lot_size,
    rr, pnl, commission, swap, opened_at, closed_at, duration_seconds, status
  ) VALUES (
    NEW.user_id, NEW.id, NEW.account_id, NEW.market, NEW.symbol, NEW.direction,
    NEW.entry_price, NEW.exit_price, NEW.stop_loss, NEW.take_profit, NEW.lot_size,
    NEW.rr, NEW.pnl, COALESCE(NEW.commission, 0), COALESCE(NEW.swap, 0),
    NEW.opened_at, NEW.closed_at, sec, 'draft'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paper_trades_auto_journal_insert ON public.paper_trades;
CREATE TRIGGER trg_paper_trades_auto_journal_insert
  AFTER INSERT ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.create_journal_draft_from_trade();

DROP TRIGGER IF EXISTS trg_paper_trades_auto_journal_update ON public.paper_trades;
CREATE TRIGGER trg_paper_trades_auto_journal_update
  AFTER UPDATE OF status ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.create_journal_draft_from_trade();

-- Storage policies for journal-images / journal-files (owner path: <user_id>/...)
DO $$ BEGIN
  CREATE POLICY "Journal owners read own files"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id IN ('journal-images','journal-files')
           AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Journal owners upload own files"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('journal-images','journal-files')
                AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Journal owners update own files"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id IN ('journal-images','journal-files')
           AND auth.uid()::text = (storage.foldername(name))[1])
    WITH CHECK (bucket_id IN ('journal-images','journal-files')
                AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Journal owners delete own files"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id IN ('journal-images','journal-files')
           AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
