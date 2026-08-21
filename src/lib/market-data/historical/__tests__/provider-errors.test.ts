import { describe, it, expect } from "vitest";
import { isEmptyWindowError } from "../provider-errors";

/**
 * The line between "nothing here" and "something is wrong".
 *
 * Every payload below is a real response measured against the live Twelve Data
 * API on 2026-08-21, not invented. The predicate has to let exactly one of them
 * through, because the other three are faults this codebase spent a day
 * cataloguing and must keep throwing.
 */
const EMPTY_WINDOW = {
  code: 400,
  message: "No data is available on the specified dates. Try setting different start/end dates.",
  status: "error",
};
const PLAN_GATED = {
  code: 404,
  message: "This symbol is available starting with the Grow or Venture plan. Consider upgrading now at https://twelvedata.com/pricing",
  status: "error",
};
const BAD_TICKER = {
  code: 404,
  message: "**symbol** or **figi** parameter is missing or invalid. Please provide a valid symbol according to API documentation: https://twelvedata.com/docs#reference-data",
  status: "error",
};
const THROTTLED = {
  code: 429,
  message: "You have run out of API credits for the current minute. 10 API credits were used, with the current limit of 8.",
  status: "error",
};

describe("isEmptyWindowError", () => {
  it("accepts the empty-window 400 — the market was shut, the range was fine", () => {
    expect(isEmptyWindowError(EMPTY_WINDOW)).toBe(true);
  });

  it("rejects plan gating, which is an entitlement fault", () => {
    expect(isEmptyWindowError(PLAN_GATED)).toBe(false);
  });

  it("rejects an invalid ticker, which no plan fixes", () => {
    expect(isEmptyWindowError(BAD_TICKER)).toBe(false);
  });

  it("rejects a throttle — swallowing this would push into a rate limit", () => {
    expect(isEmptyWindowError(THROTTLED)).toBe(false);
  });

  it("requires BOTH the code and the message, never either alone", () => {
    // A 400 with some other cause must still throw.
    expect(isEmptyWindowError({ code: 400, message: "Invalid interval", status: "error" })).toBe(false);
    // The message under a different code is not this condition.
    expect(isEmptyWindowError({ code: 500, message: EMPTY_WINDOW.message, status: "error" })).toBe(false);
  });

  it("ignores anything that is not an error envelope", () => {
    expect(isEmptyWindowError(null)).toBe(false);
    expect(isEmptyWindowError(undefined)).toBe(false);
    expect(isEmptyWindowError({})).toBe(false);
    // A successful payload that happens to carry a code field.
    expect(isEmptyWindowError({ code: 400, message: EMPTY_WINDOW.message, status: "ok" })).toBe(false);
  });

  it("tolerates the code arriving as a string", () => {
    expect(isEmptyWindowError({ ...EMPTY_WINDOW, code: "400" })).toBe(true);
  });
});
