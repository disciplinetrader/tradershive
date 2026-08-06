/**
 * Account risk / margin math shared by every risk-aware surface
 * (AccountSummary, TodayPnL, Trading Workspace risk banner, server
 * order-validation, server stop-out job).
 *
 * Broker semantics:
 *   equity        = balance + Σ floating P/L
 *   used margin   = Σ (notional / leverage) per open position
 *   free margin   = equity − used margin
 *   margin level  = (equity / used margin) × 100     [% — undefined when no margin used]
 *   buying power  = free margin × leverage
 *
 * Thresholds are stored per account (`margin_call_level`, `stop_out_level`,
 * `negative_balance_protection`) so battles, championships and demo
 * accounts can each tune broker/prop-firm-style rules independently.
 *
 * Accounting invariant enforced platform-wide:
 *   • openTrade rejects orders that require more margin than free_margin
 *   • closeTrade caps realized loss at the current balance when NBP is on,
 *     so `balance` can never go negative and `net_pnl` cannot drift away
 *     from the actual cash sitting in the account.
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
  /** `equity × leverage − Σ notional` = additional notional the account can still open. */
  buyingPower: number;
  /** `used / equity` ratio, 0..1+; useful for Binance-style Margin Ratio %. */
  marginRatio: number;
  positions: PositionRisk[];
  status: "safe" | "warning" | "margin_call" | "stop_out";
};

export type RiskLimits = {
  marginCallLevel: number;
  stopOutLevel: number;
  negativeBalanceProtection: boolean;
};

/** Absolute per-trade risk cap the server will hard-reject regardless of user overrides. */
export const HARD_RISK_CAP_PCT = 25;
/** Absolute cap on concurrent open positions per account. */
export const MAX_OPEN_POSITIONS = 50;
/** Maintenance-margin ratio used for crypto/futures liquidation estimate. */
export const DEFAULT_MMR = 0.005;

/**
 * Build a per-position and account-level risk snapshot.
 *
 * IMPORTANT: when `getPrice(symbol)` returns null/undefined we fall back to
 * the trade's own **entry price** — not the symbol's static `refPrice` seed.
 * Using `refPrice` (an arbitrary catalog value) against a real entry invents
 * a phantom delta and can materialise millions in phantom "floating P/L".
 * Falling back to entry means "no live tick yet → 0 unrealised P/L", which
 * matches broker behaviour.
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
  let totalNotional = 0;
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
    totalNotional += notional;
    positions.push({ trade: t, sym, currentPrice, floatingPnl: pnl, notional, margin });
  }

  const rawEquity = balance + floatingPnl;
  const equity = limits.negativeBalanceProtection ? Math.max(0, rawEquity) : rawEquity;
  const freeMargin = equity - usedMargin;
  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null;
  const buyingPower = Math.max(0, equity * leverage - totalNotional);
  const marginRatio = equity > 0 ? usedMargin / equity : (usedMargin > 0 ? Infinity : 0);

  let status: AccountRisk["status"] = "safe";
  if (marginLevel != null) {
    if (marginLevel <= limits.stopOutLevel) status = "stop_out";
    else if (marginLevel <= limits.marginCallLevel) status = "margin_call";
    else if (marginLevel <= limits.marginCallLevel * 1.25) status = "warning";
  }

  return {
    balance, equity, floatingPnl, usedMargin, freeMargin, marginLevel,
    buyingPower, marginRatio, positions, status,
  };
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

/** Format margin ratio (used / equity) as a Binance-style percent, capped display. */
export function formatMarginRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "∞";
  const pct = Math.max(0, ratio) * 100;
  if (pct >= 999) return "≥999%";
  return `${pct.toFixed(pct >= 100 ? 0 : pct >= 10 ? 1 : 2)}%`;
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

/* ============================================================
 *  Broker-style helpers
 * ============================================================ */

/**
 * Estimated liquidation price for a leveraged position (crypto / futures / forex).
 * Uses a simplified isolated-margin model:
 *   long:  liq = entry × (1 − 1/leverage + mmr)
 *   short: liq = entry × (1 + 1/leverage − mmr)
 * Returns null for spot / 1× / cash-margin instruments.
 */
export function liquidationPrice(
  entry: number,
  direction: "long" | "short",
  leverage: number,
  mmr = DEFAULT_MMR,
): number | null {
  if (!(entry > 0) || !(leverage > 1)) return null;
  const buffer = 1 / leverage - mmr;
  const px = direction === "long" ? entry * (1 - buffer) : entry * (1 + buffer);
  return Math.max(0, px);
}

/** Notional buying power the account still has at its configured leverage. */
export function buyingPowerRemaining(equity: number, usedNotional: number, leverage: number): number {
  return Math.max(0, equity * leverage - usedNotional);
}

/* ============================================================
 *  Server-side order validation
 * ============================================================ */

export type NewOrderInput = {
  symbol: string;
  direction: "long" | "short";
  entry_price: number;
  lot_size: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  risk_amount?: number | null;
};

export type OrderValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  required_margin: number;
  free_margin_after: number;
  risk_pct: number;
  liq_price: number | null;
  buying_power_after: number;
};

/**
 * Pure validation used by both client (pre-flight UX) and server (hard gate
 * inside `openTrade`). Callers pass the currently-open trades so the check
 * accounts for used margin across the whole account.
 */
export function validateNewOrder(
  account: {
    balance: number | string;
    equity?: number | string;
    leverage: number;
    currency?: string;
    max_trade_risk_pct?: number | string | null;
    margin_call_level?: number | string | null;
    stop_out_level?: number | string | null;
    negative_balance_protection?: boolean | null;
  },
  openTrades: OpenTradeInput[],
  order: NewOrderInput,
  getPrice: QuoteLookup = () => null,
): OrderValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sym = findSymbol(order.symbol);
  if (!sym) {
    return {
      ok: false, errors: [`Unknown symbol ${order.symbol}`], warnings: [],
      required_margin: 0, free_margin_after: 0, risk_pct: 0, liq_price: null, buying_power_after: 0,
    };
  }
  // Numeric sanity — reject non-finite / negative / overflowing inputs before
  // any risk maths runs, so the panel shows an inline error immediately.
  const numeric: [string, number | null | undefined][] = [
    ["Entry price", order.entry_price],
    ["Lot size", order.lot_size],
    ["Stop loss", order.stop_loss],
    ["Take profit", order.take_profit],
  ];
  for (const [label, v] of numeric) {
    if (v == null) continue;
    if (!Number.isFinite(v)) errors.push(`${label} must be a finite number`);
    else if (v <= 0) errors.push(`${label} must be a positive number`);
    else if (v > 1e12) errors.push(`${label} is out of range`);
  }
  if (!(order.entry_price > 0)) errors.push("Entry price must be positive");
  if (!(order.lot_size > 0)) errors.push("Lot size must be positive");
  if (errors.length > 0) {
    return {
      ok: false, errors, warnings: [],
      required_margin: 0, free_margin_after: 0, risk_pct: 0, liq_price: null, buying_power_after: 0,
    };
  }
  // Directional sanity for protective levels.
  const stopsMsg = validateStops(order.direction, order.entry_price, order.stop_loss ?? null, order.take_profit ?? null);
  if (stopsMsg) errors.push(stopsMsg);
  if (order.lot_size < sym.minLot) errors.push(`Minimum lot for ${sym.symbol} is ${sym.minLot}`);
  if (order.lot_size > sym.maxLot) errors.push(`Maximum lot for ${sym.symbol} is ${sym.maxLot}`);

  const leverage = Number(account.leverage) || 1;
  const risk = computeAccountRisk(account, openTrades, getPrice, accountRiskLimits(account as any));
  const requiredMargin = marginRequired(sym, order.lot_size, order.entry_price, leverage);
  const freeAfter = risk.freeMargin - requiredMargin;
  const notional = notionalValue(sym, order.lot_size, order.entry_price);
  const buyingPowerAfter = Math.max(0, risk.buyingPower - notional);

  if (openTrades.length >= MAX_OPEN_POSITIONS) {
    errors.push(`Maximum ${MAX_OPEN_POSITIONS} open positions per account`);
  }
  if (requiredMargin > risk.freeMargin + 1e-6) {
    errors.push(
      `Insufficient margin — need ${requiredMargin.toFixed(2)} ${account.currency ?? ""}, `
      + `free ${Math.max(0, risk.freeMargin).toFixed(2)}`,
    );
  }

  // Risk %
  let riskAmount = Number(order.risk_amount ?? 0);
  if (!riskAmount && order.stop_loss != null) {
    riskAmount = Math.abs(computePnl(sym, order.direction, order.entry_price, order.stop_loss, order.lot_size));
  }
  const equityForRisk = Math.max(risk.equity, 1);
  const riskPct = (riskAmount / equityForRisk) * 100;
  const userCap = Number(account.max_trade_risk_pct ?? 0);
  if (riskAmount > 0) {
    if (riskPct > HARD_RISK_CAP_PCT) {
      errors.push(`Risk ${riskPct.toFixed(1)}% exceeds absolute cap of ${HARD_RISK_CAP_PCT}%`);
    } else if (userCap > 0 && riskPct > userCap) {
      warnings.push(`Risk ${riskPct.toFixed(2)}% exceeds your per-trade limit of ${userCap}%`);
    }
  } else if (!order.stop_loss) {
    warnings.push("No stop loss set — undefined downside");
  }

  if (leverage >= 100) warnings.push(`Very high leverage (${leverage}×) — small moves can liquidate`);

  const liq = liquidationPrice(order.entry_price, order.direction, leverage);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    required_margin: requiredMargin,
    free_margin_after: freeAfter,
    risk_pct: riskPct,
    liq_price: liq,
    buying_power_after: buyingPowerAfter,
  };
}

/* ============================================================
 *  Presets
 * ============================================================ */

export type AccountPreset = {
  id: "prop" | "retail" | "crypto" | "futures";
  label: string;
  description: string;
  leverage: number;
  max_trade_risk_pct: number;
  max_daily_risk_pct: number;
  margin_call_level: number;
  stop_out_level: number;
  negative_balance_protection: boolean;
};

export const ACCOUNT_PRESETS: AccountPreset[] = [
  {
    id: "prop", label: "Prop Firm",
    description: "1% per trade, 5% daily loss, strict stop-out.",
    leverage: 100, max_trade_risk_pct: 1, max_daily_risk_pct: 5,
    margin_call_level: 100, stop_out_level: 50, negative_balance_protection: true,
  },
  {
    id: "retail", label: "Retail Forex",
    description: "2% per trade, 30:1 leverage, broker-style stop-out.",
    leverage: 30, max_trade_risk_pct: 2, max_daily_risk_pct: 6,
    margin_call_level: 100, stop_out_level: 50, negative_balance_protection: true,
  },
  {
    id: "crypto", label: "Crypto Futures",
    description: "Configurable leverage, isolated-style liquidation.",
    leverage: 20, max_trade_risk_pct: 3, max_daily_risk_pct: 10,
    margin_call_level: 100, stop_out_level: 50, negative_balance_protection: true,
  },
  {
    id: "futures", label: "Index Futures",
    description: "Higher tick value, 10:1 leverage.",
    leverage: 10, max_trade_risk_pct: 2, max_daily_risk_pct: 5,
    margin_call_level: 100, stop_out_level: 50, negative_balance_protection: true,
  },
];
