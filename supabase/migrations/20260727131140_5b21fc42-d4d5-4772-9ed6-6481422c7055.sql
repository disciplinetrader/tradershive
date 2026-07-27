-- 1) Column-level lockdown for sensitive profile fields
REVOKE SELECT (email, admin_notes) ON public.profiles FROM authenticated;
REVOKE SELECT (email, admin_notes) ON public.profiles FROM anon;
-- service_role and postgres retain full access; owner reads sensitive fields via SECURITY DEFINER get_my_profile()

-- 2) Lock down internal trigger helper from direct API execution
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM authenticated;
-- Trigger execution runs as the table owner and is unaffected by these grants.