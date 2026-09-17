-- Q-H7 — Provider credential presence (names only — ciphertext NOT selected)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 41 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H7  Provider credential presence (names only — ciphertext NOT selected)
SELECT provider_code, field_key, (length(ciphertext) > 0) AS present, updated_at
  FROM public.provider_credentials
 ORDER BY provider_code, field_key;
