/**
 * Prop Firm Challenge presets — matches the public rules published by the
 * major evaluation firms as of 2026. Numbers are intentionally conservative;
 * `custom` lets users override everything.
 */

export type PropPresetId =
  | "ftmo"
  | "apex"
  | "topstep"
  | "fivepercenters"
  | "fundednext"
  | "myfundedfx"
  | "custom";

export type PropPreset = {
  id: PropPresetId;
  label: string;
  blurb: string;
  account_size: number;
  currency: string;
  profit_target_pct: number;
  max_daily_loss_pct: number;
  max_total_drawdown_pct: number;
  min_trading_days: number;
  leverage: number;
  duration_days: number;
  commission_per_lot: number;
  spread_profile: "tight" | "standard" | "wide";
  slippage_profile: "none" | "standard" | "aggressive";
  weekend_hold_allowed: boolean;
  news_trading_allowed: boolean;
};

export const PROP_PRESETS: Record<PropPresetId, PropPreset> = {
  ftmo: {
    id: "ftmo", label: "FTMO Challenge",
    blurb: "$100k · 10% profit target · 5% daily / 10% max drawdown",
    account_size: 100_000, currency: "USD",
    profit_target_pct: 10, max_daily_loss_pct: 5, max_total_drawdown_pct: 10,
    min_trading_days: 4, leverage: 100, duration_days: 30,
    commission_per_lot: 6, spread_profile: "standard", slippage_profile: "standard",
    weekend_hold_allowed: false, news_trading_allowed: true,
  },
  apex: {
    id: "apex", label: "Apex Trader Funding",
    blurb: "$50k futures eval · trailing $2.5k drawdown · 30% profit target",
    account_size: 50_000, currency: "USD",
    profit_target_pct: 6, max_daily_loss_pct: 3, max_total_drawdown_pct: 5,
    min_trading_days: 1, leverage: 30, duration_days: 60,
    commission_per_lot: 4, spread_profile: "tight", slippage_profile: "standard",
    weekend_hold_allowed: false, news_trading_allowed: false,
  },
  topstep: {
    id: "topstep", label: "Topstep Combine",
    blurb: "$50k · $3k profit target · $2k daily / $2k max drawdown",
    account_size: 50_000, currency: "USD",
    profit_target_pct: 6, max_daily_loss_pct: 4, max_total_drawdown_pct: 4,
    min_trading_days: 5, leverage: 20, duration_days: 30,
    commission_per_lot: 4.5, spread_profile: "tight", slippage_profile: "standard",
    weekend_hold_allowed: false, news_trading_allowed: true,
  },
  fivepercenters: {
    id: "fivepercenters", label: "The 5%ers Bootcamp",
    blurb: "$100k · 6% profit target · 4% max drawdown · unlimited days",
    account_size: 100_000, currency: "USD",
    profit_target_pct: 6, max_daily_loss_pct: 5, max_total_drawdown_pct: 4,
    min_trading_days: 3, leverage: 30, duration_days: 60,
    commission_per_lot: 5, spread_profile: "standard", slippage_profile: "standard",
    weekend_hold_allowed: true, news_trading_allowed: true,
  },
  fundednext: {
    id: "fundednext", label: "FundedNext Stellar",
    blurb: "$100k · 8% target · 5% daily / 10% max drawdown",
    account_size: 100_000, currency: "USD",
    profit_target_pct: 8, max_daily_loss_pct: 5, max_total_drawdown_pct: 10,
    min_trading_days: 5, leverage: 100, duration_days: 30,
    commission_per_lot: 7, spread_profile: "standard", slippage_profile: "standard",
    weekend_hold_allowed: true, news_trading_allowed: true,
  },
  myfundedfx: {
    id: "myfundedfx", label: "MyFundedFX Evaluation",
    blurb: "$100k · 8% target · 5% daily / 12% max drawdown",
    account_size: 100_000, currency: "USD",
    profit_target_pct: 8, max_daily_loss_pct: 5, max_total_drawdown_pct: 12,
    min_trading_days: 3, leverage: 100, duration_days: 30,
    commission_per_lot: 6, spread_profile: "standard", slippage_profile: "standard",
    weekend_hold_allowed: true, news_trading_allowed: true,
  },
  custom: {
    id: "custom", label: "Custom Challenge",
    blurb: "Design your own evaluation from scratch.",
    account_size: 100_000, currency: "USD",
    profit_target_pct: 8, max_daily_loss_pct: 5, max_total_drawdown_pct: 10,
    min_trading_days: 5, leverage: 100, duration_days: 30,
    commission_per_lot: 0, spread_profile: "standard", slippage_profile: "standard",
    weekend_hold_allowed: true, news_trading_allowed: true,
  },
};

export function listPropPresets(): PropPreset[] {
  return Object.values(PROP_PRESETS);
}
