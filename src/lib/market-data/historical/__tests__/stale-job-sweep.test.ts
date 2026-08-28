import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyStaleJob, sweepStaleImportJobs, STALE_JOB_TTL_MS } from "../pipeline.server";

/**
 * Recovery of import jobs whose request died mid-flight (HD-6).
 *
 * `runImport` writes its terminal status from inside its own handler, so a
 * request killed by the platform leaves `status: running` for ever. Today that
 * is admin noise; once a queue drains by status it becomes a permanent stall,
 * which is why this ships alone and ahead of it.
 *
 * The two things most worth pinning are the ones that fail in opposite
 * directions:
 *
 *   - Sweeping a LIVE job would kill real work. Guarded by anchoring on
 *     `updated_at`, which the `trg_hij_updated_at` trigger bumps on every
 *     progress write, so a healthy import of any length keeps refreshing it.
 *   - Sweeping a TERMINAL job would resurrect or rewrite history — including
 *     the 19 rows already carrying a human's `cancelled` intent.
 */

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const MIN = 60_000;
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const job = (over: Record<string, unknown> = {}) => ({
  id: "job-1",
  symbol: "BTC/USDT",
  timeframe: "1m",
  source_code: "bybit",
  status: "running",
  phase: "saving",
  updated_at: at(1 * MIN),
  started_at: at(2 * MIN),
  created_at: at(2 * MIN),
  ...over,
});

/* ── a chainable fake of the admin client, recording every write ─────────── */

type Recorded = { table: string; patch?: unknown; row?: unknown };

function fakeAdmin(rows: unknown[], opts: { updateHits?: number } = {}) {
  const writes: Recorded[] = [];
  let remainingHits = opts.updateHits ?? Number.POSITIVE_INFINITY;
  const admin = {
    from(table: string) {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: unknown) => Promise.resolve({ data: rows, error: null }),
        }),
        update: (patch: unknown) => ({
          eq: (_c1: string, _v1: unknown) => ({
            eq: (_c2: string, _v2: unknown) => ({
              select: (_c: string) => {
                // `updateHits: 0` simulates another sweep having already won
                // the race: the conditional update matches nothing.
                const won = remainingHits > 0;
                if (won) { remainingHits -= 1; writes.push({ table, patch }); }
                return Promise.resolve({ data: won ? [{ id: "job-1" }] : [], error: null });
              },
            }),
          }),
        }),
        insert: (row: unknown) => {
          writes.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin: admin as unknown as Parameters<typeof sweepStaleImportJobs>[0], writes };
}

afterEach(() => vi.restoreAllMocks());

/* ── the predicate ───────────────────────────────────────────────────────── */

describe("classifyStaleJob", () => {
  it("leaves a fresh running job alone (phase: preparing)", () => {
    const v = classifyStaleJob(job({ phase: "preparing", updated_at: at(30_000) }), NOW);
    expect(v.stale).toBe(false);
    expect(v.reason).toBe("progressed within TTL");
  });

  it("leaves a fresh running job alone (phase: saving)", () => {
    expect(classifyStaleJob(job({ updated_at: at(5 * MIN) }), NOW).stale).toBe(false);
  });

  it("sweeps a stale job in phase preparing", () => {
    const v = classifyStaleJob(job({ phase: "preparing", updated_at: at(40 * MIN) }), NOW);
    expect(v.stale).toBe(true);
    expect(v.reason).toMatch(/no progress for 40 min/);
  });

  it("sweeps a stale job in phase saving — the live-caught case", () => {
    // 2,668s frozen at progress 66 while the clock advanced (HD-7).
    expect(classifyStaleJob(job({ updated_at: at(44 * MIN) }), NOW).stale).toBe(true);
  });

  it("never touches a terminal job, however old", () => {
    for (const status of ["success", "failed", "cancelled"]) {
      const v = classifyStaleJob(job({ status, updated_at: at(60 * 24 * MIN) }), NOW);
      expect(v.stale).toBe(false);
      expect(v.reason).toBe(`status is ${status}`);
    }
  });

  it("never touches a queued job — nothing drains them yet", () => {
    expect(classifyStaleJob(job({ status: "queued", updated_at: at(999 * MIN) }), NOW).stale).toBe(false);
  });

  it("keeps a LONG but live import — the false positive that would matter most", () => {
    // Started four hours ago, wrote progress 30s ago. Anchoring on started_at
    // or created_at instead of updated_at would kill this.
    const v = classifyStaleJob(
      job({ started_at: at(240 * MIN), created_at: at(240 * MIN), updated_at: at(30_000) }),
      NOW,
    );
    expect(v.stale).toBe(false);
  });

  it("refuses to judge a row with no usable timestamp", () => {
    const v = classifyStaleJob(
      { status: "running", updated_at: null, started_at: null, created_at: null }, NOW,
    );
    expect(v.stale).toBe(false);
    expect(v.reason).toBe("no usable progress timestamp");
  });

  it("is exclusive at the boundary: TTL-1ms is alive, exactly TTL is stale", () => {
    expect(classifyStaleJob(job({ updated_at: at(STALE_JOB_TTL_MS - 1) }), NOW).stale).toBe(false);
    expect(classifyStaleJob(job({ updated_at: at(STALE_JOB_TTL_MS) }), NOW).stale).toBe(true);
  });

  it("does not re-recover a row it already recovered", () => {
    // Feed the POST-sweep shape back in. The status change is what excludes it,
    // which is what makes repeated runs idempotent.
    const swept = job({ status: "failed", phase: "failed", updated_at: at(40 * MIN) });
    expect(classifyStaleJob(swept, NOW).stale).toBe(false);
  });
});

/* ── the sweep ───────────────────────────────────────────────────────────── */

describe("sweepStaleImportJobs", () => {
  it("is a silent no-op when NOTHING is eligible — today's real dataset", () => {
    // The dry run against production returned zero eligible rows: 19 cancelled
    // (excluded by status) and no running row past the TTL. This pins that the
    // first real sweep changes nothing and says nothing.
    return (async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const { admin, writes } = fakeAdmin([
        job({ id: "c1", status: "cancelled", updated_at: at(9 * 24 * 60 * MIN) }),
        job({ id: "c2", status: "cancelled", updated_at: at(9 * 24 * 60 * MIN) }),
        job({ id: "r1", status: "running", updated_at: at(2 * MIN) }),
      ]);

      const res = await sweepStaleImportJobs(admin, NOW);

      expect(res.swept).toBe(0);
      expect(res.recovered).toEqual([]);
      expect(writes).toEqual([]);           // no row mutated, no log row inserted
      expect(warn).not.toHaveBeenCalled();  // no per-run noise
      expect(err).not.toHaveBeenCalled();
    })();
  });

  it("recovers a stale job and records it once, with the required detail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin, writes } = fakeAdmin([job({ updated_at: at(44 * MIN) })]);

    const res = await sweepStaleImportJobs(admin, NOW);

    expect(res.swept).toBe(1);
    const patch = writes.find((w) => w.table === "historical_import_jobs")?.patch as Record<string, unknown>;
    expect(patch.status).toBe("failed");
    expect(patch.phase).toBe("failed");
    expect(String(patch.error_message)).toMatch(/Stale sweep/);

    const logRow = writes.find((w) => w.table === "historical_sync_logs")?.row as Record<string, unknown>;
    const meta = logRow.metadata as Record<string, unknown>;
    expect(logRow.job_id).toBe("job-1");
    expect(logRow.symbol).toBe("BTC/USDT");
    expect(logRow.level).toBe("warn");
    expect(meta.previous_status).toBe("running");
    expect(meta.previous_phase).toBe("saving");
    expect(meta.stale_age_minutes).toBe(44);
    expect(meta.recovery_action).toBe("failed");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a losing concurrent sweep mutates nothing and logs nothing", async () => {
    // `updateHits: 0` = the conditional update matched no rows because another
    // sweep already flipped the status. Only the winner may report a recovery.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin, writes } = fakeAdmin([job({ updated_at: at(44 * MIN) })], { updateHits: 0 });

    const res = await sweepStaleImportJobs(admin, NOW);

    expect(res.swept).toBe(0);
    expect(writes.filter((w) => w.table === "historical_sync_logs")).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("checks every running row but sweeps only the stale ones", async () => {
    const { admin } = fakeAdmin([
      job({ id: "a", updated_at: at(1 * MIN) }),
      job({ id: "b", updated_at: at(44 * MIN) }),
      job({ id: "c", status: "cancelled", updated_at: at(999 * MIN) }),
    ]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await sweepStaleImportJobs(admin, NOW);
    expect(res.checked).toBe(3);
    expect(res.swept).toBe(1);
  });
});
