import { describe, it, expect } from "vitest";
import { SESSION_CASES } from "../cases";
import {
  sessionAt, isSessionOpen, activeSessions, nextSessionOpen, nextEquitiesOpen,
} from "../index";

describe("sessionAt — shared fixture", () => {
  for (const c of SESSION_CASES) {
    it(`${c.at} → ${c.expect} (${c.why})`, () => {
      expect(sessionAt(c.at)).toBe(c.expect);
    });
  }
});

describe("sessionAt — the defects this module replaces", () => {
  it("does not shift with the seasons", () => {
    // The whole bug in one assertion: 12:30 UTC is inside the overlap in
    // summer and London-only in winter, because New York opens an hour later
    // in UTC terms once EST returns. A fixed-UTC rule cannot express both.
    expect(sessionAt("2026-07-15T12:30:00Z")).toBe("london_ny_overlap");
    expect(sessionAt("2026-01-15T12:30:00Z")).toBe("london");
  });

  it("leaves no unlabelled hour", () => {
    // The legacy rule returned null for 21:00-22:00 UTC year-round — an
    // hour-shaped hole in every session report.
    for (let h = 0; h < 24; h++) {
      const winter = sessionAt(`2026-01-15T${String(h).padStart(2, "0")}:30:00Z`);
      const summer = sessionAt(`2026-07-15T${String(h).padStart(2, "0")}:30:00Z`);
      expect(winter, `${h}:30 UTC in January`).not.toBe("off_hours");
      expect(summer, `${h}:30 UTC in July`).not.toBe("off_hours");
    }
  });

  it("keeps Sydney reachable", () => {
    // Tokyo outranks Sydney and covers 00:00-09:00 UTC year-round, so Sydney
    // only surfaces between New York's close and Tokyo's open. Narrow, but a
    // branch that can never be reached is a rule that lies.
    const reachable = Array.from({ length: 24 }, (_, h) =>
      sessionAt(`2026-07-15T${String(h).padStart(2, "0")}:30:00Z`),
    ).filter((s) => s === "sydney");
    expect(reachable.length).toBeGreaterThan(0);
  });

  it("treats an absent timestamp as off-hours, not as a real session", () => {
    expect(sessionAt(null)).toBe("off_hours");
    expect(sessionAt(undefined)).toBe("off_hours");
    expect(sessionAt("not a date")).toBe("off_hours");
  });
});

describe("isSessionOpen / activeSessions", () => {
  it("reports the overlap as two open centres", () => {
    expect(activeSessions("2026-07-15T12:30:00Z").sort()).toEqual(["london", "new_york"]);
  });

  it("closes London at its local 17:00 in both offsets", () => {
    // 16:00 UTC is 17:00 BST — closed. 16:00 UTC is 16:00 GMT — still open.
    expect(isSessionOpen("london", "2026-07-15T16:00:00Z")).toBe(false);
    expect(isSessionOpen("london", "2026-01-15T16:00:00Z")).toBe(true);
  });
});

describe("nextSessionOpen", () => {
  it("returns the London open in the right UTC hour for each offset", () => {
    const summer = nextSessionOpen("london", "2026-07-15T00:00:00Z")!;
    expect(summer.toISOString()).toBe("2026-07-15T07:00:00.000Z"); // 08:00 BST
    const winter = nextSessionOpen("london", "2026-01-15T00:00:00Z")!;
    expect(winter.toISOString()).toBe("2026-01-15T08:00:00.000Z"); // 08:00 GMT
  });

  it("crosses a DST boundary without drifting an hour", () => {
    // The EU falls back on 2026-10-25. Asking on the 24th for the next open
    // must land on the 24th at 07:00 UTC; asking on the 26th must give 08:00.
    const before = nextSessionOpen("london", "2026-10-24T00:00:00Z")!;
    expect(before.toISOString()).toBe("2026-10-24T07:00:00.000Z");
    const after = nextSessionOpen("london", "2026-10-26T00:00:00Z")!;
    expect(after.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("rolls to tomorrow once today's open has passed", () => {
    const next = nextSessionOpen("london", "2026-07-15T09:00:00Z")!;
    expect(next.toISOString()).toBe("2026-07-16T07:00:00.000Z");
  });

  it("never shifts Tokyo, which has no DST", () => {
    expect(nextSessionOpen("tokyo", "2026-01-15T00:00:00Z")!.toISOString())
      .toBe("2026-01-15T00:00:00.000Z");
    expect(nextSessionOpen("tokyo", "2026-07-15T00:00:00Z")!.toISOString())
      .toBe("2026-07-15T00:00:00.000Z");
  });
});

describe("nextEquitiesOpen", () => {
  it("is 90 minutes after the FX open, and is a different thing", () => {
    // ScenarioPicker called 13:30 UTC "the New York open"; navigation.ts called
    // 12:00 UTC the same thing. Both were right about different events.
    const fx = nextSessionOpen("new_york", "2026-07-15T00:00:00Z")!;
    const equities = nextEquitiesOpen("2026-07-15T00:00:00Z")!;
    expect(fx.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(equities.toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });

  it("moves with EST, like everything else in New York", () => {
    expect(nextEquitiesOpen("2026-01-15T00:00:00Z")!.toISOString())
      .toBe("2026-01-15T14:30:00.000Z");
  });
});
