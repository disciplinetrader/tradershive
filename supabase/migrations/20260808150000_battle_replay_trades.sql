-- Replay-battle fills in `paper_trades` (step 4 + 4b).
--
-- Battles read `paper_trades` for rankings, the leaderboard and settlement, so
-- replay fills must land there rather than in a parallel table. Two things have
-- to change for that to be correct.

-- ============================================================
-- 1. Provenance columns
-- ============================================================

ALTER TABLE public.paper_trades
  -- The exact observation index the fill landed on. Market time alone does not
  -- identify a bar uniquely once intrabar observations are involved, so without
  -- this a disputed replay result cannot be reconstructed.
  --
  -- This is also the seam step 5 needs: server-side validation means recomputing
  -- which observation a submitted fill SHOULD have landed on and comparing it
  -- against what the client claimed.
  ADD COLUMN IF NOT EXISTS observation_cursor INTEGER;

COMMENT ON COLUMN public.paper_trades.observation_cursor IS
  'Replay-battle fills only: the observation index within the battle dataset '
  'that this fill executed on. NULL for live-price trades.';

CREATE INDEX IF NOT EXISTS idx_paper_trades_observation_cursor
  ON public.paper_trades(battle_id, observation_cursor)
  WHERE observation_cursor IS NOT NULL;

-- ============================================================
-- 2. Battle-window enforcement uses battle time, not market time
-- ============================================================
--
-- `enforce_battle_rules_on_trade` compared `opened_at` against
-- [start_at, end_at]. For a live-price trade those are the same clock, so the
-- check was correct. For a replay trade `opened_at` is MARKET time — a 2023
-- candle — and the comparison rejects every fill outright.
--
-- The battle's own clock is `created_at`, which the row defaults to now() at
-- insert. That is the value the window should have been testing all along: it
-- asks "was this trade submitted during the battle", which is the actual rule.
-- `opened_at` continues to carry market time so the trade sits on the right
-- candle in any later review.
--
-- Everything else in this function is carried over verbatim.
CREATE OR REPLACE FUNCTION public.enforce_battle_rules_on_trade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b RECORD;
  v_submitted TIMESTAMPTZ;
BEGIN
  IF NEW.battle_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO b FROM public.battles WHERE id = NEW.battle_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF b.status <> 'live' THEN
    INSERT INTO public.battle_logs(battle_id, user_id, event_type, message, metadata)
    VALUES (b.id, NEW.user_id, 'rule_violation', 'Battle not live', jsonb_build_object('status', b.status));
    RAISE EXCEPTION 'Battle is not live (status=%). Trade rejected.', b.status;
  END IF;

  -- Battle wall-clock. COALESCE because created_at's default has not been
  -- applied yet in a BEFORE INSERT trigger when the caller did not supply one.
  v_submitted := COALESCE(NEW.created_at, now());

  IF v_submitted < b.start_at OR v_submitted > b.end_at THEN
    INSERT INTO public.battle_logs(battle_id, user_id, event_type, message, metadata)
    VALUES (b.id, NEW.user_id, 'rule_violation', 'Trade outside battle time window',
            jsonb_build_object('submitted_at', v_submitted, 'start_at', b.start_at, 'end_at', b.end_at));
    RAISE EXCEPTION 'Trade outside battle time window.';
  END IF;

  IF array_length(b.allowed_symbols, 1) IS NOT NULL AND array_length(b.allowed_symbols, 1) > 0 THEN
    IF NOT (NEW.symbol = ANY(b.allowed_symbols)) THEN
      INSERT INTO public.battle_logs(battle_id, user_id, event_type, message, metadata)
      VALUES (b.id, NEW.user_id, 'rule_violation', 'Symbol not allowed', jsonb_build_object('symbol', NEW.symbol));
      RAISE EXCEPTION 'Symbol % not allowed in this battle.', NEW.symbol;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_battle_rules ON public.paper_trades;
CREATE TRIGGER trg_enforce_battle_rules BEFORE INSERT ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_battle_rules_on_trade();

-- ============================================================
-- 3. Replay battles are limited to USD-quoted symbols
-- ============================================================
--
-- Replay fills are priced by the ENGINE formula, which reports P&L in the
-- instrument's quote currency, while `paper_trades.pnl` is in account currency.
-- Those coincide only for USD-quoted instruments. A USD/JPY replay battle would
-- write yen into a USD column — roughly 157x inflation.
--
-- The application enforces this from symbol metadata
-- (`isEnginePricedSymbol`, derived from pipValuePerLot / pipSize ==
-- contractSize) because that stays correct as symbols are added. This
-- constraint is the backstop for the six pairs that exist today, so a bug in
-- createBattle cannot mint an unfair battle. See BA-8 / BA-10.
DO $$
BEGIN
  ALTER TABLE public.battles
    ADD CONSTRAINT battles_replay_usd_quoted_symbols
    CHECK (
      replay_dataset_id IS NULL
      OR replay_symbol NOT IN ('USD/JPY','GBP/JPY','EUR/JPY','USD/CAD','USD/CHF','EUR/GBP')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON CONSTRAINT battles_replay_usd_quoted_symbols ON public.battles IS
  'Replay battles price fills with the engine formula, which reports quote '
  'currency. Cross pairs would store non-USD amounts in a USD column. Widening '
  'this requires a currency conversion layer first - see BA-10.';
