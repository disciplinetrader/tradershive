import { describe, it, expect } from "vitest";
import { sessionJumpTargets } from "../navigation";

/**
 * The session-jump offer for Replay Studio's transport bar.
 *
 * These assert the two things that make the feature honest: the target times
 * follow the centres' own clocks across a DST boundary, and a target outside
 * the loaded data is refused with a reason rather than becoming a button that
 * silently does nothing.
 */

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);
const find = (ts: ReturnType<typeof sessionJumpTargets>, key: string) =>
  ts.find((t) => t.key === key)!;

describe("sessionJumpTargets", () => {
  it("offers the daily cycle in order", () => {
    const ts = sessionJumpTargets({
      fromMs: at("2026-07-15T00:00:00Z"),
      endMs: at("2026-07-20T00:00:00Z"),
    });
    expect(ts.map((t) => t.key)).toEqual(["sydney", "tokyo", "london", "new_york"]);
  });

  it("resolves opens through each centre's own clock in summer", () => {
    const ts = sessionJumpTargets({
      fromMs: at("2026-07-15T00:00:00Z"),
      endMs: at("2026-07-20T00:00:00Z"),
    });
    // 08:00 BST and 08:00 EDT.
    expect(new Date(find(ts, "london").at!).toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(new Date(find(ts, "new_york").at!).toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("shifts with the offset in winter — the whole point of the rewrite", () => {
    const ts = sessionJumpTargets({
      fromMs: at("2026-01-15T00:00:00Z"),
      endMs: at("2026-01-20T00:00:00Z"),
    });
    // 08:00 GMT and 08:00 EST — an hour later in UTC than the summer case.
    expect(new Date(find(ts, "london").at!).toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(new Date(find(ts, "new_york").at!).toISOString()).toBe("2026-01-15T13:00:00.000Z");
  });

  it("refuses a target beyond the loaded data, with a reason", () => {
    // A window ending before London opens.
    const ts = sessionJumpTargets({
      fromMs: at("2026-07-15T00:00:00Z"),
      endMs: at("2026-07-15T05:00:00Z"),
    });
    const london = find(ts, "london");
    expect(london.reachable).toBe(false);
    expect(london.reason).toBe("beyond this session's data");
    // The time is still reported, so the UI can say WHEN it would have been.
    expect(london.at).not.toBeNull();
  });

  it("marks reachable targets inside the range", () => {
    const ts = sessionJumpTargets({
      fromMs: at("2026-07-15T00:00:00Z"),
      endMs: at("2026-07-15T23:59:00Z"),
    });
    expect(find(ts, "london").reachable).toBe(true);
    expect(find(ts, "new_york").reachable).toBe(true);
  });

  it("never offers a target at or before the cursor — replay is forward-only", () => {
    const from = at("2026-07-15T12:00:00Z"); // exactly the New York open
    const ts = sessionJumpTargets({ fromMs: from, endMs: from + 5 * DAY });
    for (const t of ts) {
      if (t.reachable) expect(t.at!).toBeGreaterThan(from);
    }
    // Standing exactly on the open, the next one offered is tomorrow's.
    expect(new Date(find(ts, "new_york").at!).toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });

  it("offers the NYSE bell only on equity and index sessions", () => {
    const range = { fromMs: at("2026-07-15T00:00:00Z"), endMs: at("2026-07-20T00:00:00Z") };
    expect(sessionJumpTargets({ ...range, market: "crypto" }).map((t) => t.key))
      .not.toContain("ny_equities");
    expect(sessionJumpTargets({ ...range, market: "stocks" }).map((t) => t.key))
      .toContain("ny_equities");
    expect(sessionJumpTargets({ ...range, market: "indices" }).map((t) => t.key))
      .toContain("ny_equities");
  });

  it("separates the NYSE bell from the New York FX open by 90 minutes", () => {
    const ts = sessionJumpTargets({
      fromMs: at("2026-07-15T00:00:00Z"),
      endMs: at("2026-07-20T00:00:00Z"),
      market: "stocks",
    });
    expect(find(ts, "ny_equities").at! - find(ts, "new_york").at!).toBe(90 * 60 * 1000);
  });
});
