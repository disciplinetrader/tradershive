export type PlaybookChecklistItem = {
  id: string;
  label: string;
  required: boolean;
};

export type PlaybookChecklistRunItem = PlaybookChecklistItem & { checked: boolean };

export type PlaybookChecklistRun = {
  id: string;
  strategy_id: string;
  context: "paper" | "replay" | "journal" | "manual";
  context_ref_id: string | null;
  items: PlaybookChecklistRunItem[];
  all_required_passed: boolean;
  notes: string | null;
  created_at: string;
};

export type PlaybookTradeExample = {
  id: string;
  source: "journal" | "paper";
  symbol: string | null;
  side: string | null;
  opened_at: string | null;
  closed_at: string | null;
  pnl: number | null;
  r_multiple: number | null;
  outcome: "win" | "loss" | "breakeven";
};

export type PlaybookStats = {
  strategy_id: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  win_rate: number;
  avg_r: number;
  profit_factor: number;
  avg_hold_seconds: number;
  best?: PlaybookTradeExample;
  worst?: PlaybookTradeExample;
  examples: PlaybookTradeExample[];
};

export type PlaybookEvolutionPoint = {
  bucket: string;
  trades: number;
  win_rate: number;
  avg_r: number;
};

export type PlaybookEvolution = {
  current: { trades: number; win_rate: number; avg_r: number };
  previous: { trades: number; win_rate: number; avg_r: number };
  deltas: { trades: number; win_rate: number; avg_r: number };
  timeline: PlaybookEvolutionPoint[];
  versions: Array<{ version: number; created_at: string; change_notes: string | null }>;
};
