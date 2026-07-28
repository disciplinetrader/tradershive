/**
 * Onboarding activation checklist state (localStorage-backed).
 *
 * The checklist reflects the six user milestones. State is stored locally
 * so it works offline and does not require a new DB table; server-side
 * milestones (real trades, journal entries, etc.) are inferred from the
 * dashboard summary and merged into the local completion set.
 */

export type ChecklistItemId =
  | "complete_onboarding"
  | "create_first_backtest"
  | "finish_first_session"
  | "review_first_trade"
  | "open_performance"
  | "visit_ai_coach";

export type ChecklistItem = {
  id: ChecklistItemId;
  label: string;
  description: string;
  href: string;
  cta: string;
};

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "complete_onboarding",
    label: "Complete onboarding",
    description: "Personalise your workspace.",
    href: "/onboarding",
    cta: "Resume",
  },
  {
    id: "create_first_backtest",
    label: "Create your first backtest",
    description: "Launch a replay session on real historical data.",
    href: "/replay",
    cta: "Create",
  },
  {
    id: "finish_first_session",
    label: "Finish your first session",
    description: "Play the replay through and take at least one trade.",
    href: "/replay/library",
    cta: "Continue",
  },
  {
    id: "review_first_trade",
    label: "Review your first trade",
    description: "Open the Trade Review workspace and score a setup.",
    href: "/replay/trades",
    cta: "Review",
  },
  {
    id: "open_performance",
    label: "Open the Performance Dashboard",
    description: "See your win rate, R-multiples and streaks.",
    href: "/analytics/performance",
    cta: "Open",
  },
  {
    id: "visit_ai_coach",
    label: "Ask your AI Coach",
    description: "Get personalised feedback from your data.",
    href: "/ai/dashboard",
    cta: "Chat",
  },
];

const KEY = "thv:onboarding:checklist:v1";

export function readChecklist(): Record<ChecklistItemId, boolean> {
  const empty = Object.fromEntries(
    CHECKLIST_ITEMS.map((i) => [i.id, false]),
  ) as Record<ChecklistItemId, boolean>;
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Record<ChecklistItemId, boolean>) };
  } catch {
    return empty;
  }
}

export function markChecklist(id: ChecklistItemId, done = true) {
  if (typeof window === "undefined") return;
  const state = readChecklist();
  state[id] = done;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("thv:checklist-changed"));
  } catch {
    /* ignore */
  }
}

export function checklistProgress(state: Record<ChecklistItemId, boolean>): number {
  const total = CHECKLIST_ITEMS.length;
  const done = Object.values(state).filter(Boolean).length;
  return Math.round((done / total) * 100);
}
