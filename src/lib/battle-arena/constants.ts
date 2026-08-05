export const BATTLE_TYPES = [
  { value: "1v1", label: "1 vs 1", max: 2 },
  { value: "2v2", label: "2 vs 2", max: 4 },
  { value: "ffa5", label: "5 Player FFA", max: 5 },
  { value: "ffa10", label: "10 Player FFA", max: 10 },
  { value: "profit_target", label: "Target Chase", max: 20 },
  { value: "time_trial", label: "Market Sprint", max: 20 },
  { value: "custom", label: "Custom Arena", max: 50 },
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

export type BattleStatus = 
  | "draft" 
  | "upcoming"
  | "open" 
  | "filling" 
  | "staging_room" 
  | "locked_in" 
  | "market_syncing"  
  | "live"  
  | "paused" 
  | "completed" 
  | "cancelled" 
  | "failed";

export type BattleVisibility = "public" | "private";

export const STATUS_STYLES: Record<BattleStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-muted text-muted-foreground border border-border" },
  upcoming:  { label: "Upcoming",  className: "bg-info/10 text-info border border-info/20" },
  open:      { label: "Open",      className: "bg-info/10 text-info border border-info/20" },
  filling:   { label: "Filling",   className: "bg-warning/10 text-warning border border-warning/20" },
  staging_room:   { label: "Staging Room",  className: "bg-primary/10 text-primary border border-primary/20" },
  locked_in:      { label: "Locked In",     className: "bg-primary/20 text-primary border border-primary/30" },
  market_syncing: { label: "Market Syncing", className: "bg-primary text-primary-foreground animate-pulse" },
  live:           { label: "Live",      className: "bg-success/15 text-success border border-success/25 animate-pulse" },
  paused:    { label: "Paused",    className: "bg-warning/15 text-warning border border-warning/25" },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground border border-border" },
  cancelled: { label: "Cancelled", className: "bg-danger/15 text-danger border border-danger/25" },
  failed:    { label: "Failed",    className: "bg-danger text-danger-foreground" },
};

export const RANKS = [
  { value: "initiate",  label: "Initiate",  minElo: 0,    color: "#64748b" },
  { value: "forager",   label: "Forager",   minElo: 1200, color: "#94a3b8" },
  { value: "sentinel",  label: "Sentinel",  minElo: 1500, color: "#fbbf24" },
  { value: "vanguard",  label: "Vanguard",  minElo: 1800, color: "#38bdf8" },
  { value: "apex",      label: "Apex",      minElo: 2200, color: "#818cf8" },
  { value: "sovereign", label: "Sovereign", minElo: 2600, color: "#f43f5e" },
] as const;

export type BattleRank = (typeof RANKS)[number]["value"];

export function getRankFromElo(elo: number): (typeof RANKS)[number] {
  return [...RANKS].reverse().find(r => elo >= r.minElo) || RANKS[0];
}

export function findMarket(v: string) {
  return MARKETS.find((m) => m.value === v) ?? MARKETS[0];
}
export function findBattleType(v: string) {
  return BATTLE_TYPES.find((t) => t.value === v) ?? BATTLE_TYPES[2];
}
export function findWinCondition(v: string) {
  return WIN_CONDITIONS.find((w) => w.value === v) ?? WIN_CONDITIONS[0];
}
