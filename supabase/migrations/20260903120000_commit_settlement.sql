-- commit_settlement — atomic balance write for paper account settlements.
--
-- Replaces three sequential Supabase network calls (balance UPDATE →
-- statistics SELECT → statistics UPSERT) with a single RPC that performs
-- the authoritative balance update inside one database transaction.
--
-- Transaction semantics: all statements execute within a single implicit
-- transaction. An unhandled exception rolls back the entire function.
-- No partial writes survive a failure.
--
-- CALLER CONTRACT — this function takes a _clamped_pnl that has already
-- been passed through the equity clamp (clampRealizedPnl / Math.max(0,
-- balance + pnl)). The caller is responsible for:
-- 1. Reading the current balance
-- 2. Applying the equity clamp to produce the effective P&L
-- 3. Updating account_statistics using the returned clamped_pnl
--
-- The RPC enforces the balance floor independently as defense-in-depth:
-- if a future caller omits the pre-clamp, the balance can never go below
-- zero when NBP is on. The two clamps are algebraically equivalent — see
-- the equivalence analysis in the migration plan — but the RPC's version
-- is authoritative because it reads the locked row's balance, not a
-- possibly-stale snapshot.
--
-- If the RPC tightens a pnl the caller already clamped, that indicates a
-- contract violation: the caller read a stale balance or skipped the clamp.
-- This function raises an exception rather than silently correcting, so
-- contract violations surface during development instead of hiding.
--
-- GRANT pattern follows the project convention: service_role (cron) and
-- authenticated (user-facing handlers that already enforce ownership).

CREATE OR REPLACE FUNCTION public.commit_settlement(
 _account_id uuid,
 _user_id uuid,
 _clamped_pnl numeric
)
RETURNS TABLE(new_balance numeric, clamped_pnl numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_balance numeric;
 v_nbp boolean;
 v_pnl numeric := _clamped_pnl;
BEGIN
 -- Lock the account row and verify ownership in the same statement.
 -- FOR UPDATE serializes concurrent settlements on the same account.
 SELECT balance, negative_balance_protection
 INTO v_balance, v_nbp
 FROM public.paper_accounts
 WHERE id = _account_id AND user_id = _user_id
 FOR UPDATE;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Account not found or access denied';
 END IF;

 -- Balance floor — active only when negative_balance_protection is
 -- enabled. When NBP is off, the account is explicitly allowed to go
 -- negative (prop-firm / broker-style accounts); this function does
 -- not override that choice. The caller already applied the equity
 -- clamp, which guarantees this GREATEST is a no-op in all correct
 -- callers. It fires only if the caller passed an unclamped negative
 -- pnl or read a stale balance, which is a contract violation.
 IF v_pnl < 0 AND v_nbp THEN
 IF v_pnl < -v_balance THEN
 RAISE EXCEPTION 'commit_settlement: caller passed unclamped pnl % for balance % on account % (user %)',
 _clamped_pnl, v_balance, _account_id, _user_id;
 END IF;
 v_pnl := GREATEST(v_pnl, -v_balance);
 END IF;

 -- Write the new balance.
 v_balance := v_balance + v_pnl;
 UPDATE public.paper_accounts
 SET balance = v_balance, equity = v_balance, updated_at = now()
 WHERE id = _account_id;

 -- If the row vanished between the locked SELECT and UPDATE (extreme
 -- edge case, but the check costs nothing), fail loudly rather than
 -- returning success with no write.
 IF NOT FOUND THEN
 RAISE EXCEPTION 'commit_settlement: account % not found for user % (race or wrong owner)', _account_id, _user_id;
 END IF;

 -- Return the authoritative state.
 new_balance := v_balance;
 clamped_pnl := v_pnl;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_settlement(
 uuid, uuid, numeric
) TO authenticated, service_role;
