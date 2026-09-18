import { describe, it, expect } from "vitest";
import { boundedIncrementalFrom, MAX_INCREMENTAL_LOOKBACK_MS } from "../pipeline.server";

const DAY = 86_400_000;

describe("boundedIncrementalFrom (N-13 ratchet breaker)", () => {
  const now = Date.parse("2026-09-18T10:00:00Z");

  it("leaves a healthy (recent) edge untouched", () => {
    const raw = now - 5 * 60_000; // 5 minutes behind — a normal incremental run
    expect(boundedIncrementalFrom(raw, now)).toBe(raw);
  });

  it("leaves a fresh 2-day seed untouched (within the cap)", () => {
    const raw = now - 2 * DAY;
    expect(boundedIncrementalFrom(raw, now)).toBe(raw);
  });

  it("clamps a stale edge (the 2026-09-04 freeze) up to now - cap", () => {
    const raw = Date.parse("2026-09-04T20:00:00Z"); // ~14 days behind
    const out = boundedIncrementalFrom(raw, now);
    expect(out).toBe(now - MAX_INCREMENTAL_LOOKBACK_MS);
    expect(out).toBeGreaterThan(raw); // ratchet broken — resumes forward
    // resume window is inside the cap, so the provider can actually serve it
    expect(now - out).toBeLessThanOrEqual(MAX_INCREMENTAL_LOOKBACK_MS);
  });

  it("is exactly at the boundary at now - cap", () => {
    const raw = now - MAX_INCREMENTAL_LOOKBACK_MS;
    expect(boundedIncrementalFrom(raw, now)).toBe(raw);
  });
});
