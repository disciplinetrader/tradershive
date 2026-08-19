import { describe, it, expect } from "vitest";
import { jobResponse, jobStatusFor } from "../cron-response";

/**
 * The status rule for scheduled jobs.
 *
 * These assertions are the contract a monitor depends on. The only field
 * anyone can watch is `status_code` in `net._http_response` — there is no
 * Sentry and no ops table — so "the body said ok:false" is not a defence if
 * the status was 200.
 */

const body = async (r: Response) => JSON.parse(await r.text());

describe("jobStatusFor — the rule", () => {
  it("200 when everything succeeded", () => {
    expect(jobStatusFor({ failed: 0, total: 33 })).toBe(200);
  });

  it("200 when there was nothing to do", () => {
    // An empty run is not a failure. Reporting it as one is how a job that is
    // merely idle gets treated as broken.
    expect(jobStatusFor({ failed: 0, total: 0 })).toBe(200);
    expect(jobStatusFor({})).toBe(200);
  });

  it("207 when some succeeded and some failed", () => {
    expect(jobStatusFor({ failed: 1, total: 33 })).toBe(207);
    expect(jobStatusFor({ failed: 32, total: 33 })).toBe(207);
  });

  it("500 when work was attempted and none of it succeeded", () => {
    expect(jobStatusFor({ failed: 33, total: 33 })).toBe(500);
    expect(jobStatusFor({ failed: 1, total: 1 })).toBe(500);
  });

  it("500 when errors arrived with no work attempted", () => {
    // The calendar 429 case: one feed, one error, nothing fetched.
    expect(jobStatusFor({ failed: 1, total: 0 })).toBe(500);
  });

  it("207 rather than 500 when the total is unknown", () => {
    // Total failure cannot be proven without a denominator, and
    // over-reporting is exactly how an alert gets muted.
    expect(jobStatusFor({ failed: 5 })).toBe(207);
  });

  it("counts `errors` when no explicit failure count is given", () => {
    expect(jobStatusFor({ errors: ["a", "b"], total: 10 })).toBe(207);
    expect(jobStatusFor({ errors: [], total: 10 })).toBe(200);
  });

  it("prefers an explicit `failed` over the length of `errors`", () => {
    // A caller that reports 3 failures but only surfaced 1 message means 3.
    expect(jobStatusFor({ failed: 3, errors: ["only one"], total: 3 })).toBe(500);
  });

  it("never reports a failure as 200, whatever the shape", () => {
    // The single invariant everything else rests on.
    for (const outcome of [
      { failed: 1 }, { failed: 1, total: 2 }, { failed: 9, total: 9 },
      { errors: ["x"] }, { errors: ["x"], total: 1 }, { failed: 1, total: 0 },
    ]) {
      expect(jobStatusFor(outcome), JSON.stringify(outcome)).not.toBe(200);
    }
  });
});

describe("jobResponse — the body", () => {
  it("sets the HTTP status from the same rule", async () => {
    expect(jobResponse({ failed: 0, total: 5 }).status).toBe(200);
    expect(jobResponse({ failed: 2, total: 5 }).status).toBe(207);
    expect(jobResponse({ failed: 5, total: 5 }).status).toBe(500);
  });

  it("always emits ok, failed and total, whatever the caller passed", async () => {
    const b = await body(jobResponse({ synced: 4 }));
    expect(b).toMatchObject({ ok: true, failed: 0, total: null, synced: 4 });
  });

  it("keeps ok consistent with the status — never true on a 207", async () => {
    // The original defect in one line: `ok: true` sitting next to a known
    // failure count.
    const res = jobResponse({ failed: 1, total: 33, results: [] });
    expect(res.status).toBe(207);
    expect((await body(res)).ok).toBe(false);
  });

  it("passes the caller's own fields through untouched", async () => {
    const b = await body(jobResponse({
      failed: 1, total: 2,
      windowFrom: "2026-08-16", results: [{ symbol: "ETH/USDT", ok: true }],
    }));
    expect(b.windowFrom).toBe("2026-08-16");
    expect(b.results).toEqual([{ symbol: "ETH/USDT", ok: true }]);
  });

  it("cannot be overridden into lying by a caller passing ok:true", async () => {
    // `ok` is derived last, so a copy-pasted `ok: true` cannot resurrect the
    // bug this module exists to remove.
    const res = jobResponse({ ok: true, failed: 4, total: 4 } as never);
    expect(res.status).toBe(500);
    expect((await body(res)).ok).toBe(false);
  });

  it("declares JSON", () => {
    expect(jobResponse({}).headers.get("Content-Type")).toBe("application/json");
  });
});
