-- Add public.paper_trades to the realtime publication.
--
-- The battle bulk-add in 20260718082633_*.sql covered ten battle_* tables and
-- omitted paper_trades, so the live battle screen's subscription to it could
-- never fire: open-position counts and last-trade times on the leaderboard
-- populated once on mount and then went stale for the rest of the battle.
--
-- Idempotent — ALTER PUBLICATION ... ADD TABLE raises duplicate_object if the
-- table is already a member, which is the normal case on re-run.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_trades;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Deliberately NOT setting REPLICA IDENTITY FULL here, unlike the battle_*
-- tables in that migration.
--
-- FULL writes the entire old row to the WAL on every UPDATE. paper_trades is
-- the highest-write table in the schema and carries triggers that update it on
-- every price move, so the cost is real and continuous. What FULL would buy is
-- correct `battle_id` filter evaluation on DELETE, where the payload otherwise
-- carries only the primary key.
--
-- That case does not arise: user-facing deletion is soft (paper-trading
-- .functions.ts:116 sets deleted_at, which replicates as an UPDATE). The one
-- hard DELETE is the admin account wipe (admin.functions.ts:313), where a
-- missed leaderboard refresh does not matter.
--
-- If a hard-delete path is ever added to normal trading, revisit this.
