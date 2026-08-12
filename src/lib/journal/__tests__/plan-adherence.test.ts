import { describe, expect, it } from "vitest";
import { planAdherence, followedPlanOf, verdictForRule } from "@/lib/journal/plan-adherence";

const rule = (id: string, checked: boolean) => ({ id, label: id, checked });

describe("planAdherence — measurability", () => {
  it("is unmeasurable when the entry defines no rules", () => {
    // The state every auto-created draft is in: the close trigger leaves
    // `checklist` empty. This must NOT read as 0% adherence.
    expect(planAdherence({ checklist: [], playbookReview: {} }))
      .toEqual({ measurable: false, reason: "no_rules" });
  });

  it("is unmeasurable when checklist is not an array at all", () => {
    for (const junk of [null, undefined, {}, "", 0, "[]"]) {
      expect(planAdherence({ checklist: junk, playbookReview: {} }).measurable).toBe(false);
    }
  });

  it("ignores malformed rule entries rather than counting them", () => {
    const a = planAdherence({
      checklist: [rule("a", true), null, 42, {}, { checked: true }],
      playbookReview: {},
    });
    // Only "a" is a usable rule; the id-less object is not one.
    expect(a).toMatchObject({ measurable: true, rules: 1, followed: 1 });
  });
});

describe("planAdherence — the 100% threshold", () => {
  it("every rule followed is followedPlan true", () => {
    const a = planAdherence({
      checklist: [rule("a", true), rule("b", true), rule("c", true)],
      playbookReview: {},
    });
    expect(a).toMatchObject({ measurable: true, rules: 3, followed: 3, ratio: 1, followedPlan: true });
  });

  it("one rule short is false, not 'mostly'", () => {
    const a = planAdherence({
      checklist: [rule("a", true), rule("b", true), rule("c", false)],
      playbookReview: {},
    });
    expect(a).toMatchObject({ followed: 2, followedPlan: false });
    // The ratio is still reported — the bar is on the boolean, not the data.
    expect(a.measurable && a.ratio).toBeCloseTo(2 / 3, 6);
  });

  it("does not round 99% up to followed", () => {
    const checklist = Array.from({ length: 100 }, (_, i) => rule(`r${i}`, i !== 0));
    const a = planAdherence({ checklist, playbookReview: {} });
    expect(a).toMatchObject({ followed: 99, followedPlan: false });
  });
});

describe("planAdherence — trader overrides win", () => {
  it("an override can rescue an unchecked rule", () => {
    const a = planAdherence({
      checklist: [rule("a", true), rule("b", false)],
      playbookReview: { overrides: { b: "followed" } },
    });
    expect(a).toMatchObject({ followed: 2, followedPlan: true });
  });

  it("an override can demote a checked rule", () => {
    const a = planAdherence({
      checklist: [rule("a", true), rule("b", true)],
      playbookReview: { overrides: { b: "broken" } },
    });
    expect(a).toMatchObject({ followed: 1, followedPlan: false });
  });

  it("ignores override values outside the verdict vocabulary", () => {
    const a = planAdherence({
      checklist: [rule("a", false)],
      playbookReview: { overrides: { a: "definitely" } },
    });
    expect(a).toMatchObject({ followed: 0, followedPlan: false });
  });

  it("survives a junk playbook_review", () => {
    for (const junk of [null, undefined, [], "x", { overrides: 7 }]) {
      const a = planAdherence({ checklist: [rule("a", true)], playbookReview: junk });
      expect(a).toMatchObject({ measurable: true, followed: 1 });
    }
  });
});

describe("verdictForRule", () => {
  it("falls back to the checkbox when there is no override", () => {
    expect(verdictForRule(rule("a", true), {})).toBe("followed");
    expect(verdictForRule(rule("a", false), {})).toBe("missed");
  });
  it("prefers the override", () => {
    expect(verdictForRule(rule("a", false), { a: "followed" })).toBe("followed");
  });
});

describe("followedPlanOf", () => {
  it("returns null — not false — when unmeasurable", () => {
    const v = followedPlanOf({ checklist: [], playbook_review: {} });
    expect(v).toBeNull();
    // The distinction the discipline metric depends on: null is excluded from
    // the denominator, false is counted against you.
    expect(v).not.toBe(false);
  });

  it("returns the threshold verdict when measurable", () => {
    expect(followedPlanOf({ checklist: [rule("a", true)], playbook_review: {} })).toBe(true);
    expect(followedPlanOf({ checklist: [rule("a", false)], playbook_review: {} })).toBe(false);
  });

  it("matches live-shaped rows, which are empty today", () => {
    // Exactly what the live database returns right now for every entry.
    expect(followedPlanOf({ checklist: [], playbook_review: {} })).toBeNull();
  });
});
