/**
 * Order validation — pure. Callers pass current account + open positions
 * and get a full report back. Same code runs client-side (pre-flight UX)
 * and inside the engine on submit.
 */

import { findSymbol } from "@/lib/paper-trading/symbols";
import { notionalValue, marginRequired, pnl as computePnl } from "@/lib/paper-trading/calculations";
import { HARD_RISK_CAP_PCT, MAX_OPEN_POSITIONS, liquidationPrice as liqPx } from "@/lib/paper-trading/risk";
import type {
  AccountConfig, AccountSnapshot, OrderIntent, ValidationResult,
} from "./types";
import { effectiveLeverage } from "./leverage";
import { COST_PROFILES, computeFill } from "./costs";

export function validateIntent(
  config: AccountConfig,
  snapshot: AccountSnapshot,
  intent: OrderIntent,
  currentPrice: number,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const meta = findSymbol(intent.symbol);
  const fallback: ValidationResult = {
    ok: false, errors, warnings,
    required_margin: 0, free_margin_after: 0, risk_amount: 0,
    risk_pct: 0, liquidation_price: null, buying_power_after: 0,
    fill_price: 0, cost_estimate: 0,
  };
  if (!meta) { errors.push(`Unknown symbol ${intent.symbol}`); return fallback; }
  if (!(currentPrice > 0)) { errors.push("No live price for symbol"); return fallback; }

  // Numeric sanity for every user-supplied level.
  for (const [label, v] of [
    ["Quantity", intent.quantity],
    ["Stop loss", intent.stop_loss],
    ["Take profit", intent.take_profit],
    ["Limit price", intent.limit_price],
    ["Stop price", intent.stop_price],
  ] as [string, number | null | undefined][]) {
    if (v == null) continue;
    if (!Number.isFinite(v)) errors.push(`${label} must be a finite number`);
    else if (v <= 0) errors.push(`${label} must be a positive number`);
    else if (v > 1e12) errors.push(`${label} is out of range`);
  }
  if (errors.length > 0) return { ...fallback, errors };

  const qty = Number(intent.quantity);
  if (!(qty > 0)) errors.push("Quantity must be positive");
  if (qty < meta.minLot) errors.push(`Minimum lot for ${meta.symbol} is ${meta.minLot}`);
  if (qty > meta.maxLot) errors.push(`Maximum lot for ${meta.symbol} is ${meta.maxLot}`);

  // Determine intended reference price (limit/stop use their own trigger).
  const referencePrice =
    intent.kind === "limit" && intent.limit_price ? intent.limit_price :
    intent.kind === "stop"  && intent.stop_price  ? intent.stop_price  :
    intent.kind === "stop_limit" && intent.limit_price ? intent.limit_price :
    currentPrice;

  // Fill price uses cost profile spread/slippage.
  const profile = COST_PROFILES[config.cost_profile] ?? COST_PROFILES.zero;
  const fill = computeFill(profile, meta, intent.side, referencePrice, qty, () => 0.5);

  // Leverage/margin scoped by asset-class profile.
  const lev = effectiveLeverage(config.leverage, config.leverage_profile, meta.market);
  const required = marginRequired(meta, qty, fill.price, lev);
  const notional = notionalValue(meta, qty, fill.price);
  const freeAfter = snapshot.free_margin - required;
  const buyingPowerAfter = Math.max(0, snapshot.buying_power - notional);

  // Position count cap.
  if (snapshot.positions.length >= (config.max_open_positions || MAX_OPEN_POSITIONS)) {
    errors.push(`Maximum ${config.max_open_positions || MAX_OPEN_POSITIONS} open positions`);
  }

  // Margin gate.
  if (required > snapshot.free_margin + 1e-6) {
    errors.push(
      `Insufficient margin — need ${required.toFixed(2)} ${config.currency}, `
      + `free ${Math.max(0, snapshot.free_margin).toFixed(2)}`,
    );
  }

  // Stop-loss orientation.
  if (intent.stop_loss != null) {
    if (intent.side === "long" && intent.stop_loss >= fill.price)
      errors.push("Stop loss must be below entry for a long");
    if (intent.side === "short" && intent.stop_loss <= fill.price)
      errors.push("Stop loss must be above entry for a short");
  }
  if (intent.take_profit != null) {
    if (intent.side === "long" && intent.take_profit <= fill.price)
      errors.push("Take profit must be above entry for a long");
    if (intent.side === "short" && intent.take_profit >= fill.price)
      errors.push("Take profit must be below entry for a short");
  }

  // Risk sizing (from stop_loss or explicit risk_amount).
  let riskAmount = Number(intent.risk_amount ?? 0);
  if (!riskAmount && intent.stop_loss != null) {
    riskAmount = Math.abs(computePnl(meta, intent.side, fill.price, intent.stop_loss, qty));
  }
  const equityForRisk = Math.max(snapshot.equity, 1);
  const riskPct = (riskAmount / equityForRisk) * 100;

  if (riskAmount > 0) {
    if (riskPct > HARD_RISK_CAP_PCT) {
      errors.push(`Risk ${riskPct.toFixed(1)}% exceeds absolute cap of ${HARD_RISK_CAP_PCT}%`);
    } else if (config.max_trade_risk_pct > 0 && riskPct > config.max_trade_risk_pct) {
      warnings.push(`Risk ${riskPct.toFixed(2)}% exceeds your per-trade limit of ${config.max_trade_risk_pct}%`);
    }
  } else if (!intent.stop_loss) {
    warnings.push("No stop loss set — undefined downside");
  }

  if (lev >= 100) warnings.push(`Very high effective leverage (${lev}×)`);
  if (snapshot.margin_level != null && snapshot.margin_level < 200) {
    warnings.push(`Margin level ${snapshot.margin_level.toFixed(0)}% — approaching stop-out`);
  }

  // Liquidation price estimate.
  const liq = liqPx(fill.price, intent.side, lev);

  return {
    ok: errors.length === 0,
    errors, warnings,
    required_margin: required,
    free_margin_after: freeAfter,
    risk_amount: riskAmount,
    risk_pct: riskPct,
    liquidation_price: liq,
    buying_power_after: buyingPowerAfter,
    fill_price: fill.price,
    cost_estimate: fill.commission,
  };
}
