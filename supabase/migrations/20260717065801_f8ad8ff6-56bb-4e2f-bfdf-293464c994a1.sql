
-- Paper trading enums
CREATE TYPE public.paper_market AS ENUM ('forex','crypto','stocks','indices','futures','metals');
CREATE TYPE public.paper_direction AS ENUM ('long','short');
CREATE TYPE public.paper_order_type AS ENUM ('market','limit','stop','stop_limit');
CREATE TYPE public.paper_trade_status AS ENUM ('open','closed','cancelled');
CREATE TYPE public.paper_order_status AS ENUM ('pending','filled','cancelled','expired','rejected');
CREATE TYPE public.paper_close_reason AS ENUM ('manual','stop_loss','take_profit','liquidation','expired');

-- Accounts
CREATE TABLE public.paper_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  starting_balance NUMERIC(18,2) NOT NULL DEFAULT 10000,
  balance NUMERIC(18,2) NOT NULL DEFAULT 10000,
  equity NUMERIC(18,2) NOT NULL DEFAULT 10000,
  leverage INTEGER NOT NULL DEFAULT 100,
  max_daily_risk_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
  max_trade_risk_pct NUMERIC(5,2) NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_accounts TO authenticated;
GRANT ALL ON public.paper_accounts TO service_role;
ALTER TABLE public.paper_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.paper_accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX paper_accounts_user_idx ON public.paper_accounts(user_id) WHERE deleted_at IS NULL;

-- Trades
CREATE TABLE public.paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market public.paper_market NOT NULL,
  direction public.paper_direction NOT NULL,
  order_type public.paper_order_type NOT NULL DEFAULT 'market',
  status public.paper_trade_status NOT NULL DEFAULT 'open',
  lot_size NUMERIC(18,4) NOT NULL,
  entry_price NUMERIC(18,8) NOT NULL,
  exit_price NUMERIC(18,8),
  stop_loss NUMERIC(18,8),
  take_profit NUMERIC(18,8),
  risk_amount NUMERIC(18,2),
  reward_amount NUMERIC(18,2),
  rr_planned NUMERIC(10,3),
  rr_realized NUMERIC(10,3),
  pnl NUMERIC(18,2),
  pnl_pct NUMERIC(10,3),
  commission NUMERIC(18,2) NOT NULL DEFAULT 0,
  swap NUMERIC(18,2) NOT NULL DEFAULT 0,
  close_reason public.paper_close_reason,
  notes TEXT,
  screenshot_path TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_trades TO authenticated;
GRANT ALL ON public.paper_trades TO service_role;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trades" ON public.paper_trades FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX paper_trades_account_idx ON public.paper_trades(account_id, status);
CREATE INDEX paper_trades_user_idx ON public.paper_trades(user_id, opened_at DESC);

-- Orders (pending)
CREATE TABLE public.paper_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.paper_trades(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  market public.paper_market NOT NULL,
  direction public.paper_direction NOT NULL,
  order_type public.paper_order_type NOT NULL,
  status public.paper_order_status NOT NULL DEFAULT 'pending',
  lot_size NUMERIC(18,4) NOT NULL,
  trigger_price NUMERIC(18,8) NOT NULL,
  limit_price NUMERIC(18,8),
  stop_loss NUMERIC(18,8),
  take_profit NUMERIC(18,8),
  expires_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_orders TO authenticated;
GRANT ALL ON public.paper_orders TO service_role;
ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders" ON public.paper_orders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX paper_orders_account_idx ON public.paper_orders(account_id, status);

-- Trade tags
CREATE TABLE public.trade_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#22d3ee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_tags TO authenticated;
GRANT ALL ON public.trade_tags TO service_role;
ALTER TABLE public.trade_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tags" ON public.trade_tags FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trade_tag_relations (
  trade_id UUID NOT NULL REFERENCES public.paper_trades(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.trade_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_tag_relations TO authenticated;
GRANT ALL ON public.trade_tag_relations TO service_role;
ALTER TABLE public.trade_tag_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tag rel" ON public.trade_tag_relations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Paper watchlists (separate from dashboard watchlists)
CREATE TABLE public.paper_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  market public.paper_market,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_watchlists TO authenticated;
GRANT ALL ON public.paper_watchlists TO service_role;
ALTER TABLE public.paper_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own paper wl" ON public.paper_watchlists FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.paper_watchlist_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist_id UUID NOT NULL REFERENCES public.paper_watchlists(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market public.paper_market NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_watchlist_symbols TO authenticated;
GRANT ALL ON public.paper_watchlist_symbols TO service_role;
ALTER TABLE public.paper_watchlist_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own paper wl sym" ON public.paper_watchlist_symbols FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Position history (audit for closed trades / partial closes)
CREATE TABLE public.position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES public.paper_trades(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.position_history TO authenticated;
GRANT ALL ON public.position_history TO service_role;
ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pos history" ON public.position_history FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Account statistics (denormalized cached stats)
CREATE TABLE public.account_statistics (
  account_id UUID PRIMARY KEY REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  breakevens INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  gross_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
  gross_loss NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  best_trade NUMERIC(18,2) NOT NULL DEFAULT 0,
  worst_trade NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_statistics TO authenticated;
GRANT ALL ON public.account_statistics TO service_role;
ALTER TABLE public.account_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own account stats" ON public.account_statistics FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers
CREATE TRIGGER paper_accounts_updated BEFORE UPDATE ON public.paper_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER paper_trades_updated BEFORE UPDATE ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER paper_orders_updated BEFORE UPDATE ON public.paper_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER paper_watchlists_updated BEFORE UPDATE ON public.paper_watchlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create default account + watchlists when a user is provisioned
CREATE OR REPLACE FUNCTION public.seed_paper_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  acct_id UUID;
  wl_forex UUID;
  wl_crypto UUID;
  wl_indices UUID;
  wl_fav UUID;
BEGIN
  INSERT INTO public.paper_accounts (user_id, name, starting_balance, balance, equity)
  VALUES (NEW.id, 'Demo $10,000', 10000, 10000, 10000)
  RETURNING id INTO acct_id;
  INSERT INTO public.account_statistics (account_id, user_id) VALUES (acct_id, NEW.id);

  INSERT INTO public.paper_watchlists (user_id, name, market, is_default, sort_order)
  VALUES (NEW.id, 'Forex', 'forex', true, 0) RETURNING id INTO wl_forex;
  INSERT INTO public.paper_watchlists (user_id, name, market, sort_order)
  VALUES (NEW.id, 'Crypto', 'crypto', 1) RETURNING id INTO wl_crypto;
  INSERT INTO public.paper_watchlists (user_id, name, market, sort_order)
  VALUES (NEW.id, 'Indices', 'indices', 2) RETURNING id INTO wl_indices;
  INSERT INTO public.paper_watchlists (user_id, name, sort_order)
  VALUES (NEW.id, 'Favorites', 3) RETURNING id INTO wl_fav;

  INSERT INTO public.paper_watchlist_symbols (user_id, watchlist_id, symbol, market, sort_order) VALUES
    (NEW.id, wl_forex, 'EUR/USD', 'forex', 0),
    (NEW.id, wl_forex, 'GBP/USD', 'forex', 1),
    (NEW.id, wl_forex, 'USD/JPY', 'forex', 2),
    (NEW.id, wl_forex, 'XAU/USD', 'forex', 3),
    (NEW.id, wl_crypto, 'BTC/USDT', 'crypto', 0),
    (NEW.id, wl_crypto, 'ETH/USDT', 'crypto', 1),
    (NEW.id, wl_crypto, 'SOL/USDT', 'crypto', 2),
    (NEW.id, wl_indices, 'SPX500', 'indices', 0),
    (NEW.id, wl_indices, 'NAS100', 'indices', 1),
    (NEW.id, wl_indices, 'US30', 'indices', 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_seed_paper ON public.profiles;
CREATE TRIGGER on_profile_seed_paper
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.seed_paper_defaults();
