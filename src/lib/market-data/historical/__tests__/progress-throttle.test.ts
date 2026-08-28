import { describe, it, expect } from "vitest";
import { shouldReportProgress } from "../pipeline.server";

/**
 * The save phase writes progress to `historical_import_jobs`, and each write is
 * its own awaited round-trip. Writing one per 500-row chunk doubled the traffic
 * of the phase — 260 upserts became ~520 round-trips for a 90-day 1m import,
 * which could not finish inside the platform's request ceiling (HD-7).
 *
 * Two invariants, and the second is the one that could bite:
 *
 *   1. Only every Nth chunk reports, so the traffic actually falls.
 *   2. The LAST chunk ALWAYS reports, whatever N is and however many chunks
 *      there are. Skip it and a completed import leaves `progress` frozen
 *      short of 100 — indistinguishable, to anyone reading the row, from the
 *      dead job this change exists because of. A cleanup that makes a finished
 *      job look stalled would be a worse bug than the one it fixed.
 */
describe("shouldReportProgress", () => {
  it("reports on every Nth chunk", () => {
    expect(shouldReportProgress(10, false, 10)).toBe(true);
    expect(shouldReportProgress(20, false, 10)).toBe(true);
    expect(shouldReportProgress(260, false, 10)).toBe(true);
  });

  it("stays silent in between", () => {
    for (const i of [1, 2, 5, 9, 11, 19, 259]) {
      expect(shouldReportProgress(i, false, 10)).toBe(false);
    }
  });

  it("ALWAYS reports the last chunk, at any index", () => {
    // The invariant that keeps a finished job from reading as a stalled one.
    for (const i of [1, 3, 7, 9, 11, 137, 259]) {
      expect(shouldReportProgress(i, true, 10)).toBe(true);
    }
  });

  it("reports once for an import smaller than one interval", () => {
    // 3 chunks, N=10: silent, silent, then the final chunk reports 100.
    const reports = [1, 2, 3].map((i) => shouldReportProgress(i, i === 3, 10));
    expect(reports).toEqual([false, false, true]);
  });

  it("cuts save-phase progress writes by ~10x on a real import", () => {
    // 129,600 bars / 500 = 260 chunks — the 90-day 1m case from HD-7.
    const CHUNKS = 260;
    const writes = Array.from({ length: CHUNKS }, (_, k) =>
      shouldReportProgress(k + 1, k + 1 === CHUNKS, 10),
    ).filter(Boolean).length;
    expect(writes).toBe(26);
    expect(writes).toBeLessThan(CHUNKS / 5);
  });
});
