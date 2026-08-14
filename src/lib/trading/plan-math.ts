/**
 * Shared price/RR math for the on-chart trade planner and live position
 * overlays. Wraps the existing paper-trading calculations so the chart
 * layer, order panel, and risk dashboard all agree on numbers.
 */
import { priceDecimals, type SymbolMeta } from "@/lib/paper-trading/symbols";
import {
  pipsBetween,
  pnl as computePnl,
  lotForRisk,
  tradeCalculation,
  type TradeSide,
} from "@/lib/paper-trading/calculations";

export type PlanInputs = {
  sym: SymbolMeta;
  side: TradeSide;
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
  balance: number;
  leverage: number;
};

export type PlanResult = {
  pipsRisk: number;
  pipsReward: number;
  pointsRisk: number;
  pointsReward: number;
  riskAmount: number;
  rewardAmount: number;
  rr: number;
  riskPct: number;
  lot: number;
  notional: number;
  margin: number;
  units: number;
  suggestedLotForRiskPct: (pct: number) => number;
};

/** Convert price delta into "points" (raw price units) — different from pips. */
export function pointsBetween(a: number, b: number): number {
  return Math.abs(a - b);
}

export function computePlan(inp: PlanInputs): PlanResult {
  const calc = tradeCalculation({
    sym: inp.sym,
    side: inp.side,
    entry: inp.entry,
    sl: inp.sl,
    tp: inp.tp,
    lot: inp.lot,
    leverage: inp.leverage,
    balance: inp.balance,
  });
  const pipsRisk = inp.sl != null ? pipsBetween(inp.sym, inp.entry, inp.sl) : 0;
  const pipsReward = inp.tp != null ? pipsBetween(inp.sym, inp.entry, inp.tp) : 0;
  return {
    pipsRisk,
    pipsReward,
    pointsRisk: inp.sl != null ? pointsBetween(inp.entry, inp.sl) : 0,
    pointsReward: inp.tp != null ? pointsBetween(inp.entry, inp.tp) : 0,
    riskAmount: calc.riskAmount,
    rewardAmount: calc.rewardAmount,
    rr: calc.rr,
    riskPct: calc.riskPct,
    lot: inp.lot,
    notional: calc.notional,
    margin: calc.margin,
    units: inp.sym.contractSize * inp.lot,
    suggestedLotForRiskPct: (pct: number) => {
      if (inp.sl == null || inp.balance <= 0) return inp.lot;
      const amt = (inp.balance * pct) / 100;
      return lotForRisk(inp.sym, inp.entry, inp.sl, amt);
    },
  };
}

/** Live floating PnL for an open position at a current price. */
export function floatingPnl(
  sym: SymbolMeta,
  side: TradeSide,
  entry: number,
  current: number,
  lot: number,
): number {
  return computePnl(sym, side, entry, current, lot);
}

/**
 * Format a price at symbol precision, WITHOUT thousand separators.
 *
 * This is the chart-side formatter: axis labels, on-chart pills and order
 * lines read better ungrouped and have to line up with the axis. Use
 * `formatPrice` from `paper-trading/calculations` for tables and panels, where
 * grouping helps.
 *
 * Accepts a bare symbol string as well as resolved metadata, so callers that
 * only have the ticker are not pushed back onto a hardcoded decimal count —
 * which is how the chart overlays ended up at a flat `toFixed(4)`, showing
 * EUR/USD a digit short of the fractional pip.
 */
export function fmtPrice(
  sym: SymbolMeta | string | null | undefined,
  price: number,
): string {
  if (!Number.isFinite(price)) return "—";
  return price.toFixed(priceDecimals(sym));
}
