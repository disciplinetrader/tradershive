export const STRATEGY_CATEGORIES = [
  "trend", "breakout", "reversal", "momentum", "scalp", "swing", "smc", "news", "other",
] as const;

export const STRATEGY_MARKETS = [
  "forex", "crypto", "stocks", "indices", "futures", "metals", "commodities",
] as const;

export const STRATEGY_TIMEFRAMES = [
  "M1","M5","M15","M30","H1","H4","D1","W1","MN",
] as const;

export const MARKET_CONDITIONS = [
  { id: "trending", label: "Trending" },
  { id: "range", label: "Range-bound" },
  { id: "breakout", label: "Breakout" },
  { id: "volatile", label: "Volatile" },
  { id: "low_volume", label: "Low Volume" },
  { id: "news", label: "News Driven" },
] as const;

export const STRATEGY_STATUS = [
  { id: "draft", label: "Draft", color: "#94a3b8" },
  { id: "private", label: "Private", color: "#3b82f6" },
  { id: "public", label: "Public", color: "#22c55e" },
  { id: "archived", label: "Archived", color: "#6b7280" },
] as const;

export const STRATEGY_DIFFICULTIES = [
  { id: "beginner", label: "Beginner", color: "#22c55e" },
  { id: "intermediate", label: "Intermediate", color: "#3b82f6" },
  { id: "advanced", label: "Advanced", color: "#f97316" },
  { id: "expert", label: "Expert", color: "#ef4444" },
] as const;

export const STRATEGY_COLORS = [
  "#8b5cf6","#22c55e","#3b82f6","#f97316","#ef4444","#eab308",
  "#14b8a6","#ec4899","#06b6d4","#a855f7","#f59e0b","#10b981",
];

export const STRATEGY_ICONS = [
  "Sparkles","TrendingUp","Zap","Rocket","Crosshair","Timer",
  "Waves","Sunrise","Activity","LineChart","GitFork","Target",
];

export const CHECKLIST_KINDS = [
  { id: "pre_market", label: "Pre-Market" },
  { id: "entry", label: "Entry" },
  { id: "exit", label: "Exit" },
  { id: "post_trade", label: "Post-Trade" },
  { id: "weekly", label: "Weekly Review" },
  { id: "monthly", label: "Monthly Review" },
] as const;

export const COMMON_TAGS = [
  "SMC","ICT","VWAP","EMA","ORB","Momentum","Breakout","Scalp",
  "Swing","Trend","Reversal","Pullback","News","Session","London","NY","Asia",
];

export const WIZARD_STEPS = [
  { id: 1, title: "Basics", description: "Name, category and identity" },
  { id: 2, title: "Market", description: "When this strategy works" },
  { id: 3, title: "Entry Rules", description: "How trades are entered" },
  { id: 4, title: "Exit Rules", description: "How trades are managed out" },
  { id: 5, title: "Risk", description: "Position sizing and limits" },
  { id: 6, title: "Management", description: "In-trade adjustments" },
  { id: 7, title: "Checklists", description: "Pre and post-trade routines" },
  { id: 8, title: "Examples", description: "Reference trades and screenshots" },
  { id: 9, title: "Publish", description: "Status and visibility" },
] as const;
