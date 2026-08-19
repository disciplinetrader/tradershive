/**
 * One response shape for every scheduled job, and one rule for its status.
 *
 * ── The defect this exists to close ────────────────────────────────────────
 *
 * These endpoints process many items and catch per-item failures on purpose:
 * one bad symbol must not kill thirty-two good ones, one bad battle must not
 * block the rest. That resilience is correct and is preserved here — nothing
 * below changes what gets ATTEMPTED, only what gets REPORTED.
 *
 * What was wrong is that the report threw the failures away.
 * `battle-settlement` computed `failCount` and hardcoded `ok: true` on the
 * next line. `historical-sync` collected per-symbol errors into `results` and
 * returned `ok: true` regardless. `email-queue` spread an outcome carrying
 * `failed` next to a literal `ok: true`. A run that did nothing was
 * indistinguishable from a run that worked.
 *
 * That is not hypothetical. Five jobs sat dead for twelve days while
 * `cron.job_run_details` reported "succeeded" every minute, because pg_cron
 * records whether the STATEMENT ran, not what the server answered. And on
 * 2026-08-19 the calendar job returned `ok:false` with a 429 — correctly — and
 * still logged HTTP 200, so nothing watching status codes would ever have seen
 * it.
 *
 * ── Why the STATUS CODE and not just the body ──────────────────────────────
 *
 * There is no Sentry, no alerting, and no ops table in this project. The only
 * monitoring surface these jobs have is `net._http_response`, and the only
 * field anyone can practically watch is `status_code`. A truthful `ok:false`
 * inside a 200 is still invisible. So the verdict has to reach the status.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 *   200  every item succeeded, or there was nothing to do
 *   207  some succeeded and some failed          (Multi-Status)
 *   500  work was attempted and none of it succeeded
 *
 * 207 rather than 500 for partial failure is deliberate. At any real volume a
 * single plan-locked symbol or one malformed row is routine friction; paging
 * on it trains whoever is on call to mute the alert, which recreates this
 * exact blind spot with extra steps. 207 is semantically correct for partial
 * success and — the part that matters — is NOT 200, so a status-code-only
 * monitor still catches it.
 */

export interface JobOutcome {
  /** Items that failed. Takes precedence over `errors` when both are given. */
  failed?: number;
  /** Items attempted. Without it, total failure cannot be distinguished. */
  total?: number;
  /** Error details, used as the failure count when `failed` is absent. */
  errors?: readonly unknown[];
}

export type JobStatus = 200 | 207 | 500;

/** The status a given outcome earns. Exported for tests and for callers that
 *  need the verdict without building a Response. */
export function jobStatusFor(outcome: JobOutcome): JobStatus {
  const failed = outcome.failed ?? outcome.errors?.length ?? 0;
  const total = outcome.total;

  if (failed <= 0) return 200;
  // Nothing was attempted, so nothing can have partially succeeded. Errors
  // without work are still a failed run.
  if (total === 0) return 500;
  // Total unknown: a failure happened but total failure cannot be proven, and
  // over-reporting is how alerts get muted.
  if (total == null) return 207;
  return failed >= total ? 500 : 207;
}

/**
 * Build the response for a scheduled job.
 *
 * `ok`, `failed` and `total` are always emitted at the top level, so the body
 * is readable without knowing which endpoint produced it. Everything else in
 * `payload` is passed through untouched.
 */
export function jobResponse(payload: Record<string, unknown> & JobOutcome): Response {
  const failed = payload.failed ?? payload.errors?.length ?? 0;
  const status = jobStatusFor(payload);

  return new Response(
    JSON.stringify({
      ...payload,
      ok: status === 200,
      failed,
      total: payload.total ?? null,
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
