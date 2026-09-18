-- =============================================================================
-- Phase 2 · Increment 3d ROLLBACK. Run as postgres.
-- Restores the original enumerable public-read policy and drops the token RPC.
-- (Restores the S-2 exposure — for emergency use only.)
-- =============================================================================

CREATE POLICY "Public can read shared journal entries"
  ON public.journal_entries
  FOR SELECT
  TO anon, authenticated
  USING ((is_public = true) AND (share_token IS NOT NULL));

DROP FUNCTION IF EXISTS public.get_shared_journal_entry(text);
