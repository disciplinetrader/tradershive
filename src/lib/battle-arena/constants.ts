export const BATTLE_TYPES = [
  { value: "1v1", label: "1 vs 1", max: 2 },
  { value: "2v2", label: "2 vs 2", max: 4 },
  { value: "ffa5", label: "5 Player FFA", max: 5 },
  { value: "ffa10", label: "10 Player FFA", max: 10 },
] as const;

export type BattleType = (typeof BATTLE_TYPES)[number]["value"];

export const MARKETS = [
  { value: "crypto", label: "Crypto", symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"] },
  { value: "forex", label: "Forex", symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"] },
  { value: "indices", label: "Indices", symbols: ["SPX500", "NAS100", "US30", "GER40", "UK100"] },
  { value: "metals", label: "Gold / Metals", symbols: ["XAU/USD", "XAG/USD"] },
  { value: "mixed", label: "Mixed", symbols: ["BTC/USDT", "ETH/USDT", "EUR/USD", "XAU/USD", "SPX500"] },
] as const;

export type BattleMarket = (typeof MARKETS)[number]["value"];

export const WIN_CONDITIONS = [
  { value: "highest_pnl", label: "Highest Net Profit" },
  { value: "highest_r", label: "Highest R-Multiple" },
  { value: "highest_winrate", label: "Highest Win Rate" },
  { value: "lowest_dd", label: "Lowest Drawdown" },
  { value: "first_to_5r", label: "First to +5R" },
  { value: "first_to_target", label: "First to Target Profit" },
  { value: "consistency", label: "Consistency Challenge" },
] as const;

export type WinCondition = (typeof WIN_CONDITIONS)[number]["value"];

export type BattleStatus = "draft" | "upcoming" | "live" | "completed" | "cancelled";
export type BattleVisibility = "public" | "private";

export const STATUS_STYLES: Record<BattleStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-muted text-muted-foreground border border-border" },
  upcoming:  { label: "Upcoming",  className: "bg-info/15 text-info border border-info/25" },
  live:      { label: "Live",      className: "bg-success/15 text-success border border-success/25 animate-pulse" },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground border border-border" },
  cancelled: { label: "Cancelled", className: "bg-danger/15 text-danger border border-danger/25" },
};

export function findMarket(v: string) {
  return MARKETS.find((m) => m.value === v) ?? MARKETS[0];
}
export function findBattleType(v: string) {
  return BATTLE_TYPES.find((t) => t.value === v) ?? BATTLE_TYPES[2];
}
export function findWinCondition(v: string) {
  return WIN_CONDITIONS.find((w) => w.value === v) ?? WIN_CONDITIONS[0];
}
