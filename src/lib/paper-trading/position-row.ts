/**
 * Everything the open-positions table derives from a trade and its live quote.
 *
 * Pure and separate from the table so the arithmetic can be tested directly.
 * It is the kind that fails silently: a margin computed at the wrong leverage,
 * or a P&L percentage taken against notional instead of margin, produces a
 * plausible number on a row that nobody double-checks against a broker.
 */
import { findSymbol, type SymbolMeta } from "./symbols";
import { pnl as computePnl, marginRequired, notionalValue } from "./calculations";

export type Trade = {
  id: string; symbol: string; direction: "long" | "short"; entry_price: number;
  lot_size: number; stop_loss: number | null; take_profit: number | null;
  opened_at: string; commission: number; swap: number; account_id: string; notes: string | null;
};

/**
 * A trade plus its derived figures.
 *
 * Every derived field is `null` when the input for it is missing, never a
 * substituted number: an unquoted position has an unknown result, and a 0 there
 * reads as a real break-even.
 */
export type PositionRow = {
  t: Trade;
  sym: SymbolMeta | undefined;
  current: number | null;
  floating: number | null;
  rr: number | null;
  /** Unrealized P&L as a percentage of the margin committed. */
  pnlPct: number | null;
  /** Notional at entry — what the position cost to put on. */
  tradeValue: number | null;
  /** Notional at the live price — what it is worth now. */
  marketValue: number | null;
  /** Effective gearing: notional ÷ margin. */
  leverage: number | null;
  margin: number | null;
};

export function derivePositionRow(
  t: Trade,
  opts: { current: number | null; accountLeverage: number },
): PositionRow {
  const sym = findSymbol(t.symbol);
  const { current, accountLeverage } = opts;
  const lot = Number(t.lot_size);
  const entry = Number(t.entry_price);

  const floating = sym && current != null
    ? computePnl(sym, t.direction, entry, current, lot)
    : null;

  const risk = sym && t.stop_loss
    ? Math.abs(computePnl(sym, t.direction, entry, Number(t.stop_loss), lot))
    : 0;
  // `null` means "no stop, so R is not measurable" — distinct from a real
  // 0.00R at break-even, which a truthiness test collapses into the same dash.
  const rr = risk > 0 && floating != null ? floating / risk : null;

  // Margin is struck at ENTRY and does not move with the market; that is why
  // `pnlPct` divides by it rather than by market value, and why `tradeValue`
  // (not `marketValue`) is the numerator of effective leverage.
  const tradeValue = sym ? notionalValue(sym, lot, entry) : null;
  const marketValue = sym && current != null ? notionalValue(sym, lot, current) : null;
  const margin = sym && accountLeverage > 0
    ? marginRequired(sym, lot, entry, accountLeverage)
    : null;

  const pnlPct = floating != null && margin != null && margin > 0
    ? (floating / margin) * 100
    : null;
  const leverage = tradeValue != null && margin != null && margin > 0
    ? tradeValue / margin
    : null;

  return { t, sym, current, floating, rr, pnlPct, tradeValue, marketValue, leverage, margin };
}
