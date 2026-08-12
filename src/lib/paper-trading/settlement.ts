/**
 * Realized-P&L settlement — the three-way invariant, in one place.
 *
 * Whenever money is realized on a paper account, three things must agree:
 *
 *     paper_accounts.balance   moved by exactly the realized P&L
 *     account_statistics.net_pnl   moved by exactly the same figure
 *     paper_trades.pnl         records that same figure
 *
 * Breaking that agreement is not a cosmetic bug. It produced a $70M drift on a
 * $25k account once, and on 2026-08-12 a −$180.10 drift was measured on the
 * demo account because one writer moved none of them (BA-11) and another moved
 * balance but not statistics (`partialCloseTrade`).
 *
 * The functions here are pure so the invariant can be tested without a
 * database: feed a sequence of settlements through them and assert that
 * `balance − startingBalance === stats.net_pnl` at every step. The I/O around
 * them lives in `paper-trading.functions.ts`.
 *
 * The ordering these encode matters and is easy to get wrong: **clamp before
 * writing anything.** If the negative-balance cap is applied at balance-update
 * time instead, `paper_trades.pnl` keeps the unclamped loss and the three
 * figures disagree by exactly the amount that was capped.
 */

export type AccountMoneyState = {
  balance: number;
  negative_balance_protection: boolean;
};

export type StatisticsState = {
  total_trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  win_rate: number;
  gross_profit: number;
  gross_loss: number;
  net_pnl: number;
  best_trade: number;
  worst_trade: number;
};

export const EMPTY_STATISTICS: StatisticsState = {
  total_trades: 0, wins: 0, losses: 0, breakevens: 0, win_rate: 0,
  gross_profit: 0, gross_loss: 0, net_pnl: 0, best_trade: 0, worst_trade: 0,
};

const n = (v: unknown, fallback = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

/**
 * Bound a realized loss so the post-settlement balance floors at zero.
 *
 * Returns the P&L that must be used *everywhere downstream* — the trade row,
 * the balance and the statistics — not just the balance.
 */
export function clampRealizedPnl(
  pnl: number,
  acct: AccountMoneyState,
): { pnl: number; clamped: boolean } {
  if (!Number.isFinite(pnl)) return { pnl: 0, clamped: false };
  if (!acct.negative_balance_protection) return { pnl, clamped: false };
  const balance = n(acct.balance);
  if (balance + pnl >= 0) return { pnl, clamped: false };
  // Cap the loss at everything the account has, and no more.
  return { pnl: -balance, clamped: true };
}

/**
 * Balance after applying an already-clamped P&L.
 *
 * The `max(0, …)` is belt-and-braces for legacy accounts carrying a stale
 * balance: with a clamped input it can never bind on its own.
 */
export function nextBalance(balance: number, clampedPnl: number, nbp: boolean): number {
  const raw = n(balance) + clampedPnl;
  return nbp ? Math.max(0, raw) : raw;
}

/**
 * Statistics after one settlement.
 *
 * `countsAsTrade` separates the two things a settlement can be:
 *
 * - **A completed trade** (`closeTrade`) — increments the trade counters and
 *   can set best/worst.
 * - **A partial realization** (`partialCloseTrade`) — money is realized and
 *   *must* reach `net_pnl` or the balance silently diverges from it, but the
 *   position is still open, so counting it as a finished trade would inflate
 *   `total_trades` and corrupt `win_rate`. Best/worst are likewise left alone:
 *   they describe whole trades, and a fragment is not one.
 */
export function nextStatistics(
  prev: Partial<StatisticsState> | null | undefined,
  clampedPnl: number,
  countsAsTrade: boolean,
): StatisticsState {
  const p = prev ?? {};
  const pnl = Number.isFinite(clampedPnl) ? clampedPnl : 0;
  const isWin = pnl > 0;
  const isLoss = pnl < 0;

  const total = n(p.total_trades) + (countsAsTrade ? 1 : 0);
  const wins = n(p.wins) + (countsAsTrade && isWin ? 1 : 0);
  const losses = n(p.losses) + (countsAsTrade && isLoss ? 1 : 0);
  const breakevens = n(p.breakevens) + (countsAsTrade && !isWin && !isLoss ? 1 : 0);

  return {
    total_trades: total,
    wins,
    losses,
    breakevens,
    win_rate: total ? (wins / total) * 100 : 0,
    // Gross profit/loss and net P&L track realized money, so a partial
    // contributes to them exactly as a full close does.
    gross_profit: n(p.gross_profit) + (isWin ? pnl : 0),
    gross_loss: n(p.gross_loss) + (isLoss ? Math.abs(pnl) : 0),
    net_pnl: n(p.net_pnl) + pnl,
    best_trade: countsAsTrade ? Math.max(n(p.best_trade), pnl) : n(p.best_trade),
    worst_trade: countsAsTrade ? Math.min(n(p.worst_trade), pnl) : n(p.worst_trade),
  };
}
