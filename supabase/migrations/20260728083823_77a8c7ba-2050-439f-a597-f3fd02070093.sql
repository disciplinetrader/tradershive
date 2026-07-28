
-- Revoke EXECUTE from PUBLIC / anon / authenticated on internal-only SECURITY DEFINER functions.
-- Trigger functions (returns trigger) can't be called via SQL directly, but we revoke anyway for defense in depth.
-- User-facing helpers keep default PUBLIC execute: has_role, has_permission, is_platform_admin,
-- is_battle_host, is_battle_participant, get_my_profile, join_battle, join_battle_by_code,
-- join_championship_live, register_for_championship, cancel_championship_registration.

DO $$
DECLARE
  fn record;
  keep text[] := ARRAY[
    'has_role','has_permission','is_platform_admin',
    'is_battle_host','is_battle_participant',
    'get_my_profile',
    'join_battle','join_battle_by_code',
    'join_championship_live','register_for_championship','cancel_championship_registration'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND NOT (p.proname = ANY(keep))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
                   fn.proname, fn.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role;',
                   fn.proname, fn.args);
  END LOOP;
END $$;
