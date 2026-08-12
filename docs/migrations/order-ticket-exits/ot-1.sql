create table if not exists public.paper_trade_exits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.paper_trades(id) on delete cascade,
  kind text not null default 'take_profit' check (kind in ('take_profit','stop_loss')),
  idx integer not null check (idx >= 1),
  price numeric not null check (price > 0),
  percent numeric not null check (percent > 0 and percent <= 100),
  action text not null default 'none' check (action in ('none','break_even','trail')),
  status text not null default 'pending' check (status in ('pending','filled','cancelled')),
  filled_at timestamptz,
  filled_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
