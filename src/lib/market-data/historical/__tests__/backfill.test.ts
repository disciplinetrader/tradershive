import { describe, it, expect } from "vitest";
import {
  backwardWindow,
  BACKFILL_STEP_DAYS,
  BACKFILL_TARGET_DAYS,
  BACKFILL_EMPTY_LIMIT,
} from "../backfill";

/**
 * HD-1 · the backward walk's window arithmetic.
 *
 * Written before the implementation, the same way MS-1's weekend cases and
 * MS-2's vocabulary cases were.
 *
 * The whole feature is one decision made repeatedly: given where the stored
 * data currently starts and ends, which slice do we ask the provider for next,
 * and when do we stop asking? Everything else — pacing, scheduling, job
 * records — is plumbing around that.
 *
 * The invariants worth pinning:
 *
 *   1. Never overlap the data we already have (`to` is strictly before the
 *      earliest stored bar).
 *   2. Never exceed one step per run — that is the SEED_DAYS invariant, and it
 *      is what stops this becoming the 43,200-bar cliff again.
 *   3. Never walk past the target, even by a partial step.
 *   4. Stop cleanly, and distinguishably: target reached, provider exhausted,
 *      and no-forward-seed-yet are three different states and a caller needs to
 *      tell them apart.
 */

const DAY = 86_400_000;
const MIN = 60_000; // 1m base timeframe, as all 33 symbols are

const T = Date.UTC(2026, 7, 20, 0, 0, 0);

/** A symbol with `days` of stored history ending at T. */
function stored(days: number) {
  return { earliestTs: T - days * DAY, latestTs: T };
}

const base = {
  stepMs: MIN,
  targetDays: BACKFILL_TARGET_DAYS,
  stepDays: BACKFILL_STEP_DAYS,
  exhausted: false,
};

describe("backwardWindow — where the next backward slice starts", () => {
  it("asks for exactly one step, ending one bar before the earliest stored bar", () => {
    const w = backwardWindow({ ...base, ...stored(2) });
    if ("skip" in w) throw new Error(`expected a window, got skip=${w.skip}`);
    // Earliest stored is T-2d. The slice must END one bar earlier, so nothing
    // is re-fetched, and span exactly BACKFILL_STEP_DAYS.
    expect(w.to).toBe(T - 2 * DAY - MIN);
    expect(w.to - w.from).toBe(BACKFILL_STEP_DAYS * DAY);
  });

  it("never overlaps stored data even by a single bar", () => {
    const s = stored(10);
    const w = backwardWindow({ ...base, ...s });
    if ("skip" in w) throw new Error("expected a window");
    expect(w.to).toBeLessThan(s.earliestTs);
  });
});

describe("backwardWindow — stopping", () => {
  it("stops once the target depth is reached", () => {
    const w = backwardWindow({ ...base, ...stored(BACKFILL_TARGET_DAYS) });
    expect(w).toEqual({ skip: "target-reached" });
  });

  it("stops when already deeper than the target", () => {
    const w = backwardWindow({ ...base, ...stored(BACKFILL_TARGET_DAYS + 30) });
    expect(w).toEqual({ skip: "target-reached" });
  });

  it("clamps the final step rather than overshooting the target", () => {
    // One day short of target: a full 2-day step would walk past it.
    const w = backwardWindow({ ...base, ...stored(BACKFILL_TARGET_DAYS - 1) });
    if ("skip" in w) throw new Error("expected a clamped window");
    const floor = T - BACKFILL_TARGET_DAYS * DAY;
    expect(w.from).toBe(floor);
    expect(w.to - w.from).toBeLessThan(BACKFILL_STEP_DAYS * DAY);
  });

  it("reports exhaustion as its own state, not as target-reached", () => {
    // A provider that has no more history is a different situation from having
    // got what we asked for, and the caller must not conflate them — one is
    // permanent, the other is success.
    const w = backwardWindow({ ...base, ...stored(5), exhausted: true });
    expect(w).toEqual({ skip: "exhausted" });
  });

  it("refuses to run before a forward seed exists", () => {
    // With no stored bars there is no back edge to walk from, and guessing one
    // would re-create the unbounded first-sync this whole bound exists to stop.
    expect(backwardWindow({ ...base, earliestTs: null, latestTs: null }))
      .toEqual({ skip: "no-data" });
    expect(backwardWindow({ ...base, earliestTs: T - DAY, latestTs: null }))
      .toEqual({ skip: "no-data" });
  });
});

describe("backwardWindow — the walk converges", () => {
  it("reaches the target in the predicted number of steps and then stops", () => {
    // Prediction, stated before running: starting from the 2-day seed, at
    // BACKFILL_STEP_DAYS per run, reaching BACKFILL_TARGET_DAYS takes
    // ceil((120 - 2) / 2) = 59 steps. The 60th must report target-reached.
    const expectedSteps = Math.ceil((BACKFILL_TARGET_DAYS - 2) / BACKFILL_STEP_DAYS);

    let earliestTs = T - 2 * DAY;
    let steps = 0;
    for (let i = 0; i < 500; i++) {
      const w = backwardWindow({ ...base, earliestTs, latestTs: T });
      if ("skip" in w) break;
      steps++;
      earliestTs = w.from;
    }

    expect(steps).toBe(expectedSteps);
    expect(backwardWindow({ ...base, earliestTs, latestTs: T }))
      .toEqual({ skip: "target-reached" });
    // And it landed exactly on the target, not past it.
    expect(earliestTs).toBe(T - BACKFILL_TARGET_DAYS * DAY);
  });
});

/**
 * The attempted-cursor. Added after the walk was found to be unable to step
 * over a closed market.
 *
 * `earliestTs` comes from `min(ts)` of stored candles, so a window that
 * returns nothing leaves it unmoved and the next run computes the IDENTICAL
 * window. Before this, that was masked by marking the symbol exhausted on the
 * first empty step — which made an ordinary weekend permanently fatal to every
 * US-hours symbol. Removing that mark without a cursor would have replaced a
 * silent stop with an infinite retry, which is worse.
 */
describe("backwardWindow — stepping over an empty window", () => {
  const MIN = 60_000;
  const T = Date.UTC(2026, 7, 21, 0, 0, 0);
  const DAY = 86_400_000;
  const base = { stepMs: MIN, latestTs: T };

  it("without a cursor, an empty step recomputes the same window", () => {
    // The defect, pinned so it cannot come back.
    const first = backwardWindow({ ...base, earliestTs: T - 2 * DAY });
    const again = backwardWindow({ ...base, earliestTs: T - 2 * DAY });
    expect(again).toEqual(first);
  });

  it("with a cursor, each empty step advances exactly one step earlier", () => {
    let attemptedFrom: number | null = null;
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      const w = backwardWindow({ ...base, earliestTs: T - 2 * DAY, attemptedFrom });
      if ("skip" in w) throw new Error(`unexpected skip: ${w.skip}`);
      seen.push(w.from);
      attemptedFrom = w.from; // the step returned nothing; only the attempt moved
    }
    // One step of ground, plus the one bar the window drops to stay clear of
    // what is already held. That extra bar is the no-overlap guarantee, so it
    // is asserted rather than rounded away.
    const stride = BACKFILL_STEP_DAYS * DAY + MIN;
    expect(seen[0] - seen[1]).toBe(stride);
    expect(seen[1] - seen[2]).toBe(stride);
    expect(seen[0] - seen[2]).toBe(2 * stride);
  });

  it("a cursor never re-requests a range already held", () => {
    const held = T - 2 * DAY;
    const w = backwardWindow({ ...base, earliestTs: held, attemptedFrom: held });
    if ("skip" in w) throw new Error("unexpected skip");
    expect(w.to).toBeLessThan(held);
  });

  it("data below the cursor wins — a chart load hands the walk back the real edge", () => {
    // MD-8 made this reachable: the chart cache-through can now fill a range
    // below where the walk had probed. The data edge must take precedence, or
    // the walk strands itself above rows it already has.
    const w = backwardWindow({
      ...base,
      earliestTs: T - 30 * DAY,        // a chart filled far below
      attemptedFrom: T - 6 * DAY,      // the walk had only probed to here
    });
    if ("skip" in w) throw new Error("unexpected skip");
    expect(w.to).toBe(T - 30 * DAY - MIN);
  });

  it("the empty limit is a bounded cost, not an unbounded probe", () => {
    // Four steps of two days is the most a closure can cost before the caller
    // calls it exhausted. A normal weekend needs two, a long weekend three.
    expect(BACKFILL_EMPTY_LIMIT * BACKFILL_STEP_DAYS).toBeLessThan(
      BACKFILL_TARGET_DAYS,
    );
    expect(BACKFILL_EMPTY_LIMIT).toBeGreaterThanOrEqual(3);
  });
});
