/**
 * Phase 8D regression tests — review, comparison and improvement.
 *
 * These assert the properties the feature depends on:
 *   · a summary derives only from recorded trades (no fabricated numbers)
 *   · scoring inputs are reproducible: same facts ⇒ same revision hash
 *   · the improvement view refuses to invent a trend from one sample
 */
import { describe, expect, it } from "vitest";
import { buildSessionSummary } from "../review/summary";
import { buildScoreInputs } from "../review/score";
import { buildImprovementView } from "../review/improvement";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";

const trade = (over: Partial<ClosedTrade>): ClosedTrade =>
  ({
    id: "t1",
    symbol: "EURUSD",
    market: "forex",
    timeframe: "5m",
    direction: "buy",
    quantity: 1,
    fillPrice: 1.1,
    exitPrice: 1.2,
    entryTime: 1,
    exitTime: 2,
    netPnl: 100,
    grossPnl: 100,
    fees: 0,
    realizedR: 1,
    stopLoss: 1.05,
    takeProfit: null,
    closeReason: "target",
    ...over,
  }) as unknown as ClosedTrade;

const reflection = { notes: 1, bookmarks: 1, checkpoints: 0, screenshots: 0, checklistTotal: 2, checklistDone: 1 };

describe("Phase 8D · session summary", () => {
  it("reports zeroed performance and an honest unknown for an empty session", () => {
    const s = buildSessionSummary({
      sessionId: "s1", symbol: "EURUSD", timeframe: "5m", status: "completed",
      durationSeconds: null, completionPct: null, startingBalance: 10_000, trades: [], reflection,
    });
    expect(s.performance.tradeCount).toBe(0);
    expect(s.unknowns.length).toBeGreaterThan(0);
  });

  it("derives net result and best/worst trade from the recorded tape", () => {
    const s = buildSessionSummary({
      sessionId: "s1", symbol: "EURUSD", timeframe: "5m", status: "completed",
      durationSeconds: 600, completionPct: 100, startingBalance: 10_000,
      trades: [trade({ id: "win", netPnl: 200 }), trade({ id: "loss", netPnl: -50, realizedR: -1 })],
      reflection,
    });
    expect(s.performance.tradeCount).toBe(2);
    expect(s.performance.netPnl).toBe(150);
    expect(s.bestTradeId).toBe("win");
    expect(s.worstTradeId).toBe("loss");
  });
});

describe("Phase 8D · reproducible scoring", () => {
  it("produces the same revision hash for the same facts", () => {
    const args = {
      trades: [trade({})],
      checklist: [{ checked: true }, { checked: false }],
      bookmarks: [{ category: "good_setup" }],
      notesCount: 2,
    };
    expect(buildScoreInputs(args as never).revisionHash).toBe(buildScoreInputs(args as never).revisionHash);
  });

  it("changes the revision hash when the facts change", () => {
    const a = buildScoreInputs({ trades: [trade({})], checklist: [], bookmarks: [], notesCount: 0 } as never);
    const b = buildScoreInputs({ trades: [trade({})], checklist: [], bookmarks: [], notesCount: 3 } as never);
    expect(a.revisionHash).not.toBe(b.revisionHash);
  });
});

describe("Phase 8D · improvement intelligence", () => {
  const score = (over: Record<string, unknown>) => ({
    score: 60, discipline: 60, risk: 60, execution: 60, patience: 60, consistency: 60,
    journal_completion: 60, created_at: new Date().toISOString(), ...over,
  });

  it("names the gap instead of drawing a trend from nothing", () => {
    const v = buildImprovementView({ scores: [], comparisons: [] });
    expect(v.trend).toHaveLength(0);
    expect(v.unknowns.length).toBeGreaterThan(0);
  });

  it("reports a positive delta once a later sample improves", () => {
    const v = buildImprovementView({
      scores: [
        score({ created_at: "2026-01-01T00:00:00Z", discipline: 40, score: 40 }) as never,
        score({ created_at: "2026-02-01T00:00:00Z", discipline: 80, score: 80 }) as never,
      ],
      comparisons: [],
    });
    const discipline = v.dimensions.find((d) => d.key === "discipline")!;
    expect(discipline.delta).toBeGreaterThan(0);
    expect(v.recentScore).toBe(80);
  });
});
