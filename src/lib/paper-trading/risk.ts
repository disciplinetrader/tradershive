/**
 * Account risk / margin math shared by every risk-aware surface
 * (AccountSummary, TodayPnL, Trading Workspace risk banner, server
 * stop-out job).
 *
 * Broker semantics:
 *   equity        = balance + Σ floating P/L
 *   used margin   = Σ (notional / leverage) per open position
 *   free margin   = equity − used margin
 *   margin level  = (equity / used margin) × 100     [% — undefined when no margin used]
 *
 * Thresholds are stored per account (`margin_call_level`, `stop_out_level`,
 * `negative_balance_protection`) so battles, championships and demo
 * accounts can each tune broker/prop-firm-style rules independently.
 */

import { findSymbol, type SymbolMeta } from "./symbols";
import {
  pnl as computePnl,
  marginRequired,
  notionalValue,
} from "./calculations";

export type OpenTradeInput = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entry_price: number | string;
  lot_size: number | string;
};

export type QuoteLookup = (symbol: string) => number | null | undefined;

export type PositionRisk = {
  trade: OpenTradeInput;
  sym: SymbolMeta;
  currentPrice: number;
  floatingPnl: number;
  notional: number;
  margin: number;
};

export type AccountRisk = {
  balance: number;
  equity: number;
  floatingPnl: number;
  usedMargin: number;
  freeMargin: number;
  /** null when no margin is in use (division-by-zero would be misleading). */
  marginLevel: number | null;
  positions: PositionRisk[];
  status: "safe" | "warning" | "margin_call" | "stop_out";
};

export type RiskLimits = {
  marginCallLevel: number;
  stopOutLevel: number;
  negativeBalanceProtection: boolean;
};

/**
 * Build a per-position and account-level risk snapshot.
 *
 * IMPORTANT: when `getPrice(symbol)` returns null/undefined we fall back to
 * the trade's own **entry price** — not the symbol's static `refPrice` seed.
 * Using `refPrice` (an arbitrary catalog value like BTC = $67,550) against a
 * real entry near $64k invents a $3k phantom delta per unit and, on a
 * 55,000-unit position, materialises ~$173M of phantom "floating P/L".
 * Falling back to entry means "no live tick yet → 0 unrealised P/L", which
 * matches broker behaviour and prevents the balance-vs-P&L blow-up the user
 * saw ($406k account, −$36M open P/L).
 */
export function computeAccountRisk(
  account: { balance: number | string; leverage: number },
  openTrades: OpenTradeInput[],
  getPrice: QuoteLookup,
  limits: RiskLimits = {
    marginCallLevel: 100,
    stopOutLevel: 50,
    negativeBalanceProtection: true,
  },
): AccountRisk {
  const balance = Number(account.balance) || 0;
  const leverage = Number(account.leverage) || 1;

  let floatingPnl = 0;
  let usedMargin = 0;
  const positions: PositionRisk[] = [];

  for (const t of openTrades) {
    const sym = findSymbol(t.symbol);
    if (!sym) continue;
    const entry = Number(t.entry_price);
    const lot = Number(t.lot_size);
    const live = getPrice(t.symbol);
    const currentPrice = live != null && Number.isFinite(live) && live > 0 ? live : entry;
    const pnl = computePnl(sym, t.direction, entry, currentPrice, lot);
    const margin = marginRequired(sym, lot, entry, leverage);
    const notional = notionalValue(sym, lot, entry);
    floatingPnl += pnl;
    usedMargin += margin;
    positions.push({ trade: t, sym, currentPrice, floatingPnl: pnl, notional, margin });
  }

  const rawEquity = balance + floatingPnl;
  const equity = limits.negativeBalanceProtection ? Math.max(0, rawEquity) : rawEquity;
  const freeMargin = equity - usedMargin;
  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null;

  let status: AccountRisk["status"] = "safe";
  if (marginLevel != null) {
    if (marginLevel <= limits.stopOutLevel) status = "stop_out";
    else if (marginLevel <= limits.marginCallLevel) status = "margin_call";
    else if (marginLevel <= limits.marginCallLevel * 1.25) status = "warning";
  }

  return { balance, equity, floatingPnl, usedMargin, freeMargin, marginLevel, positions, status };
}

/** Order positions worst-loss-first for stop-out. */
export function sortForStopOut(positions: PositionRisk[]): PositionRisk[] {
  return [...positions].sort((a, b) => a.floatingPnl - b.floatingPnl);
}

/** Format margin level as "1234%" / "—". */
export function formatMarginLevel(level: number | null): string {
  if (level == null) return "—";
  if (!Number.isFinite(level)) return "∞";
  return `${level.toFixed(level > 999 ? 0 : level > 99 ? 1 : 2)}%`;
}

export function accountRiskLimits(account: {
  margin_call_level?: number | string | null;
  stop_out_level?: number | string | null;
  negative_balance_protection?: boolean | null;
}): RiskLimits {
  return {
    marginCallLevel: Number(account.margin_call_level ?? 100),
    stopOutLevel: Number(account.stop_out_level ?? 50),
    negativeBalanceProtection: account.negative_balance_protection ?? true,
  };
}
