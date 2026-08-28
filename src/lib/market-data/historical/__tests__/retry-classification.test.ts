import { describe, it, expect } from "vitest";
import { classifyImportFailure } from "../pipeline.server";
import { HistoricalProviderError } from "../providers.server";

/**
 * The retry decision for a failed historical import.
 *
 * 403 and 429 are both terminal and terminal for DIFFERENT reasons, and the
 * distinction is the point of the predicate:
 *
 *   429  a per-minute credit ceiling. Retrying inside the same minute spends
 *        more credits and fails again. Pre-existing behaviour, unchanged.
 *   403  a CloudFront geographic/WAF refusal of the source IP, evaluated per
 *        request. Seconds of backoff cannot clear it, and three retries buried
 *        the first attempt's response behind three identical ones
 *        (Bybit, 2026-08-28).
 *
 * Everything else retries — including a bare Error from a network fault, which
 * carries no status. Treating "no status" as terminal would make every timeout
 * permanent, so that case is asserted explicitly rather than left implied.
 */

const err = (status: number) =>
  new HistoricalProviderError("bybit", `HTTP ${status}`, { httpStatus: status });

/** The real gate in `runImport`'s catch: decision AND budget. */
const wouldRetry = (e: unknown, retryCount: number, maxRetries = 3) =>
  classifyImportFailure(e).retry && retryCount < maxRetries;

describe("classifyImportFailure", () => {
  it("403 does NOT retry", () => {
    const d = classifyImportFailure(err(403));
    expect(d.retry).toBe(false);
    expect(d.reason).toBe("forbidden");
  });

  it("403 short-circuits at every retry_count, so the counter never advances", () => {
    // `retry_count` is only incremented INSIDE the retry branch, so a decision
    // of `false` is what keeps it from moving. Asserted across the whole budget
    // rather than at 0, because a gate that only holds on the first attempt
    // would still let the counter climb.
    for (const attempt of [0, 1, 2, 3, 99]) {
      expect(wouldRetry(err(403), attempt)).toBe(false);
    }
  });

  it("429 does NOT retry — pre-existing behaviour, preserved", () => {
    const d = classifyImportFailure(err(429));
    expect(d.retry).toBe(false);
    expect(d.reason).toBe("throttled");
    for (const attempt of [0, 1, 2]) expect(wouldRetry(err(429), attempt)).toBe(false);
  });

  it("500 retries, and stops only when the budget is spent", () => {
    expect(classifyImportFailure(err(500)).retry).toBe(true);
    expect(wouldRetry(err(500), 0)).toBe(true);
    expect(wouldRetry(err(500), 2)).toBe(true);
    expect(wouldRetry(err(500), 3)).toBe(false); // budget, not classification
  });

  it("other 5xx and 4xx that are not 403/429 retry", () => {
    for (const s of [500, 502, 503, 504, 400, 404, 418]) {
      expect(classifyImportFailure(err(s)).retry).toBe(true);
    }
  });

  it("a network/transient error retries", () => {
    // No status at all — a transport failure, not a verdict from the origin.
    const d = classifyImportFailure(new TypeError("fetch failed"));
    expect(d.retry).toBe(true);
    expect(d.reason).toBe("transient");
    expect(wouldRetry(new TypeError("fetch failed"), 0)).toBe(true);
  });

  it("a plain unknown Error retries — unchanged from before the predicate", () => {
    expect(classifyImportFailure(new Error("something odd")).retry).toBe(true);
    expect(classifyImportFailure("a thrown string").retry).toBe(true);
    expect(classifyImportFailure(undefined).retry).toBe(true);
  });

  it("a provider error carrying NO status retries, not refuses", () => {
    // `HistoricalProviderError` without `httpStatus` must not fall into a
    // refusal branch by accident — undefined is not 403 and not 429.
    const d = classifyImportFailure(new HistoricalProviderError("bybit", "parse failed"));
    expect(d.retry).toBe(true);
    expect(d.reason).toBe("transient");
  });
});
