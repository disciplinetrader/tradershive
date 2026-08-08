-- Battle replay configuration (step 1 of the replay-battle work).
--
-- A replay battle runs on a fixed historical dataset instead of the live feed.
-- Everything needed to reconstruct that market lives here, because the cursor
-- is DERIVED rather than stored:
--
--     cursor = f(now - start_at, replay_speed, dataset)
--
-- Every participant computes the same number from the same row, and ReplayClock
-- is deterministic in observations, so identical cursor means identical market.
-- There is deliberately no per-tick cursor column: a stored cursor would need
-- writing every second, could drift, and would become a second source of truth.

ALTER TABLE public.battles
  -- NULL = ordinary live-price battle. Non-NULL = replay battle.
  -- Carries the full DatasetIdentity.datasetId, so a client can prove the bars
  -- it loaded are the bars the battle was created against (checksum included).
  ADD COLUMN IF NOT EXISTS replay_dataset_id   TEXT,
  -- The range is stored explicitly rather than parsed back out of datasetId.
  -- The id is a composite string; treating it as a source of structured data
  -- would make its format load-bearing.
  ADD COLUMN IF NOT EXISTS replay_symbol       TEXT,
  ADD COLUMN IF NOT EXISTS replay_timeframe    TEXT,
  ADD COLUMN IF NOT EXISTS replay_from         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replay_to           TIMESTAMPTZ,
  -- Fixed at creation and shared by every participant. Nobody may change it
  -- mid-battle; that is the whole point.
  ADD COLUMN IF NOT EXISTS replay_speed        NUMERIC(6,2) NOT NULL DEFAULT 1,
  -- Observation index the market opens on. Bars before it are visible history
  -- (context to read), never replayable observations.
  ADD COLUMN IF NOT EXISTS replay_start_cursor INTEGER NOT NULL DEFAULT 0;

-- Speed band matches BATTLE_MIN_SPEED / BATTLE_MAX_SPEED in
-- src/lib/replay/battle-cursor.ts. Narrower than Replay Studio's 0.25-100:
-- a shared fixed speed gains nothing from 100x except a market that outruns
-- human reaction and exhausts any realistic dataset in seconds.
DO $$
BEGIN
  ALTER TABLE public.battles
    ADD CONSTRAINT battles_replay_speed_band
    CHECK (replay_speed >= 0.5 AND replay_speed <= 8);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A replay battle must be a complete replay battle. Half-configured rows would
-- fail at load time, in front of competitors, after the lobby has filled.
DO $$
BEGIN
  ALTER TABLE public.battles
    ADD CONSTRAINT battles_replay_config_complete
    CHECK (
      replay_dataset_id IS NULL
      OR (
        replay_symbol    IS NOT NULL AND
        replay_timeframe IS NOT NULL AND
        replay_from      IS NOT NULL AND
        replay_to        IS NOT NULL AND
        replay_to        > replay_from
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- THE SAFETY CONSTRAINT
-- ============================================================
-- Replay battles are UNRANKED until server-side fill validation (step 5).
--
-- Until the server decides which observation a fill lands on, the client is
-- the authority on its own fills, and the full candle tape - including every
-- future bar - is in browser memory by construction. That is farmable by
-- anyone who opens devtools.
--
-- Hive Rating, XP, coins and season rewards are awarded from battle results and
-- CANNOT BE UN-AWARDED retroactively. So this is enforced in the schema rather
-- than left to application code: a bug in createBattle must not be able to mint
-- a ranked replay battle.
--
-- Step 5 drops this constraint. Nothing else should.
DO $$
BEGIN
  ALTER TABLE public.battles
    ADD CONSTRAINT battles_replay_must_be_unranked
    CHECK (replay_dataset_id IS NULL OR ranked = false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON CONSTRAINT battles_replay_must_be_unranked ON public.battles IS
  'Replay battles cannot be ranked until server-side fill validation (step 5) '
  'lands. Client-authoritative fills over a client-held candle tape are '
  'farmable, and awarded rating cannot be revoked. Drop only with step 5.';

CREATE INDEX IF NOT EXISTS idx_battles_replay_dataset
  ON public.battles(replay_dataset_id)
  WHERE replay_dataset_id IS NOT NULL;
