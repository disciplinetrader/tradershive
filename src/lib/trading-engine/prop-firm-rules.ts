/**
 * Prop-firm rule evaluators — Phase 3.
 *
 * Pure functions that inspect account state and return a pass/fail verdict
 * for the classic prop-firm rulesets (daily loss, max drawdown, profit
 * target, minimum trading days, consistency). Kept intentionally separate
 * from the core Trading Engine — the engine emits state, callers decide
 * whether the account has breached its evaluation rules.
 */

import type { AccountSnapshot } from "./types";

export type PropFirmRules = {
  startingBalance: number;
  profitTargetPct?: number;
  maxDailyDrawdownPct?: number;
  maxTotalDrawdownPct?: number;
  minTradingDays?: number;
  /** Largest single-day profit must not exceed this % of total profit. */
  consistencyPct?: number;
  /** Disallow positions held over the weekend. */
  weekendHoldAllowed?: boolean;
};

export type DailyStat = {
  /** ISO date (YYYY-MM-DD) — the trading day. */
  date: string;
  /** Realized PnL for the day (account currency). */
  realized_pnl: number;
  /** End-of-day equity — used for daily drawdown checks. */
  end_equity: number;
  /** Peak equity seen intraday. */
  peak_equity: number;
  /** Trades placed on this day (any close counts). */
  trades: number;
};

export type RuleBreach = {
  code:
    | "daily_drawdown"
    | "total_drawdown"
    | "weekend_hold"
    | "no_stop_loss";
  message: string;
  observed: number;
  limit: number;
  date?: string;
};

export type RuleEvaluation = {
  passed: boolean;
  breaches: RuleBreach[];
  progress: {
    profitPct: number;
    profitTargetPct: number;
    profitTargetHit: boolean;
    tradingDays: number;
    minTradingDays: number;
    tradingDaysMet: boolean;
    consistencyPct: number | null;
    consistencyMet: boolean;
    largestDailyProfit: number;
  };
};

/**
 * Evaluate a set of daily stats + current snapshot against the rules.
 * Returns the first breach encountered per rule and a progress summary.
 */
export function evaluatePropFirmRules(
  rules: PropFirmRules,
  snapshot: AccountSnapshot,
  daily: DailyStat[],
): RuleEvaluation {
  const breaches: RuleBreach[] = [];
  const start = rules.startingBalance;

  // Daily drawdown — end-of-day equity vs previous day's end (or start).
  if (rules.maxDailyDrawdownPct != null) {
    let ref = start;
    for (const d of daily) {
      const drawdown = ((ref - d.end_equity) / ref) * 100;
      if (drawdown > rules.maxDailyDrawdownPct) {
        breaches.push({
          code: "daily_drawdown",
          message: `Daily drawdown ${drawdown.toFixed(2)}% exceeded ${rules.maxDailyDrawdownPct}%`,
          observed: drawdown, limit: rules.maxDailyDrawdownPct, date: d.date,
        });
        break;
      }
      ref = d.end_equity;
    }
  }

  // Total drawdown — snapshot equity vs starting balance.
  if (rules.maxTotalDrawdownPct != null) {
    const totalDd = ((start - snapshot.equity) / start) * 100;
    if (totalDd > rules.maxTotalDrawdownPct) {
      breaches.push({
        code: "total_drawdown",
        message: `Total drawdown ${totalDd.toFixed(2)}% exceeded ${rules.maxTotalDrawdownPct}%`,
        observed: totalDd, limit: rules.maxTotalDrawdownPct,
      });
    }
  }

  // Weekend-hold — any position open on Sat/Sun with the rule enabled.
  if (rules.weekendHoldAllowed === false) {
    const now = new Date(snapshot.updated_at);
    const day = now.getUTCDay(); // 0=Sun, 6=Sat
    if ((day === 0 || day === 6) && snapshot.positions.length > 0) {
      breaches.push({
        code: "weekend_hold",
        message: `Positions held over the weekend (${snapshot.positions.length} open)`,
        observed: snapshot.positions.length, limit: 0,
      });
    }
  }

  // Progress: profit target + min days + consistency.
  const profitPct = ((snapshot.equity - start) / start) * 100;
  const targetPct = rules.profitTargetPct ?? 0;

  const tradingDays = daily.filter((d) => d.trades > 0).length;
  const minDays = rules.minTradingDays ?? 0;

  const totalProfit = daily.reduce((a, d) => a + Math.max(0, d.realized_pnl), 0);
  const largestDailyProfit = daily.reduce((m, d) => Math.max(m, d.realized_pnl), 0);
  const consistencyPct = totalProfit > 0 ? (largestDailyProfit / totalProfit) * 100 : null;
  const consistencyLimit = rules.consistencyPct ?? 100;

  return {
    passed: breaches.length === 0,
    breaches,
    progress: {
      profitPct,
      profitTargetPct: targetPct,
      profitTargetHit: targetPct > 0 ? profitPct >= targetPct : true,
      tradingDays,
      minTradingDays: minDays,
      tradingDaysMet: tradingDays >= minDays,
      consistencyPct,
      consistencyMet: consistencyPct == null ? true : consistencyPct <= consistencyLimit,
      largestDailyProfit,
    },
  };
}

/** Convenience — is the account fully cleared (rules passed + all targets)? */
export function isPropFirmCleared(evaluation: RuleEvaluation): boolean {
  const p = evaluation.progress;
  return evaluation.passed && p.profitTargetHit && p.tradingDaysMet && p.consistencyMet;
}
