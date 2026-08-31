import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  requeueImportJob,
  RETRYABLE_STATUSES,
  RESUMABLE_STATUSES,
  runImport,
  incrementalWindow,
  enqueueIncrementalUpdate,
} from "../pipeline.server";
import {
  isInfrastructureFailure,
  importFailureRemedy,
} from "../service.server";
import { HistoricalProviderError } from "../providers.server";

/**
 * Commit 3 — closing the last admin paths that fetched from a provider inline.
 *
 * Commit 2 moved `runHistoricalImport` and `bulkHistoricalImport` onto the
 * queue, because a Worker runs in the colo nearest whoever triggered it and the
 * colo picks the egress. Measured 2026-08-29, same probe, same host, same path:
 *
 *   pg_net (Supabase)  -> KR / ICN -> Bybit ICN57-P6 -> HTTP 200
 *   browser (India)    -> IN / BOM -> Bybit MCI50-P5 -> HTTP 403
 *
 * Retry and Resume were left behind on the inline path — the two buttons an
 * operator presses immediately AFTER a 403, each one reproducing it. These
 * tests pin the architecture rather than the plumbing: the load-bearing claim
 * is "these four entry points cannot reach a provider", and it is asserted
 * three ways — by source shape, by behaviour, and by a forbidden `fetch`.
 */

/* ── a chainable fake of a supabase-js client ─────────────────────────────── */

type QueryResult = { data: unknown; error: unknown };

type Op = {
  table: string;
  kind: "select" | "insert" | "update";
  payload?: unknown;
  /** Filters applied, so a concurrency guard can be asserted rather than assumed. */
  eqs: Array<[string, unknown]>;
  ins: Array<[string, readonly unknown[]]>;
};

function chainable(result: QueryResult, op?: Op) {
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: unknown) => {
    op?.eqs.push([col, val]);
    return chain;
  };
  chain.in = (col: string, vals: readonly unknown[]) => {
    op?.ins.push([col, vals]);
    return chain;
  };
  chain.not = () => chain;
  chain.gte = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.select = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  chain.single = () => Promise.resolve(result);
  // Makes the chain itself awaitable, the way PostgrestFilterBuilder is.
  chain.then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

type FakeConfig = {
  /** Result for UPDATE on historical_import_jobs. */
  updateResult?: QueryResult;
  /** Result for SELECT anywhere. */
  selectResult?: QueryResult;
  /** Per-table SELECT results, for paths that read more than one table. */
  selects?: Record<string, QueryResult>;
  /** Result for INSERT (`enqueueImportJob` reads `data.id` back). */
  insertResult?: QueryResult;
};

function fakeDb(cfg: FakeConfig = {}) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const push = (kind: Op["kind"], payload?: unknown): Op => {
        const op: Op = { table, kind, payload, eqs: [], ins: [] };
        ops.push(op);
        return op;
      };
      return {
        select: (_cols?: string) =>
          chainable(
            cfg.selects?.[table] ?? cfg.selectResult ?? { data: null, error: null },
            push("select"),
          ),
        insert: (payload: unknown) =>
          chainable(
            cfg.insertResult ?? { data: { id: "job-new" }, error: null },
            push("insert", payload),
          ),
        update: (payload: unknown) =>
          chainable(
            cfg.updateResult ?? { data: [{ id: "job-1" }], error: null },
            push("update", payload),
          ),
      };
    },
  };
  return { db: client as unknown as Parameters<typeof requeueImportJob>[0], ops };
}

/** Fails the test if anything reaches the network. */
function forbidFetch() {
  const spy = vi.fn(() => {
    throw new Error("provider fetch attempted from a path that must not fetch");
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ── A + D + the section-7 invariant, asserted on the source itself ───────── */

/**
 * Read the admin entry points as TEXT.
 *
 * A behavioural test cannot express "this handler never calls runImport" —
 * `createServerFn` handlers are not directly invocable here, and a test that
 * only exercises the happy path would pass just as well with an inline fetch
 * added back beside the re-queue. The invariant is structural, so it is
 * asserted structurally: the four handlers must not so much as mention
 * `runImport`.
 */
const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../historical.functions.ts", import.meta.url)),
  "utf8",
);

/**
 * Comments are stripped before matching, so the doc comments explaining WHY
 * `runImport` was removed cannot themselves trip the assertion — and cannot be
 * used to satisfy one either.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function handlerBody(name: string): string {
  const start = FUNCTIONS_SRC.indexOf(`export const ${name} = createServerFn`);
  expect(start, `${name} not found in historical.functions.ts`).toBeGreaterThan(-1);
  const rest = FUNCTIONS_SRC.slice(start + 1);
  const next = rest.indexOf("\nexport const ");
  return stripComments(next === -1 ? rest : rest.slice(0, next));
}

describe("admin entry points never invoke a provider inline", () => {
  it("A: retryImportJob does not call runImport", () => {
    const body = handlerBody("retryImportJob");
    expect(body).not.toMatch(/\brunImport\b/);
    expect(body).toMatch(/\brequeueImportJob\b/);
  });

  it("D: resumeImportJob does not call runImport", () => {
    const body = handlerBody("resumeImportJob");
    expect(body).not.toMatch(/\brunImport\b/);
    expect(body).toMatch(/\brequeueImportJob\b/);
  });

  it("1: runIncrementalSync does not call runIncrementalUpdate or runImport", () => {
    const body = handlerBody("runIncrementalSync");
    // `runIncrementalUpdate` is the SCHEDULED half and still fetches inline, on
    // purpose. Reaching it from a server function is the defect.
    expect(body).not.toMatch(/\brunIncrementalUpdate\b/);
    expect(body).not.toMatch(/\brunImport\b/);
    expect(body).toMatch(/\benqueueIncrementalUpdate\b/);
  });

  it("all FIVE admin entry points are enqueue/re-queue only", () => {
    for (const name of ["runHistoricalImport", "bulkHistoricalImport"]) {
      const body = handlerBody(name);
      expect(body, name).not.toMatch(/\brunImport\b/);
      expect(body, name).toMatch(/\benqueueImportJob\b/);
    }
    for (const name of ["retryImportJob", "resumeImportJob"]) {
      expect(handlerBody(name), name).not.toMatch(/\brunImport\b/);
    }
    // The whole file, so no future handler can reintroduce an inline import
    // anywhere in it.
    const all = stripComments(FUNCTIONS_SRC);
    expect(all).not.toMatch(/\brunImport\b/);
    expect(all).not.toMatch(/\brunIncrementalUpdate\b/);
    expect(all).not.toMatch(/\brunBackwardUpdate\b/);
  });

  it("no admin entry point imports a historical provider", () => {
    expect(FUNCTIONS_SRC).not.toMatch(/getHistoricalProvider|providers\.server/);
  });
});

/* ── B, C, E, F — re-queue the SAME row, insert nothing ───────────────────── */

describe("requeueImportJob", () => {
  it("B: retry re-queues the same job id", async () => {
    const noFetch = forbidFetch();
    const { db, ops } = fakeDb();

    const r = await requeueImportJob(db, "job-1", "retry");

    expect(r).toEqual({
      jobId: "job-1",
      status: "queued",
      phase: "queued",
      requeued: true,
      mode: "retry",
    });
    const update = ops.find((o) => o.kind === "update");
    expect(update?.table).toBe("historical_import_jobs");
    expect(update?.eqs).toContainEqual(["id", "job-1"]);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("C: retry inserts no replacement job", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "retry");
    expect(ops.filter((o) => o.kind === "insert")).toHaveLength(0);
  });

  it("E: resume re-queues the same job id", async () => {
    const noFetch = forbidFetch();
    const { db, ops } = fakeDb();

    const r = await requeueImportJob(db, "job-1", "resume");

    expect(r.jobId).toBe("job-1");
    expect(r.mode).toBe("resume");
    expect(r.status).toBe("queued");
    expect(ops.find((o) => o.kind === "update")?.eqs).toContainEqual(["id", "job-1"]);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("F: resume inserts no replacement job", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "resume");
    expect(ops.filter((o) => o.kind === "insert")).toHaveLength(0);
  });

  it("writes a row that is queued in BOTH status and phase", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "retry");
    const payload = ops.find((o) => o.kind === "update")?.payload as Record<string, unknown>;
    // `getImportQueue` filters on `phase`, the drain selects on `status`. A row
    // queued in only one of them is invisible to one of the two.
    expect(payload.status).toBe("queued");
    expect(payload.phase).toBe("queued");
  });

  it("retry resets the attempt: progress, retry_count, error_message, started_at", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "retry");
    const payload = ops.find((o) => o.kind === "update")?.payload as Record<string, unknown>;
    expect(payload.progress).toBe(0);
    expect(payload.retry_count).toBe(0);
    expect(payload.error_message).toBeNull();
    expect(payload.started_at).toBeNull();
    expect(payload.finished_at).toBeNull();
    expect(payload.cancelled_at).toBeNull();
    expect(payload.paused_at).toBeNull();
  });

  it("resume continues the attempt: progress and retry_count are NOT reset", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "resume");
    const payload = ops.find((o) => o.kind === "update")?.payload as Record<string, unknown>;
    // The distinction between Resume and Retry. Resetting these would make
    // Resume a second Retry wearing a different button.
    expect(payload).not.toHaveProperty("progress");
    expect(payload).not.toHaveProperty("retry_count");
    expect(payload).not.toHaveProperty("started_at");
    expect(payload.paused_at).toBeNull();
    expect(payload.finished_at).toBeNull();
  });

  it("never rewrites the import definition", async () => {
    const { db, ops } = fakeDb();
    for (const mode of ["retry", "resume"] as const) {
      await requeueImportJob(db, "job-1", mode);
    }
    // range, symbol, timeframe, source, priority and metadata are carried by
    // NOT being in the patch. If one ever appears here, a re-queue has become
    // a rewrite of the request.
    for (const op of ops.filter((o) => o.kind === "update")) {
      const payload = op.payload as Record<string, unknown>;
      for (const forbidden of [
        "symbol", "timeframe", "source_code", "range_from", "range_to",
        "priority", "metadata", "symbol_id", "max_retries", "triggered_by",
      ]) {
        expect(payload, `${forbidden} must not be rewritten`).not.toHaveProperty(forbidden);
      }
    }
  });

  /* ── G, H — the conditional transition ─────────────────────────────────── */

  it("G: retry filters the update on retryable statuses - the guard itself", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "retry");
    const update = ops.find((o) => o.kind === "update");
    expect(update?.ins).toContainEqual(["status", RETRYABLE_STATUSES]);
    // A running or queued job is already live; re-queuing it would put two
    // executions behind one job row.
    expect(RETRYABLE_STATUSES).not.toContain("running");
    expect(RETRYABLE_STATUSES).not.toContain("queued");
    expect(RETRYABLE_STATUSES).not.toContain("success");
  });

  it("G: retry on a non-retryable state is rejected, not reported as success", async () => {
    // Zero matched rows is what Postgres returns when the row is not `failed`
    // or `cancelled` - the state check and the lost race are the same signal.
    const { db } = fakeDb({ updateResult: { data: [], error: null } });
    await expect(requeueImportJob(db, "job-1", "retry")).rejects.toThrow(/cannot retry/i);
  });

  it("H: resume filters the update on paused only", async () => {
    const { db, ops } = fakeDb();
    await requeueImportJob(db, "job-1", "resume");
    expect(ops.find((o) => o.kind === "update")?.ins).toContainEqual([
      "status",
      RESUMABLE_STATUSES,
    ]);
    expect(RESUMABLE_STATUSES).toEqual(["paused"]);
  });

  it("H: resume on a non-paused state is rejected", async () => {
    const { db } = fakeDb({ updateResult: { data: [], error: null } });
    await expect(requeueImportJob(db, "job-1", "resume")).rejects.toThrow(/cannot resume/i);
  });

  /* ── I — the lost race ─────────────────────────────────────────────────── */

  it("I: a lost race returns zero rows and is NOT success", async () => {
    const { db } = fakeDb({ updateResult: { data: [], error: null } });
    // Two clicks, or a click that raced the drain's claim. The second must not
    // come back green: the row it meant to re-queue is not the row it found.
    await expect(requeueImportJob(db, "job-1", "retry")).rejects.toThrow(
      /already been re-queued, claimed by the sync worker, or finished/i,
    );
  });

  it("I: only one of two concurrent re-queues can win", async () => {
    let matched = false;
    const { db } = fakeDb();
    const raced = fakeDb({
      updateResult: { data: [], error: null },
    });
    const first = await requeueImportJob(db, "job-1", "retry");
    matched = first.requeued;
    await expect(requeueImportJob(raced.db, "job-1", "retry")).rejects.toThrow();
    expect(matched).toBe(true);
  });

  it("propagates a supabase error instead of reporting a re-queue", async () => {
    const { db } = fakeDb({
      updateResult: { data: null, error: { message: "Invalid API key", code: "PGRST301" } },
    });
    await expect(requeueImportJob(db, "job-1", "retry")).rejects.toBeTruthy();
  });
});

/* ── the fifth admin entry point: incremental sync ────────────────────────── */

describe("enqueueIncrementalUpdate", () => {
  const NOW = Date.UTC(2026, 7, 31, 12, 0, 0);
  const MINUTE = 60_000;
  const SYMBOL = {
    id: "sym-1",
    symbol: "BTC/USDT",
    native_symbol: "BTCUSDT",
    source_code: "bybit",
    base_timeframe: "1m",
  };

  /** A db whose candle table has a last bar at `lastTs`, and no duplicate jobs. */
  const dbWithLastBar = (lastTs: number | null) =>
    fakeDb({
      selects: {
        historical_candles: {
          data: lastTs === null ? null : { ts: new Date(lastTs).toISOString() },
          error: null,
        },
        // `enqueueImportJob`'s dedupe probe: nothing already queued.
        historical_import_jobs: { data: [], error: null },
      },
    });

  it("3: queues without making a single provider call", async () => {
    const noFetch = forbidFetch();
    const { db, ops } = dbWithLastBar(NOW - 30 * MINUTE);

    await enqueueIncrementalUpdate(db, SYMBOL, NOW);

    // The whole point. If a future refactor puts the fetch back, this fails —
    // and the production symptom is a Bybit 403 that only reproduces for
    // whoever is sitting in the wrong country.
    expect(noFetch).not.toHaveBeenCalled();
    expect(ops.some((o) => o.kind === "insert" && o.table === "historical_import_jobs")).toBe(true);
  });

  it("2: writes a job queued in BOTH status and phase, with the right definition", async () => {
    const { db, ops } = dbWithLastBar(NOW - 30 * MINUTE);

    const res = await enqueueIncrementalUpdate(db, SYMBOL, NOW);

    const insert = ops.find((o) => o.kind === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(insert?.table).toBe("historical_import_jobs");
    expect(payload.status).toBe("queued");
    expect(payload.phase).toBe("queued");
    expect(payload.symbol).toBe("BTC/USDT");
    expect(payload.source_code).toBe("bybit");
    expect(payload.timeframe).toBe("1m");
    // `aggregateHigherTfs: true` in the inline version; same flag, carried to
    // the drain in metadata.
    expect(payload.metadata).toEqual({ aggregate: true });
    // A human pressed a button. Not the cron, whose label these rows used to
    // borrow and pollute the cron-only diagnostics with.
    expect(payload.triggered_by).toBe("admin:incremental");
    expect(res.skipped).toBe(false);
  });

  it("4: range picks up one step after the last stored bar, and ends at now", async () => {
    const lastTs = NOW - 30 * MINUTE;
    const { db, ops } = dbWithLastBar(lastTs);

    await enqueueIncrementalUpdate(db, SYMBOL, NOW);

    const payload = ops.find((o) => o.kind === "insert")?.payload as Record<string, unknown>;
    expect(payload.range_from).toBe(new Date(lastTs + MINUTE).toISOString());
    expect(payload.range_to).toBe(new Date(NOW).toISOString());
  });

  it("4: a symbol with no stored bars seeds exactly 2 days, not 30", async () => {
    const { db, ops } = dbWithLastBar(null);

    await enqueueIncrementalUpdate(db, SYMBOL, NOW);

    const payload = ops.find((o) => o.kind === "insert")?.payload as Record<string, unknown>;
    // 30 days at 1m is 43,200 bars and could never finish inside one request.
    expect(payload.range_from).toBe(new Date(NOW - 2 * 86400_000).toISOString());
  });

  it("4: enqueues NOTHING when the front edge is less than one step old", async () => {
    const { db, ops } = dbWithLastBar(NOW - 30_000); // half a bar

    const res = await enqueueIncrementalUpdate(db, SYMBOL, NOW);

    expect(res).toEqual({ skipped: true });
    expect(ops.filter((o) => o.kind === "insert")).toHaveLength(0);
  });

  it("4: the queued range is the SAME window the scheduled path would import", async () => {
    const lastTs = NOW - 90 * MINUTE;
    const probe = dbWithLastBar(lastTs);
    const window = await incrementalWindow(probe.db, SYMBOL, NOW);

    const { db, ops } = dbWithLastBar(lastTs);
    await enqueueIncrementalUpdate(db, SYMBOL, NOW);
    const payload = ops.find((o) => o.kind === "insert")?.payload as Record<string, unknown>;

    // One derivation, two callers. If they ever diverge, "incremental" means
    // two different things depending on who asked.
    expect(window.skipped).toBe(false);
    if (!window.skipped) {
      expect(payload.range_from).toBe(new Date(window.from).toISOString());
      expect(payload.range_to).toBe(new Date(window.to).toISOString());
      expect(payload.timeframe).toBe(window.timeframe);
    }
  });

  it("4: honours a non-1m base timeframe", async () => {
    const lastTs = NOW - 6 * 3_600_000;
    const { db, ops } = dbWithLastBar(lastTs);

    await enqueueIncrementalUpdate(db, { ...SYMBOL, base_timeframe: "1H" }, NOW);

    const payload = ops.find((o) => o.kind === "insert")?.payload as Record<string, unknown>;
    expect(payload.timeframe).toBe("1H");
    expect(payload.range_from).toBe(new Date(lastTs + 3_600_000).toISOString());
  });

  it("5: dedupes against a job already queued for the same range", async () => {
    const { db, ops } = fakeDb({
      selects: {
        historical_candles: { data: { ts: new Date(NOW - 30 * MINUTE).toISOString() }, error: null },
        // `enqueueImportJob`'s dedupe probe finds live work.
        historical_import_jobs: { data: [{ id: "already-queued" }], error: null },
      },
    });

    const res = await enqueueIncrementalUpdate(db, SYMBOL, NOW);

    expect(res).toMatchObject({ jobId: "already-queued", deduped: true, skipped: false });
    expect(ops.filter((o) => o.kind === "insert")).toHaveLength(0);
  });
});

/* ── J, K — the existingJobId transition guards the provider fetch ────────── */

let mockAdminTarget: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client.server", () => ({
  // A stand-in for the real lazy Proxy, so `loadAdmin`'s `await` (which reads
  // `then` off it) behaves exactly as it does in production.
  supabaseAdmin: new Proxy(
    {},
    {
      get(_target, prop) {
        if (!mockAdminTarget) return undefined;
        const value = mockAdminTarget[String(prop)];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(mockAdminTarget)
          : value;
      },
    },
  ),
}));

describe("runImport existingJobId transition", () => {
  const OPTS = {
    symbol: "BTC/USDT",
    nativeSymbol: "BTCUSDT",
    sourceCode: "bybit",
    market: "crypto",
    timeframe: "1m" as const,
    from: Date.UTC(2026, 6, 1),
    to: Date.UTC(2026, 6, 1, 1),
    triggeredBy: "queue",
    existingJobId: "job-1",
    aggregateHigherTfs: false,
  };

  beforeEach(() => {
    mockAdminTarget = null;
  });

  it("J: a failed transition throws BEFORE any provider call", async () => {
    const noFetch = forbidFetch();
    const { db, ops } = fakeDb({
      // Exactly what an invalid SUPABASE_SERVICE_ROLE_KEY produces: no throw,
      // just an { error } nobody used to read (MD-11).
      updateResult: { data: null, error: { message: "Invalid API key", code: "PGRST301" } },
    });
    mockAdminTarget = db as unknown as Record<string, unknown>;

    await expect(runImport(OPTS)).rejects.toBeTruthy();

    expect(noFetch, "the provider must not be contacted with a client that cannot record the answer")
      .not.toHaveBeenCalled();
    // And nothing downstream ran: no log line, no phase write, no terminal status.
    expect(ops.filter((o) => o.kind === "insert")).toHaveLength(0);
    expect(ops.filter((o) => o.kind === "update")).toHaveLength(1);
  });

  it("K: a successful transition still runs the import through to the provider", async () => {
    const fetchSpy = vi.fn((_input: unknown) =>
      Promise.resolve(new Response("blocked", { status: 403 })),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { db, ops } = fakeDb({ updateResult: { data: null, error: null } });
    mockAdminTarget = db as unknown as Record<string, unknown>;

    // A 403 from the venue, not from us: the import proceeds, reaches Bybit and
    // fails there. That it got that far is the assertion.
    await expect(runImport(OPTS)).rejects.toThrow(/403/);

    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("bybit");
    // The failure was recorded, which is only possible because the client works.
    expect(ops.some((o) => o.kind === "insert" && o.table === "historical_sync_logs")).toBe(true);
  });
});

/* ── L, M — MD-11 error classification ───────────────────────────────────── */

describe("import failure classification", () => {
  const MISSING_KEY = new Error(
    "Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY. Connect Supabase in Lovable Cloud.",
  );

  it("L: a missing service-role key is NOT reported as a provider rejection", () => {
    expect(isInfrastructureFailure(MISSING_KEY)).toBe(true);
    const remedy = importFailureRemedy("bybit", MISSING_KEY, MISSING_KEY.message);
    expect(remedy).not.toMatch(/rejected the request/i);
    expect(remedy).toMatch(/server configuration or database error/i);
    expect(remedy).toMatch(/NOT a rejection by bybit/);
  });

  it("L: a PostgREST error object is infrastructure, not the venue", () => {
    const pgrst = { message: "JWT expired", code: "PGRST301", details: null, hint: null };
    expect(isInfrastructureFailure(pgrst)).toBe(true);
    expect(importFailureRemedy("twelvedata", pgrst, "JWT expired")).not.toMatch(
      /rejected the request/i,
    );
  });

  it("L: an RLS refusal is infrastructure", () => {
    const rls = { message: "new row violates row-level security policy", code: "42501" };
    expect(isInfrastructureFailure(rls)).toBe(true);
  });

  it("M: a typed provider error stays a provider error", () => {
    const e = new HistoricalProviderError("bybit", "HTTP 403 on /v5/market/kline", {
      httpStatus: 403,
      headers: { "x-amz-cf-pop": "MCI50-P5" },
    });
    expect(isInfrastructureFailure(e)).toBe(false);
    const remedy = importFailureRemedy("bybit", e, e.message);
    expect(remedy).toMatch(/The data provider \(bybit\) rejected the request/);
  });

  it("M: an untyped provider fault stays a provider error", () => {
    // The default must be "provider". Misfiling a real venue refusal as
    // infrastructure sends the operator to the wrong place just as surely.
    for (const message of [
      "[bybit] returned 0 candles for BTC/USDT",
      "Bybit retCode 10001: unknown symbol",
      "Bybit: page budget of 34 exhausted for BTCUSDT 1m",
      "rate limit: you have run out of API credits for the current minute",
    ]) {
      const e = new Error(message);
      expect(isInfrastructureFailure(e), message).toBe(false);
      expect(importFailureRemedy("bybit", e, message)).toMatch(/rejected the request/);
    }
  });

  it("M: a plain network fault is not misfiled as infrastructure", () => {
    const e = new TypeError("fetch failed");
    expect(isInfrastructureFailure(e)).toBe(false);
  });
});
