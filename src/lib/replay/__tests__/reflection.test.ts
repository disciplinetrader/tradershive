/**
 * Phase 8C · reflection-layer and legacy-cutover tests.
 *
 * These guard the migration invariants, not the UI:
 *   · canonical execution facts map into the ONE score formula without
 *     fabricating anything
 *   · unknown stays unknown (no starting balance ⇒ no risk_pct)
 *   · reflection data never touches execution state
 *   · only one Replay runtime remains in the tree
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scoreFactsFromClosedTrades } from "../reflection/adapter";
import { computeReplayScore } from "../score";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";

const root = join(process.cwd(), "src");

function trade(over: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: "t1", orderId: "o1", positionId: "p1", drawingId: "d1",
    symbol: "EUR/USD", market: "forex", direction: "buy", orderType: "market",
    requestedEntry: 1, fillPrice: 1, entryTime: 0,
    initialStop: 0.99, initialTarget: 1.02, finalStop: 0.99, finalTarget: 1.02,
    exitPrice: 1.02, exitTime: 10, closeReason: "target",
    quantity: 1, positionSize: 1, grossPnl: 20, fees: 0, netPnl: 20,
    riskAmount: 100, initialRiskDistance: 0.01, realizedR: 2,
    returnPercent: 2, slippage: 0, executionSource: "manual",
    closedAt: 10, journalEntryId: null, journalStatus: "none", archivedAt: null,
    ...(over as object),
  } as unknown as ClosedTrade;
}

describe("Phase 8C · canonical → score adapter", () => {
  it("copies execution facts verbatim", () => {
    const [f] = scoreFactsFromClosedTrades([trade()]);
    expect(f).toMatchObject({ status: "closed", stop_loss: 0.99, pnl: 20, rr_realized: 2 });
  });

  it("omits risk_pct when the starting balance is unknown", () => {
    const [f] = scoreFactsFromClosedTrades([trade()]);
    expect("risk_pct" in f).toBe(false);
  });

  it("derives risk_pct only from a known starting balance", () => {
    const [f] = scoreFactsFromClosedTrades([trade({ riskAmount: 100 })], { startingBalance: 10_000 });
    expect(f.risk_pct).toBeCloseTo(1);
  });

  it("treats a non-positive balance as unknown", () => {
    const [f] = scoreFactsFromClosedTrades([trade()], { startingBalance: 0 });
    expect(f.risk_pct).toBeUndefined();
  });

  it("feeds the single shared score formula", () => {
    const facts = scoreFactsFromClosedTrades([trade(), trade({ id: "t2", netPnl: -50, realizedR: -1 })], {
      startingBalance: 10_000,
    });
    const s = computeReplayScore({
      trades: facts as never,
      checklist: [{ id: "c", checked: true }] as never,
      bookmarks: [{ category: "lesson" }] as never,
      notesCount: 2,
    });
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });

  it("produces no trades from an empty session (never invents one)", () => {
    expect(scoreFactsFromClosedTrades([])).toEqual([]);
  });
});

describe("Phase 8C · legacy cutover", () => {
  const legacy = [
    "components/replay/context.tsx",
    "components/replay/ReplayChart.tsx",
    "components/replay/ReplayControls.tsx",
    "components/replay/ReplayTimeline.tsx",
    "components/replay/NotesPanel.tsx",
    "components/replay/BookmarksPanel.tsx",
    "components/replay/ChecklistPanel.tsx",
    "components/replay/CheckpointsPanel.tsx",
    "components/replay/ScoreCard.tsx",
    "components/replay/x/ReplayTransport.tsx",
    "components/replay/x/useReplayHotkeys.ts",
  ];

  it("removes every legacy replay runtime module", () => {
    for (const rel of legacy) expect(existsSync(join(root, rel)), rel).toBe(false);
  });

  it("leaves exactly one replay playback controller", () => {
    expect(existsSync(join(root, "lib/replay/session/controller.ts"))).toBe(true);
  });

  it("redirects the legacy /replay/session route to the canonical studio", () => {
    const src = readFileSync(join(root, "routes/_authenticated/replay.session.tsx"), "utf8");
    expect(src).toContain("redirect");
    expect(src).toContain("/replay/studio");
  });

  it("keeps a single scoring implementation", () => {
    const fns = readFileSync(join(root, "lib/replay.functions.ts"), "utf8");
    expect(fns).not.toContain("computeReplayScore(");
    const reflection = readFileSync(join(root, "lib/replay-reflection.functions.ts"), "utf8");
    expect(reflection).toContain("computeReplayScore(");
  });

  it("keeps reflection persistence out of the engine snapshot", () => {
    const reflection = readFileSync(join(root, "lib/replay-reflection.functions.ts"), "utf8");
    // reflection writes rows in dedicated tables; it never patches the
    // session settings blob that carries the engine snapshot.
    expect(reflection).not.toContain("settings:");
    expect(reflection).not.toContain("SNAPSHOT_SETTINGS_KEY");
  });

  it("keeps the reflection panel free of execution math", () => {
    const panel = readFileSync(join(root, "components/replay/studio/ReflectionPanel.tsx"), "utf8");
    for (const banned of ["netPnl *", "realizedR *", "riskAmount", "* quantity"]) {
      expect(panel.includes(banned), banned).toBe(false);
    }
  });
});
