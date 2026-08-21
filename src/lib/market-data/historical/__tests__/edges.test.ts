import { describe, it, expect } from "vitest";
import { edgePatch } from "../edges";

/**
 * HD-3 · the coverage columns are monotonic, in opposite directions.
 *
 * The regression these pin down is not "the wrong value was written" — it is
 * "a value was written at all, by a caller walking the other way". The
 * forward slice sorts on `latest_imported ASC NULLS FIRST`, so one old
 * timestamp written by a backfill step moves that symbol to the head of the
 * queue and keeps it there: the forward phase then skips it (its DATA is
 * current) without calling `runImport`, so nothing corrects the column.
 *
 * The invariants:
 *
 *   1. `earliest_available` only ever moves EARLIER.
 *   2. `latest_imported` only ever moves LATER.
 *   3. A backward import moves ONLY the back edge. This is the HD-3 case.
 *   4. An import inside the recorded bounds moves neither, and says so with an
 *      empty patch so the caller can skip the write.
 *   5. Nulls are "never imported", not "zero", and are always filled.
 */

const T = Date.UTC(2026, 7, 21, 0, 0, 0);
const DAY = 86_400_000;

/** A symbol already covering [T - days, T]. */
function stored(days: number) {
  return { earliestAvailable: T - days * DAY, latestImported: T };
}

describe("edgePatch", () => {
  it("fills both columns on a first import", () => {
    const patch = edgePatch(
      { earliestAvailable: null, latestImported: null },
      { firstTs: T - 2 * DAY, lastTs: T },
    );
    expect(patch).toEqual({
      earliest_available: new Date(T - 2 * DAY).toISOString(),
      latest_imported: new Date(T).toISOString(),
    });
  });

  it("a backward step moves the back edge and LEAVES THE FRONT EDGE ALONE", () => {
    // HD-3 itself. A backfill window is old by construction; before the guard
    // this wrote latest_imported = T - 2d and starved the forward walk.
    const patch = edgePatch(stored(2), { firstTs: T - 4 * DAY, lastTs: T - 2 * DAY - 60_000 });

    expect(patch.earliest_available).toBe(new Date(T - 4 * DAY).toISOString());
    expect(patch.latest_imported).toBeUndefined();
    expect("latest_imported" in patch).toBe(false);
  });

  it("a forward step moves the front edge and leaves the back edge alone", () => {
    const patch = edgePatch(stored(2), { firstTs: T + 60_000, lastTs: T + DAY });

    expect(patch.latest_imported).toBe(new Date(T + DAY).toISOString());
    expect(patch.earliest_available).toBeUndefined();
  });

  it("an import inside the recorded bounds writes nothing", () => {
    const patch = edgePatch(stored(10), { firstTs: T - 5 * DAY, lastTs: T - 3 * DAY });
    expect(patch).toEqual({});
    expect(Object.keys(patch)).toHaveLength(0);
  });

  it("an import landing exactly on both edges writes nothing", () => {
    // Strict comparisons: touching an edge is not extending it.
    const patch = edgePatch(stored(2), { firstTs: T - 2 * DAY, lastTs: T });
    expect(patch).toEqual({});
  });

  it("fills only the missing column when one edge is unset", () => {
    const backOnly = edgePatch(
      { earliestAvailable: T - 2 * DAY, latestImported: null },
      { firstTs: T - DAY, lastTs: T },
    );
    expect(backOnly).toEqual({ latest_imported: new Date(T).toISOString() });

    const frontOnly = edgePatch(
      { earliestAvailable: null, latestImported: T },
      { firstTs: T - DAY, lastTs: T - 60_000 },
    );
    expect(frontOnly).toEqual({ earliest_available: new Date(T - DAY).toISOString() });
  });

  it("widens both edges when an import straddles the stored range", () => {
    const patch = edgePatch(stored(2), { firstTs: T - 5 * DAY, lastTs: T + DAY });
    expect(patch).toEqual({
      earliest_available: new Date(T - 5 * DAY).toISOString(),
      latest_imported: new Date(T + DAY).toISOString(),
    });
  });

  it("survives repeated backward steps without ever moving the front edge", () => {
    // The convergence case: 59 backfill steps is HD-1's full walk to 120 days.
    // Not one of them may touch latest_imported.
    let edges = stored(2);
    for (let step = 0; step < 59; step++) {
      const firstTs = edges.earliestAvailable - 2 * DAY;
      const patch = edgePatch(edges, { firstTs, lastTs: edges.earliestAvailable - 60_000 });

      expect(patch.latest_imported).toBeUndefined();
      edges = {
        earliestAvailable: new Date(patch.earliest_available!).getTime(),
        latestImported: edges.latestImported,
      };
    }
    expect(edges.latestImported).toBe(T);
    expect(edges.earliestAvailable).toBe(T - 120 * DAY);
  });
});
