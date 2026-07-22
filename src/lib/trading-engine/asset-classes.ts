/**
 * Asset-class defaults — Phase 2.
 *
 * Independent defaults per asset class. Broker profiles compose these
 * defaults with their own overrides, but the engine and validation layers
 * fall back here when a broker profile omits a value.
 */

import type { AssetClass } from "./instruments";

export type ExecutionModel = "market_maker" | "ecn" | "stp" | "dma" | "synthetic";
export type LiquidationRule = "isolated" | "cross" | "auto_deleverage" | "insurance_fund";

export type AssetClassDefaults = {
  leverage: number;
  marginCallPct: number;
  stopOutPct: number;
  spreadPips: number;
  commissionPerLot: number;
  swapLongPips: number;
  swapShortPips: number;
  execution: ExecutionModel;
  liquidation: LiquidationRule;
  maintenanceMarginRatio: number;
};

export const ASSET_CLASS_DEFAULTS: Record<AssetClass, AssetClassDefaults> = {
  forex: {
    leverage: 30, marginCallPct: 100, stopOutPct: 50,
    spreadPips: 1.0, commissionPerLot: 0, swapLongPips: -0.3, swapShortPips: -0.2,
    execution: "stp", liquidation: "cross", maintenanceMarginRatio: 0.005,
  },
  metals: {
    leverage: 20, marginCallPct: 100, stopOutPct: 50,
    spreadPips: 2.5, commissionPerLot: 0, swapLongPips: -0.4, swapShortPips: -0.4,
    execution: "stp", liquidation: "cross", maintenanceMarginRatio: 0.01,
  },
  indices: {
    leverage: 20, marginCallPct: 100, stopOutPct: 50,
    spreadPips: 1.5, commissionPerLot: 0, swapLongPips: -0.3, swapShortPips: -0.3,
    execution: "market_maker", liquidation: "cross", maintenanceMarginRatio: 0.01,
  },
  crypto: {
    leverage: 5, marginCallPct: 110, stopOutPct: 80,
    spreadPips: 3.0, commissionPerLot: 0, swapLongPips: 0, swapShortPips: 0,
    execution: "ecn", liquidation: "isolated", maintenanceMarginRatio: 0.05,
  },
  stocks: {
    leverage: 5, marginCallPct: 100, stopOutPct: 30,
    spreadPips: 2.0, commissionPerLot: 5, swapLongPips: -0.5, swapShortPips: -0.5,
    execution: "dma", liquidation: "cross", maintenanceMarginRatio: 0.25,
  },
  futures: {
    leverage: 50, marginCallPct: 100, stopOutPct: 50,
    spreadPips: 1.0, commissionPerLot: 4, swapLongPips: 0, swapShortPips: 0,
    execution: "dma", liquidation: "cross", maintenanceMarginRatio: 0.01,
  },
  options: {
    leverage: 1, marginCallPct: 100, stopOutPct: 0,
    spreadPips: 1.0, commissionPerLot: 1, swapLongPips: 0, swapShortPips: 0,
    execution: "dma", liquidation: "cross", maintenanceMarginRatio: 1.0,
  },
};

export function assetClassDefaults(cls: AssetClass): AssetClassDefaults {
  return ASSET_CLASS_DEFAULTS[cls];
}
