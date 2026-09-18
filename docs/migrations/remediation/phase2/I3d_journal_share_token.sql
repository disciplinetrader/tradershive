-- =============================================================================
-- Phase 2 · Increment 3d — journal share privacy (S-2). Run as postgres.
-- Rollback: I3d_rollback.sql.
--
-- The RLS policy "Public can read shared journal entries" lets anon/authenticated
-- SELECT EVERY row where (is_public AND share_token IS NOT NULL) — it never
-- compares the token, so all shared journals are enumerable and only the client
-- filtered by token. Replace it with a SECURITY DEFINER RPC that returns a single
-- entry ONLY when the caller presents the exact share_token, and drop the broad
-- read policy so the table can no longer be enumerated by anon. Owners keep their
-- ALL policy. Only the whitelisted share columns are returned — private
-- reflection/internal fields never leave the server.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_shared_journal_entry(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $fn$
  SELECT CASE WHEN _token IS NULL OR length(_token) < 16 THEN NULL ELSE (
    SELECT to_jsonb(x) FROM (
      SELECT id, symbol, direction, session, setup, grade, rr, pnl, duration_seconds,
             emotions, mistakes, screenshots, notes_html, created_at, closed_at
      FROM public.journal_entries
      WHERE share_token = _token AND is_public = true
      LIMIT 1
    ) x
  ) END;
$fn$;

REVOKE ALL ON FUNCTION public.get_shared_journal_entry(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_journal_entry(text) TO anon, authenticated;

-- Remove the enumerable public-read policy. Sharing now flows only through the
-- token RPC above.
DROP POLICY IF EXISTS "Public can read shared journal entries" ON public.journal_entries;
