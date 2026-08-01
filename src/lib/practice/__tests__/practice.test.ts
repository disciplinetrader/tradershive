import { describe, expect, it } from "vitest";
import { evaluateDrill, type DrillTrade } from "@/lib/practice/evaluate";
import { findDrill, DRILLS } from "@/lib/practice/drills";
import { deriveSkillProgress, skillResultFromDrill, type SkillResultRecord } from "@/lib/practice/skills";
import { recommendPractice } from "@/lib/practice/recommend";
import { toSafeAssignment, type PracticeAssignment } from "@/lib/practice/types";

const HOUR = 3_600_000;

function trade(patch: Partial<DrillTrade> = {}): DrillTrade {
  return {
    id: patch.id ?? "t1",
    symbol: "EURUSD",
    direction: "long",
    entryTime: 1_700_000_000_000,
    exitTime: 1_700_000_000_000 + HOUR,
    netPnl: 100,
    riskAmount: 50,
    initialStop: 1.09,
    initialTarget: 1.11,
    finalStop: 1.09,
    closeReason: "target",
    managedAfterEntry: false,
    stopWidened: false,
    ...patch,
  };
}

describe("drill evaluation", () => {
  it("passes a clean stop-discipline attempt", () => {
    const drill = findDrill("stop_discipline")!;
    const r = evaluateDrill(drill, { startingBalance: 10_000, trades: [trade()] });
    expect(r.failed).toBe(false);
    expect(r.completed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.scoreVersion).toBe("drill_score_v1");
    expect(r.drillVersion).toBe(drill.version);
  });

  it("flags a widened stop as a violation and a missed objective", () => {
    const drill = findDrill("stop_discipline")!;
    const r = evaluateDrill(drill, {
      startingBalance: 10_000,
      trades: [trade({ stopWidened: true, finalStop: 1.05 })],
    });
    expect(r.failed).toBe(true);
    expect(r.violations.map((v) => v.ruleId)).toContain("stop_widened");
    expect(r.objectives.find((o) => o.id === "no_widening")?.status).toBe("missed");
    expect(r.score).toBeLessThan(100);
  });

  it("enforces the trade-count limit", () => {
    const drill = findDrill("entry_patience")!;
    const r = evaluateDrill(drill, {
      startingBalance: 10_000,
      trades: [trade({ id: "a" }), trade({ id: "b" }), trade({ id: "c" })],
    });
    expect(r.violations.map((v) => v.ruleId)).toContain("max_trades");
    expect(r.objectives.find((o) => o.id === "trade_count")?.status).toBe("missed");
  });

  it("enforces the per-trade risk cap and the daily loss limit", () => {
    const drill = findDrill("daily_loss_guard")!;
    const r = evaluateDrill(drill, {
      startingBalance: 10_000,
      trades: [trade({ riskAmount: 400, netPnl: -400 })],
    });
    expect(r.violations.map((v) => v.ruleId)).toEqual(expect.arrayContaining(["risk_per_trade"]));
    expect(r.objectives.find((o) => o.id === "risk_cap")?.status).toBe("missed");
  });

  it("keeps unknown risk unknown instead of scoring it as a pass", () => {
    const drill = findDrill("daily_loss_guard")!;
    const r = evaluateDrill(drill, { startingBalance: 10_000, trades: [trade({ riskAmount: null })] });
    expect(r.objectives.find((o) => o.id === "risk_cap")?.status).toBe("unknown");
  });

  it("leaves unanswered reflection objectives unknown", () => {
    const drill = findDrill("entry_patience")!;
    const r = evaluateDrill(drill, { startingBalance: 10_000, trades: [trade()] });
    expect(r.objectives.find((o) => o.id === "no_chase")?.status).toBe("unknown");
    const answered = evaluateDrill(drill, {
      startingBalance: 10_000,
      trades: [trade()],
      reflections: { no_chase: true },
    });
    expect(answered.objectives.find((o) => o.id === "no_chase")?.status).toBe("met");
  });

  it("is deterministic across repeated evaluation (idempotent completion)", () => {
    const drill = findDrill("hold_to_plan")!;
    const facts = { startingBalance: 10_000, trades: [trade({ closeReason: "manual" })] };
    const a = evaluateDrill(drill, facts, 1);
    const b = evaluateDrill(drill, facts, 1);
    expect(a).toEqual(b);
  });

  it("ships every drill with a version and a score version", () => {
    for (const d of DRILLS) {
      expect(d.version).toBeGreaterThan(0);
      expect(d.scoreVersion).toMatch(/^drill_score_v/);
    }
  });
});

describe("skill progression", () => {
  const base = (score: number | null, createdAt: string): SkillResultRecord => ({
    skill: "stop_placement",
    score,
    scoreVersion: "drill_score_v1",
    sampleSize: 2,
    evidence: {},
    sourceSessionId: null,
    sourceAssignmentId: null,
    sourceDrillId: "stop_discipline",
    createdAt,
  });

  it("derives progress from attempts rather than a stored number", () => {
    const [p] = deriveSkillProgress([
      base(40, "2026-01-01T00:00:00Z"),
      base(60, "2026-01-02T00:00:00Z"),
      base(80, "2026-01-03T00:00:00Z"),
    ]);
    expect(p!.attempts).toBe(3);
    expect(p!.latest).toBe(80);
    expect(p!.best).toBe(80);
    expect(p!.average).toBe(60);
    expect(p!.delta).toBe(30);
    expect(p!.confidence).toBe("moderate");
  });

  it("keeps unscored attempts out of the average and reports insufficient evidence", () => {
    const [p] = deriveSkillProgress([base(null, "2026-01-01T00:00:00Z")]);
    expect(p!.average).toBeNull();
    expect(p!.confidence).toBe("insufficient");
  });

  it("records the score version that produced a result", () => {
    const drill = findDrill("stop_discipline")!;
    const rec = skillResultFromDrill({
      result: evaluateDrill(drill, { startingBalance: 10_000, trades: [trade()] }),
      skill: "stop_placement",
      sessionId: "s1",
      assignmentId: "a1",
    });
    expect(rec.scoreVersion).toBe("drill_score_v1");
    expect(rec.sourceDrillId).toBe("stop_discipline");
  });
});

describe("practice recommendations", () => {
  it("prioritises challenge breaches and carries evidence", () => {
    const [top] = recommendPractice({
      mistakeCounts: {},
      skillScores: {},
      challengeBreaches: { daily_loss: 3 },
      recentDrillIds: [],
    });
    expect(top!.drillId).toBe("daily_loss_guard");
    expect(top!.evidence.source).toBe("challenge:daily_loss");
    expect(top!.evidenceLevel).toBe("moderate");
    expect(top!.origin).toBe("rule");
  });

  it("never recommends from unknown skill scores", () => {
    const recs = recommendPractice({
      mistakeCounts: {},
      skillScores: { stop_placement: { average: null, attempts: 0 } },
      challengeBreaches: {},
      recentDrillIds: [],
    });
    expect(recs.every((r) => r.evidence.source !== "skill:stop_placement")).toBe(true);
    expect(recs[0]!.evidence.source).toBe("baseline");
    expect(recs[0]!.evidenceLevel).toBe("insufficient");
  });

  it("de-prioritises a drill attempted very recently", () => {
    const recs = recommendPractice({
      mistakeCounts: { early_exit: 2, moved_stop: 2 },
      skillScores: {},
      challengeBreaches: {},
      recentDrillIds: ["hold_to_plan"],
    });
    expect(recs[0]!.drillId).toBe("stop_discipline");
  });
});

describe("blind practice safety", () => {
  const assignment = {
    id: "a1",
    userId: "u1",
    title: "Surprise session",
    description: null,
    practiceType: "surprise",
    targetSkill: null,
    targetMistake: null,
    playbookId: null,
    drillId: null,
    drillVersion: null,
    symbolRules: { symbol: "EURUSD" },
    timeframeRules: { timeframe: "5m" },
    datasetRules: { market: "forex", from: 1, to: 2, provider: "historical" },
    riskRules: {},
    tradeRules: {},
    completion: {},
    scoringProfile: "default_v1",
    createdSource: "user",
    coachSource: null,
    dueAt: null,
    status: "in_progress",
    replaySessionId: "s1",
    reviewSessionId: null,
    hiddenContext: { replay_date: "2021-03-04" },
    result: {},
    version: 1,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
  } satisfies PracticeAssignment;

  it("withholds dataset and hidden context while the session is blind", () => {
    const safe = toSafeAssignment(assignment, { revealed: false });
    expect(safe.blind).toBe(true);
    expect(safe.datasetRules).toEqual({});
    expect(JSON.stringify(safe)).not.toContain("2021-03-04");
  });

  it("reveals dataset context once the session is over", () => {
    const safe = toSafeAssignment(assignment, { revealed: true });
    expect(safe.blind).toBe(false);
    expect(safe.datasetRules).toMatchObject({ market: "forex" });
    expect(JSON.stringify(safe)).not.toContain("hiddenContext");
  });
});
