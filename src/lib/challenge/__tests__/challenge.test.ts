import { describe, expect, it } from "vitest";
import {
  evaluateChallenge,
  CHALLENGE_EVALUATOR_VERSION,
  type ChallengeFacts,
  type EvaluatorTrade,
} from "@/lib/challenge/evaluator";
import { dayKey } from "@/lib/analytics/periods";
import { checkChallengePolicy } from "@/lib/challenge/policy";
import { BUILT_IN_TEMPLATES, makeTemplate, RULE_IDS } from "@/lib/challenge/model";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);

function trade(patch: Partial<EvaluatorTrade> = {}): EvaluatorTrade {
  return {
    id: patch.id ?? "t1",
    symbol: "EURUSD",
    entryTime: T0,
    exitTime: T0 + 3_600_000,
    netPnl: 100,
    riskAmount: 50,
    ...patch,
  };
}

function facts(patch: Partial<ChallengeFacts> = {}): ChallengeFacts {
  return {
    startingBalance: 10_000,
    equityPoints: [{ t: T0, equity: 10_100 }],
    closedTrades: [trade()],
    openPositions: [],
    pendingOrders: 0,
    now: T0 + DAY,
    ...patch,
  };
}

describe("challenge evaluator", () => {
  it("passes a profit target once minimum trading days are met", () => {
    const tpl = makeTemplate({ id: "t", name: "T", profitTargetPct: 1, minTradingDays: 1 });
    const e = evaluateChallenge(tpl, facts());
    expect(e.status).toBe("passed");
    expect(e.evaluatorVersion).toBe(CHALLENGE_EVALUATOR_VERSION);
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.profitTarget)?.status).toBe("pass");
  });

  it("holds the target as pending until minimum days are reached", () => {
    const tpl = makeTemplate({ id: "t", name: "T", profitTargetPct: 1, minTradingDays: 5 });
    const e = evaluateChallenge(tpl, facts());
    expect(e.status).toBe("active");
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.minTradingDays)?.remaining).toBe(4);
  });

  it("fails a static drawdown breach", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxTotalDrawdownPct: 5, drawdownMode: "static" });
    const e = evaluateChallenge(
      tpl,
      facts({ equityPoints: [{ t: T0, equity: 9_400 }], closedTrades: [trade({ netPnl: -600 })] }),
    );
    expect(e.status).toBe("failed");
    expect(e.violations[0]!.ruleId).toBe(RULE_IDS.maxDrawdown);
    expect(e.violations[0]!.currentValue).toBe(6);
  });

  it("measures trailing drawdown from the equity peak", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxTotalDrawdownPct: 5, drawdownMode: "trailing" });
    const e = evaluateChallenge(
      tpl,
      facts({
        equityPoints: [
          { t: T0, equity: 11_000 },
          { t: T0 + 1000, equity: 10_400 },
        ],
      }),
    );
    // 600 off an 11,000 peak = 5.45% — a breach even though balance is up.
    expect(e.status).toBe("failed");
  });

  it("flags at-risk before an actual breach", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxTotalDrawdownPct: 10 });
    const e = evaluateChallenge(tpl, facts({ equityPoints: [{ t: T0, equity: 9_150 }] }));
    expect(e.status).toBe("at_risk");
  });

  it("evaluates daily loss against the prior day close in the challenge timezone", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxDailyLossPct: 2, timezone: "UTC" });
    const e = evaluateChallenge(
      tpl,
      facts({
        equityPoints: [
          { t: Date.UTC(2026, 0, 5, 20), equity: 10_000 },
          { t: Date.UTC(2026, 0, 6, 14), equity: 9_700 },
        ],
      }),
    );
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.dailyLoss)?.status).toBe("fail");
  });

  it("uses explicit timezone day boundaries", () => {
    const t = Date.UTC(2026, 0, 6, 1, 0);
    expect(dayKey(t, "UTC")).toBe("2026-01-06");
    expect(dayKey(t, "America/New_York")).toBe("2026-01-05");
  });

  it("reports unknown — not pass — when the equity curve is missing", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxTotalDrawdownPct: 5 });
    const e = evaluateChallenge(tpl, facts({ equityPoints: [] }));
    expect(e.status).toBe("data_unavailable");
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.maxDrawdown)?.status).toBe("unknown");
    expect(e.violations).toHaveLength(0);
  });

  it("does not judge trades with unknown risk sizing", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxRiskPerTradePct: 1 });
    const e = evaluateChallenge(tpl, facts({ closedTrades: [trade({ riskAmount: null })] }));
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.riskPerTrade)?.status).toBe("unknown");
  });

  it("fails a per-trade risk breach", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxRiskPerTradePct: 0.25 });
    const e = evaluateChallenge(tpl, facts({ closedTrades: [trade({ riskAmount: 100 })] }));
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.riskPerTrade)?.status).toBe("fail");
  });

  it("fails a maximum trading days breach", () => {
    const tpl = makeTemplate({ id: "t", name: "T", maxTradingDays: 1 });
    const e = evaluateChallenge(
      tpl,
      facts({ closedTrades: [trade({ id: "a" }), trade({ id: "b", exitTime: T0 + 2 * DAY })] }),
    );
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.maxTradingDays)?.status).toBe("fail");
  });

  it("blocks instruments outside the allowed list", () => {
    const tpl = makeTemplate({ id: "t", name: "T", allowedInstruments: ["GBPUSD"] });
    const e = evaluateChallenge(tpl, facts());
    expect(e.rules.find((r) => r.ruleId === RULE_IDS.instruments)?.status).toBe("fail");
  });

  it("labels rules it cannot verify instead of claiming enforcement", () => {
    const tpl = makeTemplate({ id: "t", name: "T", weekendHolding: false });
    const e = evaluateChallenge(tpl, facts());
    const rule = e.rules.find((r) => r.ruleId === RULE_IDS.weekendHolding)!;
    expect(rule.status).toBe("unknown");
    expect(rule.enforcement).toBe("not_verifiable");
  });

  it("is idempotent for the same facts", () => {
    const tpl = makeTemplate({ id: "t", name: "T", profitTargetPct: 1, minTradingDays: 1 });
    expect(evaluateChallenge(tpl, facts())).toEqual(evaluateChallenge(tpl, facts()));
  });

  it("preserves the template version it was evaluated against", () => {
    const tpl = makeTemplate({ id: "t", name: "T", version: 7 });
    expect(evaluateChallenge(tpl, facts()).templateVersion).toBe(7);
  });

  it("ships built-in templates with explicit enforcement labels", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(Object.keys(t.enforcement).length).toBeGreaterThan(0);
    }
  });
});

describe("challenge policy layer", () => {
  const tpl = makeTemplate({
    id: "t",
    name: "T",
    maxRiskPerTradePct: 1,
    maxOpenRiskPct: 2,
    maxOpenPositions: 1,
    allowedInstruments: ["EURUSD"],
  });
  const ok = evaluateChallenge(tpl, facts());
  const failed = evaluateChallenge(
    makeTemplate({ id: "t", name: "T", maxTotalDrawdownPct: 1 }),
    facts({ equityPoints: [{ t: T0, equity: 9_000 }] }),
  );

  const intent = { kind: "open" as const, symbol: "EURUSD", riskAmount: 50, openRiskAmount: 0, openPositions: 0 };

  it("allows compliant new risk", () => {
    expect(checkChallengePolicy({ template: tpl, evaluation: ok, intent }).allowed).toBe(true);
  });

  it("blocks risk above the per-trade limit", () => {
    const d = checkChallengePolicy({ template: tpl, evaluation: ok, intent: { ...intent, riskAmount: 200 } });
    expect(d.allowed).toBe(false);
    expect(d.ruleId).toBe(RULE_IDS.riskPerTrade);
  });

  it("blocks exposure above the open-risk cap", () => {
    const d = checkChallengePolicy({ template: tpl, evaluation: ok, intent: { ...intent, openRiskAmount: 180 } });
    expect(d.ruleId).toBe(RULE_IDS.openRisk);
  });

  it("blocks a symbol outside the allowed list", () => {
    const d = checkChallengePolicy({ template: tpl, evaluation: ok, intent: { ...intent, symbol: "XAUUSD" } });
    expect(d.ruleId).toBe(RULE_IDS.instruments);
  });

  it("blocks a second position when only one is allowed", () => {
    const d = checkChallengePolicy({ template: tpl, evaluation: ok, intent: { ...intent, openPositions: 1 } });
    expect(d.ruleId).toBe(RULE_IDS.openPositions);
  });

  it("blocks new risk after failure", () => {
    expect(checkChallengePolicy({ template: tpl, evaluation: failed, intent }).allowed).toBe(false);
  });

  it("still allows closing, reducing and tightening after failure", () => {
    for (const kind of ["close", "reduce", "tighten_stop"] as const) {
      expect(checkChallengePolicy({ template: tpl, evaluation: failed, intent: { ...intent, kind } }).allowed).toBe(true);
    }
  });
});
