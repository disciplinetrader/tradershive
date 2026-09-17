-- =============================================================================
-- Phase 2 · Increment 2 (core) ROLLBACK. Run as postgres.
-- Additive migration → rollback is pure DROP. Safe while no caller uses these
-- (they are not wired into the app until the caller-migration sub-increment).
-- =============================================================================
DROP FUNCTION IF EXISTS public.close_trade(uuid,uuid,numeric,numeric,numeric,text,timestamptz);
DROP FUNCTION IF EXISTS public.partial_close_trade(uuid,uuid,numeric,jsonb);
DROP FUNCTION IF EXISTS public._apply_settlement_stats(uuid,uuid,numeric,boolean);
