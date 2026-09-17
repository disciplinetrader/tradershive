-- Q-G4 — HTTP outcomes actually returned to pg_net (retention is short; "at least")
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 33 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-G4  HTTP outcomes actually returned to pg_net (retention is short; "at least")
SELECT date_trunc('hour', created) AS hour,
       status_code, timed_out, count(*) AS responses,
       left(max(error_msg), 120) AS sample_error
  FROM net._http_response
 WHERE created > now() - interval '48 hours'
 GROUP BY 1, 2, 3
 ORDER BY 1 DESC, responses DESC;
