export const APP_NAME = "TradersHIVE Arena";
export const APP_TAGLINE = "Train. Trade. Compete.";
export const APP_DESCRIPTION =
  "The gamified arena where traders train with paper trading, journal every setup, complete challenges, and climb global leaderboards.";

export type AppRole = "admin" | "moderator" | "premium" | "member";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  premium: "Premium",
  member: "Member",
};

export const LEAGUES = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
  "grandmaster",
] as const;
export type League = (typeof LEAGUES)[number];

export const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner", hint: "New to trading" },
  { value: "intermediate", label: "Intermediate", hint: "Some live experience" },
  { value: "advanced", label: "Advanced", hint: "Consistently profitable" },
  { value: "professional", label: "Professional", hint: "Full-time trader" },
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["value"];

export const MARKETS = [
  { value: "forex", label: "Forex", emoji: "💱" },
  { value: "crypto", label: "Crypto", emoji: "₿" },
  { value: "stocks", label: "Stocks", emoji: "📈" },
  { value: "futures", label: "Futures", emoji: "⚡" },
] as const;
export type Market = (typeof MARKETS)[number]["value"];

export const TRADING_STYLES = [
  { value: "scalping", label: "Scalping", hint: "Minutes" },
  { value: "intraday", label: "Intraday", hint: "Same-day" },
  { value: "swing", label: "Swing", hint: "Days to weeks" },
  { value: "position", label: "Position", hint: "Weeks to months" },
] as const;
export type TradingStyle = (typeof TRADING_STYLES)[number]["value"];

export const TRADING_GOALS = [
  { value: "consistency", label: "Build Consistency", hint: "Repeatable weekly returns" },
  { value: "prop_firm", label: "Pass a Prop Firm", hint: "FTMO, MFF, Topstep, etc." },
  { value: "learn", label: "Learn Trading", hint: "Master the fundamentals" },
  { value: "discipline", label: "Build Discipline", hint: "Follow the plan, every day" },
  { value: "improve_rr", label: "Improve Risk / Reward", hint: "Better R multiples" },
] as const;
export type TradingGoal = (typeof TRADING_GOALS)[number]["value"];

// Curated country list — extend as needed
export const COUNTRIES = [
  "United States","United Kingdom","Canada","Australia","New Zealand",
  "Germany","France","Spain","Italy","Portugal","Netherlands","Belgium",
  "Switzerland","Austria","Ireland","Sweden","Norway","Denmark","Finland",
  "Poland","Czech Republic","Hungary","Romania","Greece","Turkey",
  "Ukraine","Russia","Estonia","Latvia","Lithuania",
  "United Arab Emirates","Saudi Arabia","Qatar","Israel","Egypt",
  "South Africa","Nigeria","Kenya","Ghana","Morocco",
  "India","Pakistan","Bangladesh","Sri Lanka",
  "China","Japan","South Korea","Taiwan","Hong Kong","Singapore",
  "Malaysia","Indonesia","Thailand","Vietnam","Philippines",
  "Mexico","Brazil","Argentina","Chile","Colombia","Peru","Uruguay",
  "Other",
] as const;

// Common timezones
export const TIMEZONES = [
  "UTC",
  "Europe/London","Europe/Dublin","Europe/Lisbon","Europe/Madrid","Europe/Paris",
  "Europe/Amsterdam","Europe/Brussels","Europe/Berlin","Europe/Zurich","Europe/Rome",
  "Europe/Vienna","Europe/Prague","Europe/Warsaw","Europe/Athens","Europe/Istanbul",
  "Europe/Bucharest","Europe/Helsinki","Europe/Stockholm","Europe/Oslo","Europe/Copenhagen",
  "Europe/Kyiv","Europe/Moscow",
  "Africa/Cairo","Africa/Johannesburg","Africa/Lagos","Africa/Nairobi",
  "Asia/Dubai","Asia/Qatar","Asia/Riyadh","Asia/Jerusalem",
  "Asia/Karachi","Asia/Kolkata","Asia/Dhaka","Asia/Bangkok","Asia/Jakarta",
  "Asia/Singapore","Asia/Kuala_Lumpur","Asia/Hong_Kong","Asia/Shanghai",
  "Asia/Taipei","Asia/Seoul","Asia/Tokyo",
  "Australia/Perth","Australia/Sydney","Pacific/Auckland",
  "America/Sao_Paulo","America/Buenos_Aires","America/Santiago","America/Bogota","America/Lima",
  "America/Mexico_City","America/Chicago","America/New_York","America/Toronto",
  "America/Denver","America/Los_Angeles","America/Vancouver","America/Anchorage",
  "Pacific/Honolulu",
] as const;

/** XP required from level L to L+1. */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.15, Math.max(0, level - 1)));
}
export function levelProgress(xp: number, level: number): number {
  const needed = xpForLevel(level);
  return Math.min(100, Math.round((xp / needed) * 100));
}
