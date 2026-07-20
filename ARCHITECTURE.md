# TradersHIVE Arena — Architecture Overview

A production-grade trading education & gamification platform. This document
gives a high-level tour of the codebase so new contributors can navigate
without reading every file.

## Tech Stack

- **Framework**: TanStack Start v1 (React 19 + Vite 7, SSR + server functions)
- **Runtime**: Cloudflare Workers (with `nodejs_compat`)
- **Backend**: Lovable Cloud (Supabase) — Postgres, Auth, Storage, Realtime
- **Styling**: Tailwind CSS v4 with semantic tokens in `src/styles.css`
- **Charts**: `lightweight-charts` behind a `ChartAdapter` interface
- **AI**: Lovable AI Gateway (chat, review, coaching)

## Directory Map

```
src/
  routes/                  File-based routes. Pages live under _authenticated/.
    api/                   HTTP endpoints (webhooks, public APIs under /api/public/*)
  components/              UI. Grouped by module (trading/, replay/, ai/, ...)
  lib/                     Business logic. Each module has its own README.
    <module>/              Pure calculations, types, constants, adapters
    <module>.functions.ts  createServerFn entry points for that module
  hooks/                   Cross-cutting React hooks (theme, hydration, ...)
  integrations/supabase/   Auto-generated Supabase clients — DO NOT EDIT
  styles.css               Design tokens (light + dark theme)

supabase/
  migrations/              SQL migrations (RLS + GRANTs required per table)
```

## Module Overview

| Module | Purpose | Docs |
| --- | --- | --- |
| `paper-trading` | Simulated trading with realistic P/L, pip math, lot sizing | `src/lib/paper-trading/README.md` |
| `market-data` | Unified quote/candle engine (Binance, Twelve Data, historical) | `src/lib/market-data/README.md` |
| `chart` | Chart adapter, indicators (SMA/EMA/RSI/MACD/SMC/ICT), sessions | `src/lib/chart/README.md` |
| `replay` | TradingView-style session replay + scoring | `src/lib/replay/README.md` |
| `journal` | Trade journaling, drafts, screenshots | `src/lib/journal/README.md` |
| `ai` | AI Coach, trade reviews, tiered rate limiting | `src/lib/ai/README.md` |
| `strategy` | Strategy Builder, flow editor, performance rollups | `src/lib/strategy/README.md` |
| `battle-arena` | Live PvP trading battles with realtime scoreboard | `src/lib/battle-arena/README.md` |
| `championship` | Monthly championships + $10k demo provisioning | (see functions file) |
| `social` | Leaderboards, leagues, follows, profiles | `src/lib/social/README.md` |
| `community` | Posts, comments, reputation | `src/lib/community/README.md` |
| `sharing` | Universal snapshot + share links for any module | `src/lib/sharing/README.md` |
| `gamification` | XP, achievements, streaks, level periods | `src/lib/gamification/README.md` |
| `admin` | RBAC-gated admin panel, audit logs, settings | `src/lib/admin/README.md` |
| `statistics` | Aggregations across trades / journal / challenges | (see functions file) |
| `dashboard` | Homepage widgets pulling from Market Data + Supabase | (see functions file) |

## Cross-Cutting Rules

- **Server functions**: use `createServerFn` from `@tanstack/react-start`.
  Protected functions must chain `.middleware([requireSupabaseAuth])`.
- **RBAC**: roles live in `public.user_roles`, checked via `has_role()` in
  RLS policies. Never store roles on `profiles`.
- **RLS + GRANT**: every public table needs both. GRANTs are not implicit.
- **Design tokens**: never hardcode colors. Use `bg-background`,
  `text-foreground`, `text-success`, `text-danger`, etc.
- **Errors**: server functions throw via `src/lib/server-errors.ts`
  (`errorGuardMiddleware` sanitises before returning to the client).
- **Charts**: only import `lightweight-charts` inside adapter files. UI
  consumes `ChartAdapter` — this keeps a migration path open to
  TradingView Advanced Charts.
- **Data flow**: React components use TanStack Query
  (`useSuspenseQuery` + loader `ensureQueryData`), not `useEffect + fetch`.

## Adding a Feature

1. Model the tables in a new migration under `supabase/migrations/` with
   `GRANT` + `ENABLE RLS` + `CREATE POLICY` in that order.
2. Put pure logic (calculations, validators, types) under `src/lib/<module>/`.
3. Put server entry points in `src/lib/<module>.functions.ts`.
4. Put UI under `src/components/<module>/` and route files under
   `src/routes/_authenticated/<module>/`.
5. Add a README section in the module folder documenting invariants.
