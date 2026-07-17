CREATE OR REPLACE FUNCTION public.create_journal_draft_from_trade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sec INTEGER;
BEGIN
  IF NEW.status <> 'closed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE trade_id = NEW.id) THEN RETURN NEW; END IF;
  sec := NULL;
  IF NEW.opened_at IS NOT NULL AND NEW.closed_at IS NOT NULL THEN
    sec := GREATEST(0, EXTRACT(EPOCH FROM (NEW.closed_at - NEW.opened_at))::INTEGER);
  END IF;
  INSERT INTO public.journal_entries (
    user_id, trade_id, account_id, market, symbol, direction,
    entry_price, exit_price, stop_loss, take_profit, lot_size,
    rr, pnl, commission, swap, opened_at, closed_at, duration_seconds, status
  ) VALUES (
    NEW.user_id, NEW.id, NEW.account_id, NEW.market, NEW.symbol, NEW.direction,
    NEW.entry_price, NEW.exit_price, NEW.stop_loss, NEW.take_profit, NEW.lot_size,
    COALESCE(NEW.rr_realized, NEW.rr_planned), NEW.pnl, COALESCE(NEW.commission, 0), COALESCE(NEW.swap, 0),
    NEW.opened_at, NEW.closed_at, sec, 'draft'
  );
  RETURN NEW;
END;
$$;