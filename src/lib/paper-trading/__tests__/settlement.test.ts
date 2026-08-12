import { describe, expect, it } from "vitest";
import {
  clampRealizedPnl, nextBalance, nextStatistics, EMPTY_STATISTICS,
  type AccountMoneyState, type StatisticsState,
} from "@/lib/paper-trading/settlement";

/**
 * A settlement as the server performs it: clamp once, then apply the SAME
 * clamped figure to balance and statistics. Mirrors `settleRealizedPnl`.
 */
function settle(
  acct: AccountMoneyState,
  stats: StatisticsState,
  rawPnl: number,
  countsAsTrade = true,
) {
  const { pnl, clamped } = clampRealizedPnl(rawPnl, acct);
  return {
    pnl,
    clamped,
    acct: { ...acct, balance: nextBalance(acct.balance, pnl, acct.negative_balance_protection) },
    stats: nextStatistics(stats, pnl, countsAsTrade),
  };
}

const account = (balance: number, nbp = true): AccountMoneyState => ({
  balance, negative_balance_protection: nbp,
});

describe("clampRealizedPnl", () => {
  it("leaves a profit alone", () => {
    expect(clampRealizedPnl(250, account(10_000))).toEqual({ pnl: 250, clamped: false });
  });

  it("leaves a survivable loss alone", () => {
    expect(clampRealizedPnl(-250, account(10_000))).toEqual({ pnl: -250, clamped: false });
  });

  it("caps a loss at the whole balance", () => {
    expect(clampRealizedPnl(-15_000, account(10_000))).toEqual({ pnl: -10_000, clamped: true });
  });

  it("does not cap when protection is off", () => {
    const r = clampRealizedPnl(-15_000, account(10_000, false));
    expect(r).toEqual({ pnl: -15_000, clamped: false });
  });

  it("treats a loss that lands exactly at zero as unclamped", () => {
    expect(clampRealizedPnl(-10_000, account(10_000))).toEqual({ pnl: -10_000, clamped: false });
  });
});

describe("nextStatistics — what a partial may and may not touch", () => {
  it("counts a completed trade", () => {
    const s = nextStatistics(EMPTY_STATISTICS, 100, true);
    expect(s.total_trades).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.net_pnl).toBe(100);
    expect(s.best_trade).toBe(100);
    expect(s.win_rate).toBe(100);
  });

  it("routes a partial's money to net_pnl without counting a trade", () => {
    const s = nextStatistics(EMPTY_STATISTICS, 100, false);
    // The money is real and must be recorded, or balance diverges from net_pnl.
    expect(s.net_pnl).toBe(100);
    expect(s.gross_profit).toBe(100);
    // …but the position is still open, so it is not a finished trade.
    expect(s.total_trades).toBe(0);
    expect(s.wins).toBe(0);
    expect(s.best_trade).toBe(0);
  });

  it("never lets a partial move win_rate", () => {
    let s = nextStatistics(EMPTY_STATISTICS, -50, false);
    s = nextStatistics(s, -50, false);
    expect(s.win_rate).toBe(0);
    expect(s.total_trades).toBe(0);
  });

  it("starts from nothing when no statistics row exists yet", () => {
    const s = nextStatistics(null, -42, true);
    expect(s.total_trades).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.net_pnl).toBe(-42);
    expect(s.worst_trade).toBe(-42);
  });

  it("classifies a flat close as a break-even, not a win or a loss", () => {
    const s = nextStatistics(EMPTY_STATISTICS, 0, true);
    expect(s.breakevens).toBe(1);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(0);
  });
});

describe("the three-way invariant", () => {
  it("holds across a mixed sequence of closes and partials", () => {
    const start = 10_000;
    let acct = account(start);
    let stats = EMPTY_STATISTICS;

    // The shape of the run that exposed BA-11: some full closes, some partials.
    const sequence: Array<[number, boolean]> = [
      [1320.88, true], [-625.44, true], [-894.96, true],
      [1110.86, true], [-731.24, true],
      [-0.41, true], [-0.26, true],
      [37.5, false], [-12.25, false],
    ];

    for (const [pnl, countsAsTrade] of sequence) {
      const r = settle(acct, stats, pnl, countsAsTrade);
      acct = r.acct;
      stats = r.stats;
      // Checked at EVERY step, not just the end — a drift that cancels out
      // later is still a window where the dashboard was lying.
      expect(acct.balance - start).toBeCloseTo(stats.net_pnl, 6);
    }

    // Seven completed trades; the two partials must not have inflated the count.
    expect(stats.total_trades).toBe(7);
    expect(acct.balance - start).toBeCloseTo(stats.net_pnl, 6);
  });

  it("holds when a loss is clamped by negative-balance protection", () => {
    const start = 500;
    let acct = account(start);
    let stats = EMPTY_STATISTICS;

    const r = settle(acct, stats, -9_000);
    acct = r.acct;
    stats = r.stats;

    expect(r.clamped).toBe(true);
    expect(r.pnl).toBe(-500);            // capped at the balance
    expect(acct.balance).toBe(0);        // floors at zero, never negative
    expect(stats.net_pnl).toBe(-500);    // statistics record the CAPPED figure
    // The invariant survives the clamp — this is the case that breaks when the
    // cap is applied at balance-update time instead of before the trade write.
    expect(acct.balance - start).toBeCloseTo(stats.net_pnl, 6);
  });

  it("holds without protection, including a negative balance", () => {
    const start = 500;
    let acct = account(start, false);
    let stats = EMPTY_STATISTICS;
    const r = settle(acct, stats, -9_000);
    acct = r.acct;
    stats = r.stats;

    expect(acct.balance).toBe(-8_500);
    expect(stats.net_pnl).toBe(-9_000 + 0);
    expect(acct.balance - start).toBeCloseTo(stats.net_pnl, 6);
  });

  it("reproduces the BA-11 drift when statistics are skipped", () => {
    // The defect, expressed as a test: apply P&L to the balance only — which
    // is what partialCloseTrade did — and the two diverge by exactly the
    // amount that never reached statistics.
    const start = 10_000;
    let balance = start;
    let stats = EMPTY_STATISTICS;
    const battleRows = [1320.88, -625.44, -894.96, 1110.86, -731.24];

    for (const pnl of battleRows) balance += pnl;      // no statistics write
    for (const pnl of [-0.41, -0.26]) {                 // written properly
      const r = settle(account(balance), stats, pnl);
      balance = r.acct.balance;
      stats = r.stats;
    }

    const drift = (balance - start) - stats.net_pnl;
    expect(drift).toBeCloseTo(180.10, 2);
  });
});
