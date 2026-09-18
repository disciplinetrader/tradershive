-- =============================================================================
-- Phase 2 · Increment 2d ROLLBACK. Run as postgres.
--
-- Restores the authenticated INSERT on paper_trades (so the pre-I2d write-through
-- path works again) and drops the authoritative RPC. Run only once the TS caller
-- has been reverted to the direct insert.
-- =============================================================================

GRANT INSERT ON public.paper_trades TO authenticated;
DROP FUNCTION IF EXISTS public.record_battle_replay_trade(uuid,uuid,uuid,jsonb);
