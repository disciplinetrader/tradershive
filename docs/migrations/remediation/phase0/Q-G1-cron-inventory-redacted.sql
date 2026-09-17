-- Q-G1 — cron.job with redacted command, endpoint and secret presence (length only)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 30 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-G1  cron.job with redacted command, endpoint and secret presence (length only)
SELECT j.jobid, j.jobname, j.schedule, j.active, j.database, j.username,
       regexp_replace(substring(j.command from 'https?://[^''"\s]+'), '\?.*$', '')  AS endpoint_no_query,
       substring(j.command from '/api/public/hooks/([A-Za-z0-9_-]+)')              AS hook,
       (j.command ILIKE '%net.http_post%' OR j.command ILIKE '%net.http_get%')     AS is_http_job,
       length(substring(j.command from '"x-cron-secret"\s*:\s*"([^"]*)"'))        AS x_cron_secret_len,
       (substring(j.command from '"x-cron-secret"\s*:\s*"([^"]*)"') LIKE '<%')     AS secret_is_placeholder,
       (j.command ~* '"authorization"\s*:\s*"Bearer')                             AS has_bearer_header,
       (j.command ~* '"apikey"\s*:')                                              AS has_apikey_header,
       regexp_replace(
         regexp_replace(
           regexp_replace(
             regexp_replace(j.command,
               '("(x-cron-secret|apikey|authorization|x-api-key)"\s*:\s*")[^"]*"', '\1<redacted>"', 'gi'),
             '(Bearer\s+)[A-Za-z0-9._~+/=-]+', '\1<redacted>', 'gi'),
           '([?&](key|apikey|api_key|token|secret)=)[^&''"\s]+', '\1<redacted>', 'gi'),
         '[A-Za-z0-9_\-]{32,}', '<redacted-token>', 'g')                          AS command_redacted
  FROM cron.job j
 ORDER BY j.jobname;
