
REVOKE EXECUTE ON FUNCTION public.cancel_championship_registration(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_battle(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_battle_by_code(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_for_championship(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_battle_host(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_battle_participant(uuid, uuid) FROM anon, PUBLIC;
