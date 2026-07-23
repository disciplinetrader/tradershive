-- Restrict sensitive columns on profiles from being SELECTable by regular authenticated users.
-- The row-level policy remains permissive for public profile fields, but column-level
-- privileges hide email and admin_notes from the authenticated role. The service_role
-- (used by admin server functions) retains full access, and users still read their own
-- email from the Supabase auth session, not from this table.

REVOKE SELECT (email, admin_notes) ON public.profiles FROM authenticated;
REVOKE SELECT (email, admin_notes) ON public.profiles FROM anon;

-- Ensure service_role keeps full access for admin surfaces.
GRANT SELECT ON public.profiles TO service_role;