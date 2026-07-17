# Provider-Agnostic Market Data System

Turn the Market Data Engine from "OANDA/Twelve Data/Binance are hardcoded" into a runtime-configurable system driven by the Admin Panel. No module (Charts, Paper Trading, Replay, AI Coach, Statistics, Strategy Builder) changes — they keep calling `marketData.getQuote/getCandles/subscribe`; the engine resolves the provider from the database at call time.

## What already exists (reused, not rebuilt)

- `MarketDataProvider` interface + registry (`src/lib/market-data/providers/registry.ts`)
- Provider adapters: `binance`, `twelvedata`, `mock`
- Engine (`src/lib/market-data/engine.ts`) with quote/candle caches, subscription fan-out, per-market routing
- DB tables: `market_providers`, `provider_symbols`, `provider_connections`, `user_market_settings`
- Admin shell + RBAC (`is_platform_admin`, `has_permission`)
- Encryption helper pattern (AES-256-GCM, `APP_USER_CONNECTION_KEY_SECRET`)

## What we're adding

### 1. Provider descriptor (developer-facing)

Every provider exports a static `descriptor` describing itself. Registration + admin UI are driven from this — no other code changes to add a new provider.

```text
ProviderDescriptor {
  code, name, description, website
  markets: MarketKind[]           // what it can serve
  capabilities: { rest, ws, historical, streaming, orderbook }
  credentials: CredentialField[]  // [{ key, label, type: 'text'|'password'|'select', required, placeholder, help, options? }]
  publicByDefault: boolean        // true = works with zero credentials (Binance public, Coinbase public)
}
```

New adapters stubbed with descriptor + REST/WS shells (they light up as soon as an admin adds keys): `finnhub`, `polygon`, `alphavantage`, `coinbase`, `kraken`, `bybit`, `okx`, `alpaca`. OANDA descriptor kept in the registry (no longer hardcoded as default) so anyone who wants it can still enable it. `mt` and `ibkr` are declared as descriptors only, marked `comingSoon: true`.

### 2. Database

```text
provider_credentials (server-only, service_role reads)
  id, provider_code, field_key, ciphertext, updated_by, updated_at
  UNIQUE (provider_code, field_key)

provider_market_assignments
  market_kind PK, primary_code, fallback_code, updated_by, updated_at

provider_health_checks
  id, provider_code, checked_at, ok, latency_ms, error_code, error_message

Update market_providers: add is_configured (derived), last_health_at, last_health_ok
```

RLS: `provider_credentials` — service_role only. `provider_market_assignments` — read for `authenticated`, write for admins via server fn. `provider_health_checks` — read for admins, write via server fn.

### 3. Server layer

- `src/lib/market-data/credentials.server.ts` — `getCredential(code, key)` / `setCredential` using existing AES-GCM crypto pattern (reuses `APP_USER_CONNECTION_KEY_SECRET`, or provisions `MARKET_PROVIDER_KEY_SECRET` via `generate_secret`).
- `src/lib/market-data/admin.functions.ts` — `listProviderConfig`, `saveProviderCredentials`, `saveMarketAssignments`, `testProviderConnection`, `runHealthChecks`. All gated by `has_role(admin/super_admin)`; credential writes verify role via `context.supabase` before loading `supabaseAdmin`.
- Provider adapters gain `getCredentials()` that reads from `provider_credentials` (server-side) rather than `process.env`. Client-side code never sees a credential.

### 4. Engine changes

`pickProvider(market)` becomes async and reads from `provider_market_assignments` (cached 60s per instance):

```text
1. Look up assignment for market
2. Try primary → if unhealthy/unconfigured, try fallback
3. Neither available → throw MarketProviderUnavailableError { market, reason }
4. Never fall back to mock silently
```

Errors bubble to callers so UI can show "Forex provider not configured." Failover logs to `provider_health_checks` and emits an admin notification (existing `notification_campaigns` infrastructure).

### 5. Admin UI

Under `/admin/market-data`:

- `providers` — list card per registered provider (name, status pill, health, latency, supported markets, Enable/Disable toggle, "Configure" and "Test connection" buttons)
- `providers.$code` — dynamic form rendered from `descriptor.credentials`; Test Connection button hits `testProviderConnection`
- `assignments` — per-market Primary/Fallback selects (only providers whose descriptor advertises the market)
- `health` — recent `provider_health_checks` rows, filterable

### 6. First-run wizard

`/admin/market-data/setup` — shown when 0 market assignments exist or triggered from a dashboard banner. 5 steps as specified: choose crypto → choose forex → enter keys (only for providers that require them) → test → finish.

### 7. Removal / cleanup

- Delete `AUTO_PER_MARKET` map and hardcoded `preferredProvider` in engine — replaced by DB assignments.
- Remove any lingering OANDA references from settings dropdowns and copy.
- Remove `.env` requirements for `TWELVE_DATA_API_KEY` — credentials live in DB now (env var kept as an optional bootstrap read only).

## Non-goals for this pass

- Actual Interactive Brokers / MetaTrader adapters (descriptors only, marked `comingSoon`).
- Order book streams (interface stub only).
- Per-user provider overrides (`user_market_settings` stays untouched; admin assignments are platform-wide).

## Files (new)

```
src/lib/market-data/
  descriptors.ts                 // all provider descriptors in one place
  credentials.server.ts
  admin.functions.ts
  errors.ts                      // MarketProviderUnavailableError, etc.
  providers/
    finnhub.ts, polygon.ts, alphavantage.ts, coinbase.ts,
    kraken.ts, bybit.ts, okx.ts, alpaca.ts, oanda.ts (restored, opt-in)
src/components/admin/market-data/
  ProviderCard.tsx, CredentialForm.tsx, AssignmentMatrix.tsx,
  HealthTable.tsx, SetupWizard.tsx
src/routes/_authenticated/
  admin.market-data.tsx (layout)
  admin.market-data.providers.tsx
  admin.market-data.providers.$code.tsx
  admin.market-data.assignments.tsx
  admin.market-data.health.tsx
  admin.market-data.setup.tsx
```

## Files (modified)

- `src/lib/market-data/engine.ts` — async `pickProvider`, DB-backed assignments, no mock fallback
- `src/lib/market-data/providers/registry.ts` — auto-register every descriptor
- `src/lib/market-data/types.ts` — `ProviderDescriptor`, `CredentialField`
- `src/routes/_authenticated/admin.tsx` — add "Market Data" nav item
- `src/routes/_authenticated/market.settings.tsx` — remove hardcoded dropdown, link to admin panel
- Migration: add `provider_credentials`, `provider_market_assignments`, `provider_health_checks`; add `last_health_*` cols

## Untouched

Authentication, Paper Trading UI, Journal, Statistics, Challenges, Replay, AI Coach, Strategy Builder, Charts. All keep calling the engine unchanged.

## Order of work

1. Migration (new tables + columns).
2. Descriptors + provider stubs + registry.
3. `credentials.server.ts` + `admin.functions.ts` + `errors.ts`.
4. Engine rewrite (async `pickProvider`, failover, no mock).
5. Admin UI routes + components.
6. Setup wizard + first-run banner.
7. Remove OANDA/Twelve Data assumptions from settings + docs.
8. Smoke test: Binance quote (public) + gated forex error path via `stack_modern--invoke-server-function`.
