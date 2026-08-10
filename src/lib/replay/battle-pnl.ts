/**
 * The bridge from an engine-executed replay fill to a `paper_trades` row.
 *
 * Battles read `paper_trades` for everything — rankings, the leaderboard,
 * settlement, `finalize_battle`. Replay fills are produced by the canonical
 * execution engine (`runObservation`) and land in `ClosedTrade` shape. This is
 * the one place those two models meet.
 *
 * ── Why the engine's P&L is used verbatim ──────────────────────────────────
 *
 * There are two P&L implementations in this codebase (BA-10):
 *
 *   engine   (exit − fill) × sign × quantity          → quote currency
 *   paper    ((exit − entry) / pipSize) × pipValuePerLot × lot → USD
 *
 * Re-deriving an engine fill through the paper formula would produce a second
 * number that could disagree with the blotter the trader watched it happen on.
 * So the engine's number is written straight through — and the risk that
 * creates is contained by only ever allowing symbols where the two formulas
 * provably agree. See `isEnginePricedSymbol`.
 */

import { findSymbol, type SymbolMeta } from "@/lib/paper-trading/symbols";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";

/**
 * May a replay battle price fills on this symbol with the engine formula?
 *
 * The paper formula reduces to
 * `(exit − entry) × sign × (pipValuePerLot / pipSize) × lot`, so it is
 * identical to the engine's `(exit − fill) × sign × quantity` exactly when
 *
 *     pipValuePerLot / pipSize === contractSize
 *
 * which holds precisely when no currency conversion is involved — i.e. when the
 * instrument is quoted in the account currency.
 *
 * ── What this does NOT protect against ─────────────────────────────────────
 *
 * **Quantity units.** The identity above is about CURRENCY. It says nothing
 * about whether `quantity` is expressed in lots or in units, and the two
 * formulas only agree when it is in UNITS — `paper = move × contractSize × lot`
 * versus `engine = move × quantity`.
 *
 * Passing lots where units are expected therefore understates P&L by exactly
 * `contractSize` while this guard reports the symbol as perfectly safe. It was
 * measured at 100,000× on EUR/USD: an engine fill of $0.0218 against a true
 * $2,178.20, with `lot_size` reading an unremarkable `1`. See BA-9.
 *
 * Crypto hides it completely (`contractSize` is 1 for every USDT pair), so
 * a passing crypto battle is not evidence that the conversion is right.
 * `battleTradeRowFrom` below now converts back explicitly; if you add another
 * caller that builds orders, it must convert lots → units on the way in.
 *
 * Two independent defects live on this one identity. Do not read a `true` here
 * as meaning "this symbol's P&L is correct" — only "no currency conversion is
 * required".
 *
 * Deriving the rule from the symbol's own metadata rather than hardcoding a
 * list means it stays correct as symbols are added: a new USD-quoted instrument
 * is admitted automatically, a new cross pair refused automatically.
 *
 * Today this admits all crypto, USD-quoted forex, indices and metals, and
 * refuses USD/JPY, GBP/JPY, EUR/JPY, USD/CAD, USD/CHF and EUR/GBP — the six
 * pairs whose `pipValuePerLot` carries a stale FX rate (BA-8).
 */
export function isEnginePricedSymbol(symbol: string): boolean {
  const meta = findSymbol(symbol);
  return !!meta && metaAgrees(meta);
}

function metaAgrees(meta: SymbolMeta): boolean {
  if (!meta.pipSize || !meta.contractSize) return false;
  const ratio = meta.pipValuePerLot / meta.pipSize;
  // Floating-point tolerance relative to the contract size: pipSize values like
  // 0.0001 do not divide exactly.
  return Math.abs(ratio - meta.contractSize) / meta.contractSize < 1e-9;
}

/** Human-readable refusal, for surfacing at battle creation. */
export function enginePricingRefusal(symbol: string): string | null {
  const meta = findSymbol(symbol);
  if (!meta) return `Unknown symbol "${symbol}".`;
  if (metaAgrees(meta)) return null;
  return (
    `${symbol} is not quoted in the account currency, so a replay battle would ` +
    `record its P&L in ${symbol.split("/")[1] ?? "the quote currency"} rather ` +
    `than USD. Replay battles are limited to USD-quoted symbols until a ` +
    `currency conversion layer exists — see BA-10.`
  );
}

export interface BattleTradeRow {
  user_id: string;
  account_id: string;
  battle_id: string;
  symbol: string;
  market: string;
  direction: "long" | "short";
  order_type: "market" | "limit" | "stop" | "stop_limit";
  status: "closed";
  lot_size: number;
  entry_price: number;
  exit_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  risk_amount: number | null;
  pnl: number;
  rr_realized: number;
  commission: number;
  close_reason: string | null;
  /** Market time — the candle. NOT battle wall-clock; see docs/battle-replay.md. */
  opened_at: string;
  closed_at: string;
  /** Exact observation the fill landed on, for audit and step 5 validation. */
  observation_cursor: number | null;
}

/**
 * Map one engine `ClosedTrade` onto a `paper_trades` row.
 *
 * `pnl` and `rr_realized` are taken from the engine, not recomputed. The
 * caller must have checked `isEnginePricedSymbol` first — this function cannot
 * meaningfully validate it, because a wrong answer here is a silently plausible
 * number rather than an error.
 *
 * `quantity` is in UNITS — that is what makes the engine's `move × quantity`
 * agree with the paper formula — while `paper_trades.lot_size` means LOTS.
 * The conversion is done here rather than left implicit, because the two
 * coincide for crypto (`contractSize` 1) and diverge by 100,000 for forex, so
 * an implicit version tests clean and ships wrong. See BA-9.
 *
 * `opened_at` / `closed_at` carry MARKET time, so the trade sits on the right
 * candle in any later review. Battle-window enforcement uses `created_at`
 * instead, which the database defaults to now() — see the
 * `enforce_battle_rules_on_trade` trigger.
 */
export function battleTradeRowFrom(
  trade: ClosedTrade,
  ctx: {
    userId: string;
    accountId: string;
    battleId: string;
    market: string;
    observationCursor: number | null;
  },
): BattleTradeRow {
  const contractSize = findSymbol(trade.symbol)?.contractSize || 1;
  return {
    user_id: ctx.userId,
    account_id: ctx.accountId,
    battle_id: ctx.battleId,
    symbol: trade.symbol,
    market: ctx.market,
    // The engine speaks buy/sell; paper_trades speaks long/short.
    direction: trade.direction === "buy" ? "long" : "short",
    order_type: normalizeOrderType(trade.orderType),
    status: "closed",
    lot_size: (trade.quantity ?? 0) / contractSize,
    entry_price: trade.fillPrice,
    exit_price: trade.exitPrice,
    stop_loss: trade.initialStop ?? null,
    take_profit: trade.initialTarget ?? null,
    risk_amount: trade.riskAmount ?? null,
    pnl: trade.netPnl,
    rr_realized: trade.realizedR ?? 0,
    commission: trade.fees ?? 0,
    close_reason: trade.closeReason ?? null,
    opened_at: new Date(trade.entryTime).toISOString(),
    closed_at: new Date(trade.exitTime).toISOString(),
    observation_cursor: ctx.observationCursor,
  };
}

function normalizeOrderType(kind: string | null | undefined): BattleTradeRow["order_type"] {
  switch (kind) {
    case "limit":
    case "stop":
    case "stop_limit":
      return kind;
    default:
      return "market";
  }
}
