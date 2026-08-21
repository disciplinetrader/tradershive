/**
 * Telling a provider's "nothing here" apart from its "something is wrong".
 *
 * Twelve Data reports an empty window as an ERROR, not as an empty array:
 *
 *   { "code": 400,
 *     "message": "No data is available on the specified dates. Try setting
 *                 different start/end dates.",
 *     "status": "error" }
 *
 * Measured 2026-08-21 against the live API with two valid, chronological,
 * past-dated ranges — AAPL 1m over Thursday's close to Friday pre-open, and
 * AAPL 1m over Saturday 13:29 to Monday 13:29. Neither range is malformed;
 * neither contains any NYSE trading.
 *
 * `providers.server.ts` threw on any `status: "error"`, so both walks treated
 * "the market was shut" as a failure: `runImport` burned its three retries,
 * marked the job `failed`, and rethrew — which meant HD-4's empty-step logic,
 * written for exactly this case, could never be reached, and the forward walk
 * failed on every US-hours symbol from the close until the next open.
 *
 * ── Why this is matched so narrowly ────────────────────────────────────────
 *
 * The other errors from this provider are REAL faults and must keep throwing.
 * All three were catalogued on 2026-08-21 while auditing the catalog (MD-7):
 *
 *   404 "available starting with the Grow or Venture plan"   entitlement
 *   404 "symbol or figi parameter is missing or invalid"     bad ticker
 *   429 "run out of API credits for the current minute"      throttle
 *
 * Only the 400 above means "your range was fine, there is simply nothing in
 * it". Widening this predicate would silently convert a plan gate or a typo'd
 * ticker into "no data", which is the failure mode that let GER40 import a
 * $46.98 ETF as a German index — a wrong answer wearing a healthy face.
 */

/** The provider's JSON error envelope, as much of it as we rely on. */
export interface ProviderErrorBody {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

/**
 * True when the provider is saying "this window is empty", which is a result,
 * not a fault. Requires BOTH the 400 and the message — either alone is too
 * broad to be safe.
 */
export function isEmptyWindowError(json: ProviderErrorBody | null | undefined): boolean {
  if (!json || String(json.status) !== "error") return false;
  if (String(json.code) !== "400") return false;
  return /no data is available on the specified dates/i.test(String(json.message ?? ""));
}
