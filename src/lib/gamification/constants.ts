import { xpForLevel } from "@/lib/constants";

export const XP_REWARDS = {
  daily_login: 10,
  journal_trade: 25,
  winning_trade: 40,
  losing_trade: 10,
  complete_challenge_easy: 100,
  complete_challenge_medium: 200,
  complete_challenge_hard: 400,
  complete_challenge_elite: 1000,
  complete_week: 200,
  achievement_default: 200,
} as const;

export const LEAGUES = [
  { key: "bronze", label: "Bronze", minLevel: 1, color: "#cd7f32" },
  { key: "silver", label: "Silver", minLevel: 5, color: "#c0c0c0" },
  { key: "gold", label: "Gold", minLevel: 15, color: "#ffd700" },
  { key: "platinum", label: "Platinum", minLevel: 30, color: "#7cf3ff" },
  { key: "diamond", label: "Diamond", minLevel: 50, color: "#8bd3ff" },
  { key: "master", label: "Master", minLevel: 75, color: "#c084fc" },
  { key: "legend", label: "Legend", minLevel: 100, color: "#f472b6" },
] as const;

export type LeagueKey = (typeof LEAGUES)[number]["key"];

export function leagueForLevel(level: number): LeagueKey {
  let match: LeagueKey = "bronze";
  for (const l of LEAGUES) if (level >= l.minLevel) match = l.key;
  return match;
}

export function nextLeague(level: number) {
  const current = leagueForLevel(level);
  const idx = LEAGUES.findIndex((l) => l.key === current);
  return LEAGUES[idx + 1] ?? null;
}

/** Advance level while xp exceeds threshold. Returns final {level, xp, leveledUp}. */
export function applyXp(currentLevel: number, currentXp: number, delta: number) {
  let level = Math.max(1, currentLevel);
  let xp = Math.max(0, currentXp) + delta;
  let leveledUp = false;
  while (delta > 0 && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveledUp = true;
  }
  return { level, xp, leveledUp };
}

export const CATEGORY_LABEL: Record<string, string> = {
  learning: "Learning",
  discipline: "Discipline",
  risk: "Risk Management",
  consistency: "Consistency",
  psychology: "Psychology",
  skills: "Trading Skills",
  community: "Community",
  general: "General",
};

export const DIFFICULTY_STYLES: Record<string, { label: string; className: string }> = {
  easy: { label: "Easy", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  hard: { label: "Hard", className: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  elite: { label: "Elite", className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

/** Weekly Sunday-based day index rotation (1..7). Deterministic, resets on 7. */
export function dailyRewardFor(dayIndex: number): { xp: number; coins: number; bonus?: boolean } {
  const table = [
    { xp: 10, coins: 5 },
    { xp: 15, coins: 8 },
    { xp: 20, coins: 12 },
    { xp: 30, coins: 20 },
    { xp: 40, coins: 30 },
    { xp: 60, coins: 45 },
    { xp: 150, coins: 120, bonus: true },
  ];
  return table[Math.max(0, Math.min(6, dayIndex - 1))];
}
