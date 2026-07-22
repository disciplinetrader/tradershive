// Draft persistence + smart defaults for the Manual Journal dialog.
// Everything is stored in localStorage — no server round-trips required.

import { JOURNAL_STORAGE_KEYS } from "./constants";

export type JournalDraft = {
  savedAt: number;
  symbol: string;
  market: string;
  direction: "long" | "short";
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  pnl: string;
  rr: string;
  lotSize: string;
  openedAt: string;
  closedAt: string;
  session: string;
  sessionAuto: boolean;
  confidence: number;
  strategyTags: string[];
  emotions: string[];
  mistakes: string[];
  entryReason: string;
  postTradeNotes: string;
  riskPercent: string;
  accountBalance: string;
};

export type JournalDefaults = {
  strategy?: string;
  session?: string;
  riskPercent?: string;
  accountBalance?: string;
  favouriteSymbols?: string[];
};

const isBrowser = typeof window !== "undefined";

export function loadDraft(): JournalDraft | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEYS.draft);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JournalDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: JournalDraft): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEYS.draft, JSON.stringify(draft));
  } catch {
    /* quota — ignore */
  }
}

export function clearDraft(): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(JOURNAL_STORAGE_KEYS.draft);
  } catch {
    /* ignore */
  }
}

export function loadDefaults(): JournalDefaults {
  if (!isBrowser) return {};
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEYS.defaults);
    return raw ? (JSON.parse(raw) as JournalDefaults) : {};
  } catch {
    return {};
  }
}

export function saveDefaults(next: JournalDefaults): void {
  if (!isBrowser) return;
  try {
    const merged = { ...loadDefaults(), ...next };
    // Deduplicate favourites and cap length.
    if (merged.favouriteSymbols) {
      merged.favouriteSymbols = Array.from(new Set(merged.favouriteSymbols)).slice(0, 12);
    }
    localStorage.setItem(JOURNAL_STORAGE_KEYS.defaults, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

export function loadSectionState(): Record<string, boolean> {
  if (!isBrowser) return {};
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEYS.sections);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveSectionState(state: Record<string, boolean>): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEYS.sections, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/*  Completeness scoring                                                       */
/* -------------------------------------------------------------------------- */

export type CompletenessSlice = {
  key: string;
  label: string;
  done: boolean;
  hint: string;
};

export function computeCompleteness(draft: Partial<JournalDraft>): {
  score: number;
  slices: CompletenessSlice[];
} {
  const slices: CompletenessSlice[] = [
    {
      key: "instrument",
      label: "Instrument",
      done: Boolean(draft.symbol && draft.symbol.length > 0),
      hint: "Pick an instrument from the search",
    },
    {
      key: "execution",
      label: "Execution",
      done: Boolean(draft.entryPrice && draft.direction),
      hint: "Add entry price and direction",
    },
    {
      key: "risk",
      label: "Risk (SL/TP)",
      done: Boolean(draft.stopLoss || draft.takeProfit),
      hint: "Log stop-loss and take-profit",
    },
    {
      key: "timing",
      label: "Timing & session",
      done: Boolean(draft.openedAt && draft.session),
      hint: "Set opened-at and trading session",
    },
    {
      key: "strategy",
      label: "Strategy",
      done: Boolean(draft.strategyTags && draft.strategyTags.length > 0),
      hint: "Tag the setup(s) you traded",
    },
    {
      key: "psychology",
      label: "Emotion",
      done: Boolean(draft.emotions && draft.emotions.length > 0),
      hint: "Log how the trade felt",
    },
    {
      key: "reason",
      label: "Entry reason",
      done: Boolean(draft.entryReason && draft.entryReason.trim().length >= 10),
      hint: "Describe your thesis",
    },
    {
      key: "notes",
      label: "Post-trade notes",
      done: Boolean(draft.postTradeNotes && draft.postTradeNotes.trim().length >= 10),
      hint: "Capture the lesson",
    },
  ];
  const done = slices.filter((s) => s.done).length;
  return { score: Math.round((done / slices.length) * 100), slices };
}

/* -------------------------------------------------------------------------- */
/*  Auto calculations                                                          */
/* -------------------------------------------------------------------------- */

export function formatDuration(fromISO: string, toISO: string): string | null {
  if (!fromISO || !toISO) return null;
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  const ms = to - from;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

export function computePips(
  entry: number | null,
  exit: number | null,
  pipSize: number,
  direction: "long" | "short",
): number | null {
  if (entry == null || exit == null || !pipSize) return null;
  const diff = (exit - entry) * (direction === "long" ? 1 : -1);
  return Math.round((diff / pipSize) * 10) / 10;
}

export function computeRiskPercent(
  entry: number | null,
  stop: number | null,
  lotSize: number | null,
  contractSize: number,
  accountBalance: number | null,
): number | null {
  if (entry == null || stop == null || lotSize == null || !accountBalance) return null;
  const riskCash = Math.abs(entry - stop) * lotSize * contractSize;
  if (!Number.isFinite(riskCash) || !riskCash) return null;
  return Math.round((riskCash / accountBalance) * 10_000) / 100;
}
