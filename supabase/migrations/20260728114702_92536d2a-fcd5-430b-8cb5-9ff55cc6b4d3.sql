-- 1. Extend bug_reports
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'bug',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS expected_behavior text,
  ADD COLUMN IF NOT EXISTS actual_behavior text,
  ADD COLUMN IF NOT EXISTS reproduction_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS satisfaction_rating smallint,
  ADD COLUMN IF NOT EXISTS rating_comment text;

ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_type_check;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_type_check
  CHECK (type IN ('bug','general','question','compliment'));

ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN ('open','triaged','in_progress','testing','resolved','closed','duplicate','rejected'));

ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_rating_check;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_rating_check
  CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5);

-- 2. Extend feature_requests
ALTER TABLE public.feature_requests
  ADD COLUMN IF NOT EXISTS why_valuable text,
  ADD COLUMN IF NOT EXISTS user_priority text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_code text UNIQUE;

ALTER TABLE public.feature_requests DROP CONSTRAINT IF EXISTS feature_requests_user_priority_check;
ALTER TABLE public.feature_requests ADD CONSTRAINT feature_requests_user_priority_check
  CHECK (user_priority IS NULL OR user_priority IN ('nice_to_have','useful','important','critical'));

-- 3. Reference-code sequences + trigger
CREATE SEQUENCE IF NOT EXISTS public.bug_reports_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.feature_requests_ref_seq START 1;

CREATE OR REPLACE FUNCTION public.set_bug_report_reference_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix text;
BEGIN
  IF NEW.reference_code IS NULL THEN
    prefix := CASE NEW.type
      WHEN 'bug' THEN 'BUG'
      WHEN 'question' THEN 'ASK'
      WHEN 'compliment' THEN 'LOVE'
      ELSE 'FDB'
    END;
    NEW.reference_code := prefix || '-' || lpad(nextval('public.bug_reports_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bug_reports_reference_code ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_reference_code
  BEFORE INSERT ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_bug_report_reference_code();

CREATE OR REPLACE FUNCTION public.set_feature_request_reference_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_code IS NULL THEN
    NEW.reference_code := 'FR-' || lpad(nextval('public.feature_requests_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feature_requests_reference_code ON public.feature_requests;
CREATE TRIGGER trg_feature_requests_reference_code
  BEFORE INSERT ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_feature_request_reference_code();

-- Backfill existing rows
UPDATE public.bug_reports SET reference_code = 'BUG-' || lpad(nextval('public.bug_reports_ref_seq')::text, 6, '0') WHERE reference_code IS NULL;
UPDATE public.feature_requests SET reference_code = 'FR-' || lpad(nextval('public.feature_requests_ref_seq')::text, 6, '0') WHERE reference_code IS NULL;

-- 4. feedback_notes
CREATE TABLE IF NOT EXISTS public.feedback_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text NOT NULL CHECK (parent_type IN ('bug','feature')),
  parent_id uuid NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_parent ON public.feedback_notes(parent_type, parent_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_notes TO authenticated;
GRANT ALL ON public.feedback_notes TO service_role;

ALTER TABLE public.feedback_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_notes_admin_all" ON public.feedback_notes
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'support:manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'support:manage'));

-- 5. Storage policies for feedback-attachments bucket
-- Users can upload/read their own files (path prefix = their user id).
-- Admins with support:manage can read all.
CREATE POLICY "feedback_attachments_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "feedback_attachments_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-attachments' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_permission(auth.uid(), 'support:manage')));

CREATE POLICY "feedback_attachments_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'feedback-attachments' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_permission(auth.uid(), 'support:manage')));