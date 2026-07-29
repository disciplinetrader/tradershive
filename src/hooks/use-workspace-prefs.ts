/**
 * Trading Workspace 3.0 — persistent user preferences.
 *
 * A single flat object stored in localStorage, hydrated on mount and
 * written back (debounced by React batching) whenever any field changes.
 * Read on the client only — safe under SSR because access is gated by
 * `typeof window` and the initial render always uses the defaults so
 * hydration never diverges.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type WorkspaceTab = "trade" | "notes" | "insights";
export type BottomTab = "blotter" | "watchlist";
export type BlotterFilter = "open" | "pending" | "closed" | "all";

export type WorkspacePrefs = {
  rightOpen: boolean;
  rightWidth: number; // px, 280–560
  activeTab: WorkspaceTab;
  focusMode: boolean;
  chartType: string;
  timeframe: string | null;
  indicators: Record<string, boolean>;
  smcOn: boolean;
  detailsOpen: boolean;
  bottomTab: BottomTab;
  blotterFilter: BlotterFilter;
  dockHeight: number; // px, 180–560
};

const STORAGE_KEY = "thive.workspace.prefs.v1";
const VALID_TABS: WorkspaceTab[] = ["trade", "notes", "insights"];
const VALID_BOTTOM: BottomTab[] = ["blotter", "watchlist"];
const VALID_FILTERS: BlotterFilter[] = ["open", "pending", "closed", "all"];

const DEFAULTS: WorkspacePrefs = {
  rightOpen: true,
  rightWidth: 360,
  activeTab: "trade",
  focusMode: false,
  chartType: "candles",
  timeframe: null,
  indicators: { ema: true, volume: true },
  smcOn: false,
  detailsOpen: false,
  bottomTab: "blotter",
  blotterFilter: "open",
  dockHeight: 280,
};

function readStorage(): WorkspacePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs> & { bottomTab?: string };
    const merged: WorkspacePrefs = { ...DEFAULTS, ...parsed };
    if (!VALID_TABS.includes(merged.activeTab)) merged.activeTab = "trade";
    // Migrate legacy bottom-tab ids (positions/orders/history → blotter+filter).
    const legacy = parsed.bottomTab as string | undefined;
    if (legacy && !VALID_BOTTOM.includes(legacy as BottomTab)) {
      merged.bottomTab = legacy === "watchlist" ? "watchlist" : "blotter";
      if (legacy === "orders") merged.blotterFilter = "pending";
      else if (legacy === "history") merged.blotterFilter = "closed";
      else if (legacy === "positions") merged.blotterFilter = "open";
    }
    if (!VALID_FILTERS.includes(merged.blotterFilter)) merged.blotterFilter = "open";
    merged.dockHeight = Math.min(560, Math.max(180, Number(merged.dockHeight) || DEFAULTS.dockHeight));
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export function useWorkspacePrefs() {
  const [prefs, setPrefs] = useState<WorkspacePrefs>(DEFAULTS);
  const hydrated = useRef(false);

  useEffect(() => {
    setPrefs(readStorage());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch { /* quota / private mode — ignore */ }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [prefs]);

  const update = useCallback(<K extends keyof WorkspacePrefs>(key: K, value: WorkspacePrefs[K]) => {
    setPrefs((p) => (p[key] === value ? p : { ...p, [key]: value }));
  }, []);

  const patch = useCallback((partial: Partial<WorkspacePrefs>) => {
    setPrefs((p) => ({ ...p, ...partial }));
  }, []);

  return { prefs, update, patch, hydrated: hydrated.current };
}
