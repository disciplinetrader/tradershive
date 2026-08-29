import { describe, it, expect, vi, afterEach } from "vitest";
import {
  enqueueImportJob,
  claimQueuedJob,
  drainQueuedJobs,
  type RunImportOpts,
} from "../pipeline.server";

/**
 * The admin import queue.
 *
 * WHY THIS EXISTS AT ALL, because it is not a performance change:
 *
 * A Cloudflare Worker runs in the colo nearest whoever triggered it, and the
 * colo decides the outbound egress. Measured 2026-08-29 with the same probe
 * against the same host and path:
 *
 *   pg_net (Supabase)  -> KR / ICN -> Bybit ICN57-P6 -> HTTP 200
 *   browser (India)    -> IN / BOM -> Bybit MCI50-P5 -> HTTP 403
 *                         "configured to block access from your country"
 *
 * on the FIRST request, with no sustained traffic. So an admin import that
 * fetches inline runs the provider call from an egress nobody selected. Moving
 * the fetch to the scheduled path is the fix, and the load-bearing invariant is
 * therefore NOT "queueing works" but "the manual path never touches the
 * provider" - pinned in the first test below.
 */

const NOW = Date.UTC(2026, 7, 29, 9, 0, 0);
const RANGE = { from: Date.UTC(2026, 5, 28), to: Date.UTC(2026, 6, 18) };

/* ── a chainable fake of the admin client ────────────────────────────────── */

type Op = {
  table: string;
  kind: "select" | "insert" | "update";
  payload?: unknown;
  /** Filters applied to this operation, so a guard can be asserted rather than assumed. */
  eqs?: Array<[string, unknown]>;
};

function fakeAdmin(cfg: {
  duplicates?: unknown[];
  queued?: Array<{ id: string }>;
  claimWins?: boolean;
  symbolRow?: Record<string, unknown> | null;
  claimed?: Record<string, unknown>;
}) {
  const ops: Op[] = [];
  const claimWins = cfg.claimWins ?? true;

  const thenable = <T,>(value: T) => Promise.resolve(value);

  const admin = {
    from(table: string) {
      const selectChain = (): Record<string, unknown> => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: (_n: number) =>
            thenable({
              data: table === "historical_import_jobs"
                ? (ops.some((o) => o.kind === "insert") ? [] : (cfg.duplicates ?? cfg.queued ?? []))
                : [],
              error: null,
            }),
          maybeSingle: () => thenable({ data: cfg.symbolRow ?? null, error: null }),
          single: () => thenable({ data: { id: "new-job" }, error: null }),
        };
        return chain;
      };

      return {
        select: (_cols?: string) => {
          ops.push({ table, kind: "select" });
          return selectChain();
        },
        insert: (payload: unknown) => {
          ops.push({ table, kind: "insert", payload });
          return {
            select: () => ({ single: () => thenable({ data: { id: "new-job" }, error: null }) }),
          };
        },
        update: (payload: unknown) => {
          const eqs: Array<[string, unknown]> = [];
          ops.push({ table, kind: "update", payload, eqs });
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => { eqs.push([col, val]); return chain; },
            select: () =>
              thenable({ data: claimWins ? [cfg.claimed ?? { id: "j1", symbol: "BTC/USDT", source_code: "bybit", timeframe: "1m", range_from: new Date(RANGE.from).toISOString(), range_to: new Date(RANGE.to).toISOString(), metadata: { aggregate: true } }] : [], error: null }),
          };
          return chain;
        },
      };
    },
  };
  return { admin: admin as unknown as Parameters<typeof enqueueImportJob>[0], ops };
}

/** Fails the test if anything reaches the network. */
function forbidFetch() {
  const spy = vi.fn(() => {
    throw new Error("provider fetch attempted from the manual/admin path");
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ── the critical regression ─────────────────────────────────────────────── */

describe("manual import path", () => {
  it("CRITICAL: enqueues without making a single provider call", async () => {
    // The whole point of the architecture. If a future refactor puts a fetch
    // back into the manual path, this fails - and the symptom in production
    // would be an intermittent CloudFront 403 that depends on who clicked and
    // from where, which is far harder to diagnose than a red test.
    const fetchSpy = forbidFetch();
    const { admin, ops } = fakeAdmin({});

    const res = await enqueueImportJob(admin, {
      symbol: "BTC/USDT", sourceCode: "bybit", timeframe: "1m",
      from: RANGE.from, to: RANGE.to, aggregate: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.jobId).toBe("new-job");
    expect(res.deduped).toBe(false);
    // Only the jobs table was touched, and only to look and insert.
    expect(ops.every((o) => o.table === "historical_import_jobs")).toBe(true);
    expect(ops.some((o) => o.kind === "insert")).toBe(true);
  });

  it("writes a job that is queued in BOTH status and phase", async () => {
    forbidFetch();
    const { admin, ops } = fakeAdmin({});
    await enqueueImportJob(admin, {
      symbol: "BTC/USDT", sourceCode: "bybit", timeframe: "1m", from: RANGE.from, to: RANGE.to,
    });
    const row = ops.find((o) => o.kind === "insert")?.payload as Record<string, unknown>;
    expect(row.status).toBe("queued");
    expect(row.phase).toBe("queued");
    expect(row.symbol).toBe("BTC/USDT");
    expect(row.source_code).toBe("bybit");
    expect(row.timeframe).toBe("1m");
    expect(row.range_from).toBe(new Date(RANGE.from).toISOString());
    expect(row.range_to).toBe(new Date(RANGE.to).toISOString());
  });

  it("carries `aggregate` in metadata, since it belongs to the request", async () => {
    forbidFetch();
    const a = fakeAdmin({});
    await enqueueImportJob(a.admin, {
      symbol: "X", sourceCode: "bybit", timeframe: "1m", from: RANGE.from, to: RANGE.to, aggregate: false,
    });
    const row = a.ops.find((o) => o.kind === "insert")?.payload as Record<string, unknown>;
    expect((row.metadata as Record<string, unknown>).aggregate).toBe(false);
  });

  it("dedupes against an active job instead of enqueuing a second", async () => {
    forbidFetch();
    const { admin, ops } = fakeAdmin({ duplicates: [{ id: "existing-1" }] });
    const res = await enqueueImportJob(admin, {
      symbol: "BTC/USDT", sourceCode: "bybit", timeframe: "1m", from: RANGE.from, to: RANGE.to,
    });
    expect(res).toEqual({ jobId: "existing-1", deduped: true });
    expect(ops.some((o) => o.kind === "insert")).toBe(false);
  });
});

/* ── claiming ────────────────────────────────────────────────────────────── */

describe("claimQueuedJob", () => {
  it("claims a queued job and flips it to running/preparing", async () => {
    const { admin, ops } = fakeAdmin({ claimWins: true });
    const job = await claimQueuedJob(admin, "j1", NOW);
    expect(job).not.toBeNull();
    const patch = ops.find((o) => o.kind === "update")?.payload as Record<string, unknown>;
    expect(patch.status).toBe("running");
    expect(patch.phase).toBe("preparing");
    expect(patch.started_at).toBe(new Date(NOW).toISOString());
  });

  it("filters the claim on status='queued' - the concurrency guard itself", async () => {
    // Asserted on the FILTER, not on the outcome. The fake decides win/lose by
    // flag, so an outcome-only test passes even with the guard deleted: that
    // mutation survived until this test existed. Without `status = 'queued'` in
    // the update, two invocations would both "claim" the same row and run the
    // same import twice.
    const { admin, ops } = fakeAdmin({ claimWins: true });
    await claimQueuedJob(admin, "j1", NOW);
    const upd = ops.find((o) => o.kind === "update");
    expect(upd?.eqs).toEqual(
      expect.arrayContaining([["id", "j1"], ["status", "queued"]]),
    );
  });

  it("returns null when another invocation already claimed it", async () => {
    const { admin } = fakeAdmin({ claimWins: false });
    expect(await claimQueuedJob(admin, "j1", NOW)).toBeNull();
  });
});

/* ── draining ────────────────────────────────────────────────────────────── */

describe("drainQueuedJobs", () => {
  const runnerOk = () => {
    const calls: RunImportOpts[] = [];
    return { calls, runner: async (o: RunImportOpts) => { calls.push(o); return {}; } };
  };

  it("is a silent no-op when nothing is queued", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, ops } = fakeAdmin({ queued: [] });
    const { calls, runner } = runnerOk();

    const res = await drainQueuedJobs(admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW, runner,
    });

    expect(res).toMatchObject({ considered: 0, claimed: 0, executed: 0, failed: 0, skipped: 0 });
    expect(calls).toHaveLength(0);
    expect(ops.some((o) => o.kind === "update")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("executes a claimed job through runImport with existingJobId", async () => {
    // Reuse, not reimplementation: provider selection, pagination, persistence,
    // validation, retry classification and progress all stay in runImport.
    const { admin } = fakeAdmin({
      queued: [{ id: "j1" }], claimWins: true,
      symbolRow: { native_symbol: "BTCUSDT", market: "crypto" },
    });
    const { calls, runner } = runnerOk();

    const res = await drainQueuedJobs(admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW, runner,
    });

    expect(res).toMatchObject({ claimed: 1, executed: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].existingJobId).toBe("j1");
    expect(calls[0].nativeSymbol).toBe("BTCUSDT");
    expect(calls[0].sourceCode).toBe("bybit");
    expect(calls[0].triggeredBy).toBe("queue");
    expect(calls[0].aggregateHigherTfs).toBe(true);
    expect(calls[0].from).toBe(RANGE.from);
    expect(calls[0].to).toBe(RANGE.to);
  });

  it("a lost claim race skips execution and is not an error", async () => {
    const { admin } = fakeAdmin({ queued: [{ id: "j1" }], claimWins: false });
    const { calls, runner } = runnerOk();
    const res = await drainQueuedJobs(admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW, runner,
    });
    expect(res).toMatchObject({ considered: 1, claimed: 0, executed: 0, failed: 0, skipped: 1 });
    expect(calls).toHaveLength(0);
  });

  it("records a provider failure as failed without taking the tick down", async () => {
    const { admin } = fakeAdmin({
      queued: [{ id: "j1" }], claimWins: true,
      symbolRow: { native_symbol: "BTCUSDT", market: "crypto" },
    });
    const res = await drainQueuedJobs(admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW,
      runner: async () => { throw new Error("Bybit HTTP 403"); },
    });
    expect(res).toMatchObject({ claimed: 1, executed: 0, failed: 1 });
    expect(String(res.results[0].error)).toMatch(/403/);
  });

  it("is bounded: never asks for more than `limit`", async () => {
    const { admin } = fakeAdmin({
      queued: [{ id: "j1" }], claimWins: true,
      symbolRow: { native_symbol: "BTCUSDT", market: "crypto" },
    });
    const { calls, runner } = runnerOk();
    const res = await drainQueuedJobs(admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW, runner,
    });
    expect(res.considered).toBeLessThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(1);
  });

  it("will not START a job once the deadline has passed - starvation guard", async () => {
    // The scheduled slice must still get a chance. A drain that begins work at
    // 90s would eat the whole request and starve it.
    const { admin, ops } = fakeAdmin({ queued: [{ id: "j1" }], claimWins: true });
    const { calls, runner } = runnerOk();
    const res = await drainQueuedJobs(admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000,
      now: () => NOW + 45_000, runner,
    });
    expect(res).toMatchObject({ considered: 1, claimed: 0, executed: 0, skipped: 1 });
    expect(calls).toHaveLength(0);
    expect(ops.some((o) => o.kind === "update")).toBe(false);
  });

  it("two invocations cannot both execute the same job", async () => {
    // The first claim wins; the second sees `status <> 'queued'` and gets null.
    const first = fakeAdmin({ queued: [{ id: "j1" }], claimWins: true, symbolRow: { native_symbol: "BTCUSDT" } });
    const second = fakeAdmin({ queued: [{ id: "j1" }], claimWins: false });
    const a = runnerOk();
    const b = runnerOk();

    const r1 = await drainQueuedJobs(first.admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW, runner: a.runner,
    });
    const r2 = await drainQueuedJobs(second.admin, {
      limit: 1, startedAt: NOW, deadlineMs: 30_000, now: () => NOW, runner: b.runner,
    });

    expect(r1.executed + r2.executed).toBe(1);
    expect(a.calls.length + b.calls.length).toBe(1);
  });
});
