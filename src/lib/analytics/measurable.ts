/**
 * "Measurable" — the shared shape for a number that exists but should not yet
 * be read as a finding.
 *
 * Distinct from `null`, and the distinction matters. Elsewhere in this engine
 * `null` means NOT COMPUTABLE: R with no risk basis, return % with no starting
 * balance, profit factor with no losses. A win rate over two trades is not that
 * — it is perfectly computable and perfectly useless. Nulling it would erase a
 * real number; printing it bare states a finding the sample cannot support.
 *
 * This lived in `journal/reports.ts`, so only the journal's six reports were
 * protected by it. Everything reading `computePerformance` directly — Replay
 * Studio's session summary among them — printed a 100% win rate off one trade
 * as flatly as one off two hundred. It belongs in the engine both surfaces
 * share.
 */

/** Below this many decided trades, a rate is reported as not measurable. */
export const MIN_SAMPLE = 5;

export type Measurable<T> =
  | { measurable: true; value: T; sample: number }
  | { measurable: false; reason: string; sample: number };

/**
 * A rate is measurable only with enough decided trades behind it.
 *
 * This is the guard against "100% win rate (1 trade)" — a number that reads as
 * a finding and is noise. The reason string is rendered verbatim, so it has to
 * say what is missing, not just that something is.
 */
export function measurableRate(
  sample: number, value: number, min = MIN_SAMPLE,
): Measurable<number> {
  if (sample <= 0) return { measurable: false, reason: "No trades in range", sample };
  if (sample < min) {
    return {
      measurable: false,
      reason: `Needs ${min} trades, has ${sample}`,
      sample,
    };
  }
  return { measurable: true, value, sample };
}
