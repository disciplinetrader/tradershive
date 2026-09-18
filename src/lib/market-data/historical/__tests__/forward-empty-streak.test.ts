import { describe, it, expect } from "vitest";
import { nextForwardEmptyState, FORWARD_EMPTY_ALERT_THRESHOLD } from "../pipeline.server";

describe("nextForwardEmptyState (N-13 zero-progress detection)", () => {
  it("a step that inserted bars clears the streak and the alert marker", () => {
    const st = nextForwardEmptyState({ forward_empty_streak: 5, forward_frozen_alerted_at: "x", keep: 1 }, 42);
    expect(st.streak).toBe(0);
    expect(st.alert).toBe(false);
    expect(st.patch.forward_empty_streak).toBeUndefined();
    expect(st.patch.forward_frozen_alerted_at).toBeUndefined();
    expect(st.patch.keep).toBe(1); // unrelated metadata preserved
  });

  it("a single empty step does not alert", () => {
    const st = nextForwardEmptyState({}, 0);
    expect(st.streak).toBe(1);
    expect(st.alert).toBe(false);
    expect(st.patch.forward_empty_streak).toBe(1);
  });

  it("empties accumulate and alert exactly once on crossing the threshold", () => {
    let meta: Record<string, unknown> = {};
    let alerts = 0;
    for (let i = 0; i < FORWARD_EMPTY_ALERT_THRESHOLD + 3; i++) {
      const st = nextForwardEmptyState(meta, 0);
      if (st.alert) alerts++;
      meta = st.patch;
    }
    expect(alerts).toBe(1); // one-shot per frozen spell, not every tick
    expect(meta.forward_frozen_alerted_at).toBeTruthy();
    expect(meta.forward_empty_streak).toBe(FORWARD_EMPTY_ALERT_THRESHOLD + 3);
  });

  it("re-freezing after recovery alerts again", () => {
    let meta: Record<string, unknown> = {};
    for (let i = 0; i < FORWARD_EMPTY_ALERT_THRESHOLD; i++) meta = nextForwardEmptyState(meta, 0).patch;
    meta = nextForwardEmptyState(meta, 10).patch; // recovery clears the marker
    let alertedAgain = false;
    for (let i = 0; i < FORWARD_EMPTY_ALERT_THRESHOLD; i++) {
      const st = nextForwardEmptyState(meta, 0);
      if (st.alert) alertedAgain = true;
      meta = st.patch;
    }
    expect(alertedAgain).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(nextForwardEmptyState({ forward_empty_streak: 1 }, 0, 2).alert).toBe(true);
    expect(nextForwardEmptyState({}, 0, 2).alert).toBe(false);
  });
});
