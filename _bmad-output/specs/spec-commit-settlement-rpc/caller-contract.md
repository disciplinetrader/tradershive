# caller-contract.md

Behavioural contract for every caller of `commit_settlement`. This document is the preservation target — the RPC's SPEC.md cites it, and any future caller must satisfy it or the settlement silently misbehaves.

## Pre-call: apply the equity clamp

Before invoking `commit_settlement`, compute the effective P&L:

```typescript
const effectivePnl = account.negative_balance_protection
 ? Math.max(rawPnl, -account.balance)
 : rawPnl;
```

This is the same formula as `clampRealizedPnl` in `settlement.ts:60-70`, expressed as a one-liner. It caps the loss at the current balance when NBP is on, producing a pnl that guarantees `balance + pnl >= 0`.

## RPC call and response shape

```typescript
const { data, error } = await supabaseAdmin.rpc("commit_settlement", {
 _account_id: accountId,
 _user_id: userId,
 _clamped_pnl: effectivePnl,
});
if (error) throw error;
// data is an array of one row — PostgREST always wraps SET OF results.
const { new_balance, clamped_pnl } = data[0];
```

**Critical:** `commit_settlement` uses `RETURNS TABLE`, which is a SET OF rows in PostgreSQL. PostgREST returns this as an array. Destructuring `data` directly (`const { new_balance } = data`) will give `undefined` for both fields. Always read `data[0]`.

## Post-call: use the RPC's clamped_pnl for statistics

```typescript
const { data: prev } = await sb.from("account_statistics")
 .select("*").eq("account_id", accountId).maybeSingle();
const next = nextStatistics(prev, clamped_pnl, countsAsTrade);
// upsert next into account_statistics
```

**Critical:** use the RPC's returned `clamped_pnl`, not the caller's `effectivePnl`. The RPC's value is authoritative: it is computed against the locked row's balance, which is the balance that was actually written. The caller's `effectivePnl` is computed against a balance read earlier in the same request — if another transaction modified the account between that read and this RPC call, the caller's value would disagree with the balance that was written. The FOR UPDATE lock prevents this for concurrent calls on the same account, but the caller-side read and the RPC-side lock are not atomic with respect to each other. Always use the RPC's return value for statistics.

## Where this lives in the codebase

- `src/lib/paper-trading.functions.ts` — `commitSettlement` function, lines ~50–78. This is the implementation of the contract above.
- `src/lib/paper-trading/settlement.ts` — `clampRealizedPnl` (line 60) and `nextBalance` (line 78). The pure functions the caller uses for the pre-clamp.
- `supabase/migrations/20260903120000_commit_settlement.sql` — the RPC definition. Contains the contract comment at the top of the function.

## Violation detection

If a caller omits the pre-clamp, the RPC's floor-binding branch fires and the function raises an exception (not a warning — see SPEC.md CON-3). This is intentional: a contract violation must fail loudly during development, not silently correct in production.
