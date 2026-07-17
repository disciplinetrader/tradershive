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

/** XP required from level L to L+1. */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.15, Math.max(0, level - 1)));
}

/** Progress % (0-100) for current level given total xp accumulated for the level. */
export function levelProgress(xp: number, level: number): number {
  const needed = xpForLevel(level);
  return Math.min(100, Math.round((xp / needed) * 100));
}
