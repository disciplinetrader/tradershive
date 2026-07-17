// Demo datasets used until live integrations are wired up.
// Each dataset is stable and deterministic so charts don't flicker between renders.

export type RecentTrade = {
  id: string;
  pair: string;
  direction: "long" | "short";
  entry: number;
  exit: number;
  rr: number;
  pnl: number;
  duration: string;
  status: "win" | "loss" | "breakeven";
  openedAt: string;
};

export const MOCK_RECENT_TRADES: RecentTrade[] = [
  { id: "t1", pair: "EUR/USD", direction: "long", entry: 1.0842, exit: 1.0891, rr: 2.1, pnl: 245.6, duration: "2h 14m", status: "win", openedAt: "2026-07-16T08:12:00Z" },
  { id: "t2", pair: "BTC/USDT", direction: "short", entry: 68240, exit: 67550, rr: 1.4, pnl: 138.2, duration: "45m", status: "win", openedAt: "2026-07-16T11:30:00Z" },
  { id: "t3", pair: "GBP/JPY", direction: "long", entry: 199.42, exit: 199.06, rr: 0.8, pnl: -112.4, duration: "1h 02m", status: "loss", openedAt: "2026-07-15T14:05:00Z" },
  { id: "t4", pair: "XAU/USD", direction: "long", entry: 2415.3, exit: 2432.1, rr: 2.6, pnl: 336.8, duration: "3h 40m", status: "win", openedAt: "2026-07-15T09:20:00Z" },
  { id: "t5", pair: "US30", direction: "short", entry: 40120, exit: 40180, rr: 0.4, pnl: -60, duration: "22m", status: "loss", openedAt: "2026-07-14T15:44:00Z" },
  { id: "t6", pair: "ETH/USDT", direction: "long", entry: 3410, exit: 3410, rr: 0, pnl: 0, duration: "18m", status: "breakeven", openedAt: "2026-07-14T10:12:00Z" },
  { id: "t7", pair: "USD/JPY", direction: "short", entry: 157.4, exit: 156.9, rr: 1.8, pnl: 182.5, duration: "1h 55m", status: "win", openedAt: "2026-07-13T13:00:00Z" },
  { id: "t8", pair: "NAS100", direction: "long", entry: 19820, exit: 19910, rr: 1.2, pnl: 148, duration: "58m", status: "win", openedAt: "2026-07-13T08:45:00Z" },
  { id: "t9", pair: "AUD/USD", direction: "short", entry: 0.6712, exit: 0.6735, rr: 0.6, pnl: -78.4, duration: "35m", status: "loss", openedAt: "2026-07-12T09:10:00Z" },
  { id: "t10", pair: "SOL/USDT", direction: "long", entry: 172.4, exit: 178.9, rr: 2.9, pnl: 412.6, duration: "4h 18m", status: "win", openedAt: "2026-07-12T04:00:00Z" },
];

export type MarketQuote = {
  symbol: string;
  name: string;
  market: "forex" | "crypto" | "index" | "metal" | "energy";
  price: number;
  change: number; // percent
};

export const MOCK_MARKETS: MarketQuote[] = [
  { symbol: "EUR/USD", name: "Euro / US Dollar", market: "forex", price: 1.0891, change: 0.32 },
  { symbol: "GBP/USD", name: "British Pound", market: "forex", price: 1.2874, change: -0.14 },
  { symbol: "USD/JPY", name: "US Dollar / Yen", market: "forex", price: 156.92, change: 0.21 },
  { symbol: "BTC/USDT", name: "Bitcoin", market: "crypto", price: 67550, change: -0.82 },
  { symbol: "ETH/USDT", name: "Ethereum", market: "crypto", price: 3418.5, change: 1.14 },
  { symbol: "SOL/USDT", name: "Solana", market: "crypto", price: 178.9, change: 3.42 },
  { symbol: "SPX500", name: "S&P 500", market: "index", price: 5628.1, change: 0.44 },
  { symbol: "NAS100", name: "Nasdaq 100", market: "index", price: 19910, change: 0.71 },
  { symbol: "US30", name: "Dow Jones", market: "index", price: 40180, change: -0.12 },
  { symbol: "XAU/USD", name: "Gold", market: "metal", price: 2432.1, change: 0.68 },
  { symbol: "WTI", name: "Crude Oil", market: "energy", price: 82.4, change: -1.02 },
];

// Equity curve: 30 points, starting at 10000
function generateEquity(): { date: string; equity: number }[] {
  const points: { date: string; equity: number }[] = [];
  let eq = 10000;
  const seed = [12, -4, 18, 25, -8, 14, 6, -3, 22, 34, -11, 9, 28, 15, -5, 40, 12, 6, -18, 24, 33, 18, -6, 42, 27, 14, -9, 36, 22, 48];
  for (let i = 0; i < 30; i++) {
    eq += seed[i] * 8;
    const d = new Date(2026, 5, i + 15);
    points.push({ date: d.toISOString().slice(5, 10), equity: Math.round(eq) });
  }
  return points;
}
export const MOCK_EQUITY = generateEquity();

export const MOCK_WEEKLY = [
  { day: "Mon", pnl: 145 },
  { day: "Tue", pnl: -62 },
  { day: "Wed", pnl: 210 },
  { day: "Thu", pnl: 88 },
  { day: "Fri", pnl: 322 },
  { day: "Sat", pnl: 0 },
  { day: "Sun", pnl: 0 },
];

export const MOCK_MONTHLY = [
  { week: "W1", pnl: 620 },
  { week: "W2", pnl: -180 },
  { week: "W3", pnl: 940 },
  { week: "W4", pnl: 512 },
];

export const MOCK_RR_DISTRIBUTION = [
  { bucket: "<0.5R", count: 3 },
  { bucket: "0.5-1R", count: 5 },
  { bucket: "1-2R", count: 12 },
  { bucket: "2-3R", count: 8 },
  { bucket: ">3R", count: 4 },
];

export const MOCK_SESSIONS = [
  { session: "Asia", pnl: 180 },
  { session: "London", pnl: 640 },
  { session: "NY", pnl: 420 },
];

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: number;
};

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  { id: "a1", name: "First Trade", description: "Execute your first paper trade", icon: "🎯", unlocked: true },
  { id: "a2", name: "Journal Master", description: "Journal 10 trades", icon: "📓", unlocked: true },
  { id: "a3", name: "Streak x7", description: "Trade 7 days in a row", icon: "🔥", unlocked: true },
  { id: "a4", name: "Sharpshooter", description: "60% win rate over 20 trades", icon: "🏹", unlocked: false, progress: 42 },
  { id: "a5", name: "Iron Discipline", description: "Follow plan for 30 days", icon: "🛡️", unlocked: false, progress: 60 },
  { id: "a6", name: "R Whale", description: "Land a 5R trade", icon: "🐋", unlocked: false, progress: 20 },
  { id: "a7", name: "Season 1 Veteran", description: "Complete Season 1", icon: "🏆", unlocked: false, progress: 12 },
  { id: "a8", name: "Guild Founder", description: "Create a guild", icon: "🏰", unlocked: false },
];

export type LeaderboardEntry = {
  rank: number;
  username: string;
  avatar: string | null;
  xp: number;
  league: string;
  winRate: number;
};

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: "alphahunter", avatar: null, xp: 48210, league: "grandmaster", winRate: 68 },
  { rank: 2, username: "priceaction", avatar: null, xp: 44560, league: "grandmaster", winRate: 64 },
  { rank: 3, username: "riskqueen", avatar: null, xp: 41120, league: "master", winRate: 61 },
  { rank: 4, username: "smcsniper", avatar: null, xp: 38240, league: "master", winRate: 58 },
  { rank: 5, username: "scalpking", avatar: null, xp: 35980, league: "diamond", winRate: 55 },
];

export type DashboardNotification = {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  type: "challenge" | "trade" | "achievement" | "system";
};

export const MOCK_NOTIFICATIONS: DashboardNotification[] = [
  { id: "n1", title: "Daily challenge available", description: "Complete 'Follow the Trend' for +250 XP", time: "10m", read: false, type: "challenge" },
  { id: "n2", title: "Achievement unlocked", description: "Streak x7 — keep the fire alive", time: "1h", read: false, type: "achievement" },
  { id: "n3", title: "Trade closed", description: "XAU/USD long +2.6R", time: "3h", read: true, type: "trade" },
  { id: "n4", title: "New leaderboard rank", description: "You moved to #482 in Diamond league", time: "1d", read: true, type: "system" },
];

// Default watchlist seed when the user has none yet
export const DEFAULT_WATCHLIST = [
  { symbol: "EUR/USD", market: "forex" },
  { symbol: "BTC/USDT", market: "crypto" },
  { symbol: "XAU/USD", market: "metal" },
  { symbol: "NAS100", market: "index" },
];

export const TODAYS_CHALLENGE = {
  id: "c-daily",
  name: "Follow the Trend",
  difficulty: "Intermediate" as const,
  rewardXp: 250,
  rewardCoins: 40,
  estimatedMinutes: 25,
  progress: 40, // 0-100
  completed: false,
  description: "Take 3 paper trades in the direction of the 4H trend with a minimum 1.5R target.",
};
