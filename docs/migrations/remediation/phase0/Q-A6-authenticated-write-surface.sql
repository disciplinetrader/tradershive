-- Q-A6 — Derived: can authenticated directly write each table under RLS?
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 8 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-A6  Derived: can authenticated directly write each table under RLS?
--       (a privilege AND at least one permissive policy for that command that
--        applies to authenticated or public)
WITH t(name) AS (VALUES ('paper_trades'),('paper_accounts'),('account_statistics'),('prop_challenges'),
                        ('prop_challenge_days'),('battle_participants'),('battle_results'),('battle_rankings'),
                        ('championship_rankings'),('profiles'),('journal_entries'),('historical_candles')),
     c(cmd) AS (VALUES ('INSERT'),('UPDATE'),('DELETE'),('SELECT'))
SELECT t.name AS table_name, c.cmd,
       has_table_privilege('authenticated', format('public.%I', t.name), c.cmd) AS has_priv,
       EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname='public' AND p.tablename=t.name
                  AND p.permissive='PERMISSIVE'
                  AND p.cmd IN (c.cmd,'ALL')
                  AND (p.roles && ARRAY['authenticated','public']::name[])) AS has_policy,
       (SELECT string_agg(p.policyname || ' [' || p.cmd || '] USING(' || coalesce(p.qual,'-') ||
                          ') CHECK(' || coalesce(p.with_check,'-') || ')', ' | ')
          FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=t.name
           AND p.cmd IN (c.cmd,'ALL')
           AND (p.roles && ARRAY['authenticated','public']::name[])) AS policies
  FROM t CROSS JOIN c
 WHERE to_regclass(format('public.%I', t.name)) IS NOT NULL
 ORDER BY t.name, c.cmd;
