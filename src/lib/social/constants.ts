export type RankingCategory =
  | "xp"
  | "win_rate"
  | "profit_factor"
  | "net_r"
  | "profit"
  | "consistency"
  | "journal_score"
  | "challenge_score"
  | "achievements"
  | "streak"
  | "discipline";

export type RankingPeriod = "weekly" | "monthly" | "all_time";
export type RankingScopeKind = "global" | "friends" | "country" | "league";

export interface CategoryDef {
  key: RankingCategory;
  label: string;
  shortLabel: string;
  hint: string;
  format: "number" | "percent" | "currency" | "ratio" | "r";
  higherIsBetter: boolean;
  minTrades?: number;
}

export const RANKING_CATEGORIES: CategoryDef[] = [
  { key: "xp", label: "Experience Points", shortLabel: "XP", hint: "Total XP earned", format: "number", higherIsBetter: true },
  { key: "win_rate", label: "Win Rate", shortLabel: "Win %", hint: "Winners ÷ total trades", format: "percent", higherIsBetter: true, minTrades: 10 },
  { key: "profit_factor", label: "Profit Factor", shortLabel: "PF", hint: "Gross profit ÷ gross loss", format: "ratio", higherIsBetter: true, minTrades: 10 },
  { key: "net_r", label: "Net R", shortLabel: "Net R", hint: "Sum of R multiples", format: "r", higherIsBetter: true, minTrades: 5 },
  { key: "profit", label: "Net Profit", shortLabel: "Profit", hint: "Total realised P/L", format: "currency", higherIsBetter: true },
  { key: "consistency", label: "Consistency", shortLabel: "Cons.", hint: "How evenly profit is distributed", format: "percent", higherIsBetter: true, minTrades: 10 },
  { key: "journal_score", label: "Journal Score", shortLabel: "Journal", hint: "Journal entries × avg grade", format: "number", higherIsBetter: true },
  { key: "challenge_score", label: "Challenge Score", shortLabel: "Ch. Score", hint: "Completed challenges weighted by difficulty", format: "number", higherIsBetter: true },
  { key: "achievements", label: "Achievements", shortLabel: "Achv.", hint: "Number of achievements unlocked", format: "number", higherIsBetter: true },
  { key: "streak", label: "Daily Streak", shortLabel: "Streak", hint: "Current consecutive-day streak", format: "number", higherIsBetter: true },
  { key: "discipline", label: "Trading Discipline", shortLabel: "Disc.", hint: "% of trades that followed the plan", format: "percent", higherIsBetter: true, minTrades: 5 },
];

export function getCategory(key: string): CategoryDef {
  return RANKING_CATEGORIES.find((c) => c.key === key) ?? RANKING_CATEGORIES[0];
}

export const LEAGUE_META: Record<string, { label: string; color: string; from: string; to: string; ring: string; icon: string }> = {
  bronze: { label: "Bronze", color: "#cd7f32", from: "#7a4a1c", to: "#cd7f32", ring: "ring-amber-700/40", icon: "🥉" },
  silver: { label: "Silver", color: "#c0c0c0", from: "#6b7280", to: "#e5e7eb", ring: "ring-slate-400/40", icon: "🥈" },
  gold: { label: "Gold", color: "#f5c518", from: "#a16207", to: "#facc15", ring: "ring-yellow-500/40", icon: "🥇" },
  platinum: { label: "Platinum", color: "#7cf3ff", from: "#0e7490", to: "#67e8f9", ring: "ring-cyan-400/40", icon: "💎" },
  diamond: { label: "Diamond", color: "#8bd3ff", from: "#1d4ed8", to: "#93c5fd", ring: "ring-blue-400/40", icon: "💠" },
  master: { label: "Master", color: "#c084fc", from: "#7e22ce", to: "#e9d5ff", ring: "ring-purple-400/40", icon: "👑" },
  grandmaster: { label: "Grandmaster", color: "#f472b6", from: "#be185d", to: "#fbcfe8", ring: "ring-pink-400/40", icon: "🏆" },
  legend: { label: "Legend", color: "#f472b6", from: "#be185d", to: "#fbcfe8", ring: "ring-pink-400/40", icon: "🏆" },
};

/** ISO country → flag emoji fallback map (partial, extended to project country list). */
const COUNTRY_FLAG: Record<string, string> = {
  "United States": "🇺🇸", "United Kingdom": "🇬🇧", "Canada": "🇨🇦", "Australia": "🇦🇺", "New Zealand": "🇳🇿",
  "Germany": "🇩🇪", "France": "🇫🇷", "Spain": "🇪🇸", "Italy": "🇮🇹", "Portugal": "🇵🇹", "Netherlands": "🇳🇱",
  "Belgium": "🇧🇪", "Switzerland": "🇨🇭", "Austria": "🇦🇹", "Ireland": "🇮🇪", "Sweden": "🇸🇪", "Norway": "🇳🇴",
  "Denmark": "🇩🇰", "Finland": "🇫🇮", "Poland": "🇵🇱", "Czech Republic": "🇨🇿", "Hungary": "🇭🇺", "Romania": "🇷🇴",
  "Greece": "🇬🇷", "Turkey": "🇹🇷", "Ukraine": "🇺🇦", "Russia": "🇷🇺", "Estonia": "🇪🇪", "Latvia": "🇱🇻", "Lithuania": "🇱🇹",
  "United Arab Emirates": "🇦🇪", "Saudi Arabia": "🇸🇦", "Qatar": "🇶🇦", "Israel": "🇮🇱", "Egypt": "🇪🇬",
  "South Africa": "🇿🇦", "Nigeria": "🇳🇬", "Kenya": "🇰🇪", "Ghana": "🇬🇭", "Morocco": "🇲🇦",
  "India": "🇮🇳", "Pakistan": "🇵🇰", "Bangladesh": "🇧🇩", "Sri Lanka": "🇱🇰",
  "China": "🇨🇳", "Japan": "🇯🇵", "South Korea": "🇰🇷", "Taiwan": "🇹🇼", "Hong Kong": "🇭🇰", "Singapore": "🇸🇬",
  "Malaysia": "🇲🇾", "Indonesia": "🇮🇩", "Thailand": "🇹🇭", "Vietnam": "🇻🇳", "Philippines": "🇵🇭",
  "Mexico": "🇲🇽", "Brazil": "🇧🇷", "Argentina": "🇦🇷", "Chile": "🇨🇱", "Colombia": "🇨🇴", "Peru": "🇵🇪", "Uruguay": "🇺🇾",
};
export function countryFlag(country: string | null | undefined): string {
  if (!country) return "🌍";
  return COUNTRY_FLAG[country] ?? "🌐";
}

export function formatMetric(value: number, format: CategoryDef["format"]): string {
  if (value == null || !isFinite(value)) return "—";
  switch (format) {
    case "percent": return `${(value * 100).toFixed(1)}%`;
    case "currency": return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    case "ratio": return value.toFixed(2);
    case "r": return `${value.toFixed(2)}R`;
    default: return Math.round(value).toLocaleString();
  }
}
