
-- Revoke sensitive column reads from generic authenticated & anon roles.
-- Owner and admin reads flow through the get_my_profile() RPC / service role.
REVOKE SELECT (email, first_name, last_name, admin_notes, deleted_at, accepted_terms_at)
  ON public.profiles FROM authenticated;
REVOKE SELECT (email, first_name, last_name, admin_notes, deleted_at, accepted_terms_at)
  ON public.profiles FROM anon;

-- Ensure the security-definer accessor exists and is only callable by signed-in users.
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
