/**
 * Trade Review local-store
 * ------------------------
 * Per-trade rule checklist + mistake tags persisted in localStorage.
 * Zero schema changes; syncs across tabs via `storage` events.
 */
import { useCallback, useEffect, useState } from "react";

export const RULE_CHECKLIST: { id: string; label: string }[] = [
  { id: "trend_aligned", label: "Trend aligned" },
  { id: "cpr_respected", label: "CPR respected" },
  { id: "vwap_respected", label: "VWAP respected" },
  { id: "ema_confirmation", label: "EMA confirmation" },
  { id: "risk_under_1", label: "Risk < 1%" },
  { id: "news_avoided", label: "News avoided" },
  { id: "correct_session", label: "Correct session" },
  { id: "confluence_present", label: "Multi-timeframe confluence" },
  { id: "clear_invalidation", label: "Clear invalidation" },
  { id: "no_chasing", label: "No chasing / patient entry" },
];

export const MISTAKE_TAGS: { id: string; label: string; tone: "danger" | "warning" }[] = [
  { id: "fomo", label: "FOMO", tone: "danger" },
  { id: "early_entry", label: "Early Entry", tone: "warning" },
  { id: "late_entry", label: "Late Entry", tone: "warning" },
  { id: "moved_stop", label: "Moved Stop", tone: "danger" },
  { id: "closed_early", label: "Closed Early", tone: "warning" },
  { id: "over_leveraged", label: "Over Leveraged", tone: "danger" },
  { id: "revenge_trade", label: "Revenge Trade", tone: "danger" },
  { id: "poor_risk_mgmt", label: "Poor Risk Management", tone: "danger" },
  { id: "broke_rules", label: "Broke Rules", tone: "danger" },
  { id: "no_plan", label: "No Plan", tone: "warning" },
  { id: "counter_trend", label: "Counter-Trend", tone: "warning" },
  { id: "news_ignored", label: "Ignored News", tone: "warning" },
];

export type ReviewState = {
  rules: Record<string, boolean>;
  mistakes: string[];
  notes: string;
  updated_at: string | null;
};

const KEY = (id: string) => `hive:trade-review:${id}`;

const EMPTY: ReviewState = { rules: {}, mistakes: [], notes: "", updated_at: null };

function read(id: string): ReviewState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY(id));
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as ReviewState) };
  } catch {
    return EMPTY;
  }
}

function write(id: string, s: ReviewState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(id), JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function useTradeReviewLocal(tradeId: string) {
  const [state, setState] = useState<ReviewState>(() => read(tradeId));

  useEffect(() => {
    setState(read(tradeId));
    const handler = (e: StorageEvent) => {
      if (e.key === KEY(tradeId)) setState(read(tradeId));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [tradeId]);

  const persist = useCallback(
    (patch: Partial<ReviewState>) => {
      setState((prev) => {
        const next: ReviewState = { ...prev, ...patch, updated_at: new Date().toISOString() };
        write(tradeId, next);
        return next;
      });
    },
    [tradeId],
  );

  const toggleRule = useCallback((id: string) => persist({ rules: { ...state.rules, [id]: !state.rules[id] } }), [persist, state.rules]);
  const toggleMistake = useCallback(
    (id: string) => {
      const set = new Set(state.mistakes);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      persist({ mistakes: [...set] });
    },
    [persist, state.mistakes],
  );
  const setNotes = useCallback((notes: string) => persist({ notes }), [persist]);

  const compliance =
    RULE_CHECKLIST.length > 0
      ? Math.round((RULE_CHECKLIST.filter((r) => state.rules[r.id]).length / RULE_CHECKLIST.length) * 100)
      : 0;

  return { state, toggleRule, toggleMistake, setNotes, compliance };
}

/** Compute a synthetic trade score from trade + review inputs. */
export function computeTradeScore(input: {
  pnl: number;
  rr_realized: number | null;
  risk_pct: number | null;
  rules_checked_pct: number;
  mistake_count: number;
  has_sl: boolean;
  has_tp: boolean;
}) {
  const rr = input.rr_realized ?? 0;
  const execution = Math.max(0, Math.min(100, 60 + rr * 15 - input.mistake_count * 8));
  const risk = Math.max(0, Math.min(100, (input.has_sl ? 60 : 20) + (input.has_tp ? 20 : 0) + (input.risk_pct != null && input.risk_pct <= 1 ? 20 : 0)));
  const discipline = Math.max(0, Math.min(100, input.rules_checked_pct - input.mistake_count * 6));
  const setup = Math.max(0, Math.min(100, 55 + rr * 10 + (input.rules_checked_pct - 50) * 0.3));
  const overall = Math.round((execution + risk + discipline + setup) / 4);
  const grade =
    overall >= 92 ? "A+" : overall >= 85 ? "A" : overall >= 75 ? "B" : overall >= 65 ? "C" : overall >= 50 ? "D" : "F";
  return {
    execution: Math.round(execution),
    risk: Math.round(risk),
    discipline: Math.round(discipline),
    setup: Math.round(setup),
    overall,
    grade,
  };
}
