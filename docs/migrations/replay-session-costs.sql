alter table public.replay_sessions
  add column if not exists spread numeric not null default 0;

alter table public.replay_sessions
  add column if not exists slippage numeric not null default 0;

alter table public.replay_sessions
  drop constraint if exists replay_sessions_costs_check;

alter table public.replay_sessions
  add constraint replay_sessions_costs_check
  check (spread >= 0 and slippage >= 0);
