ALTER TABLE public.battle_participants ADD COLUMN is_ready BOOLEAN DEFAULT FALSE;
GRANT ALL ON public.battle_participants TO authenticated;
GRANT ALL ON public.battle_participants TO service_role;
