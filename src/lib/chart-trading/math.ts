import { tradeCalculation, type TradeCalc, formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import type { ChartDraft } from "./types";

/**
 * Compute risk/reward metrics for a draft or a hypothetical trade.
 * Pure function — safe to call every drag tick.
 */
export function computeChartMetrics(params: {
  sym: SymbolMeta;
  side: ChartDraft["side"];
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
  leverage: number;
  balance: number;
  /** Estimated per-lot commission (round-trip) in account currency. */
  commissionPerLot?: number;
  /** Estimated spread in pips for the symbol. */
  spreadPips?: number;
}): TradeCalc & {
  commission: number;
  spreadCost: number;
  potentialProfit: number;
  potentialLoss: number;
} {
  const base = tradeCalculation(params);
  const commission = (params.commissionPerLot ?? 0) * params.lot;
  const spreadCost = (params.spreadPips ?? 0) * params.sym.pipValuePerLot * params.lot;
  const potentialProfit = Math.max(0, base.rewardAmount - commission - spreadCost);
  const potentialLoss = base.riskAmount + commission + spreadCost;
  return { ...base, commission, spreadCost, potentialProfit, potentialLoss };
}

export { formatCurrency, formatNumber };
