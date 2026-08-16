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

/** Right dock tabs — only one visible at a time (terminal style). */
export type WorkspaceTab = "watchlist" | "order" | "positions" | "pending" | "account" | "alerts" | "news";
/** Bottom dock tabs. */
export type BottomTab = "orders" | "positions" | "history" | "journal" | "notes";
export type BlotterFilter = "open" | "pending" | "closed" | "all" | "winning" | "losing" | "today" | "week";
export type BlotterSortKey = "symbol" | "pnl" | "time" | "size" | "status";
export type BlotterSort = { key: BlotterSortKey; dir: "asc" | "desc" };

export type WorkspacePrefs = {
  rightOpen: boolean;
  rightWidth: number; // px, 280–560
  activeTab: WorkspaceTab;
  focusMode: boolean;
  chartType: string;
  timeframe: string | null;
  indicators: Record<string, boolean>;
  /** Per-indicator input overrides, keyed by indicator key. */
  indicatorParams: Record<string, Record<string, number>>;
  smcOn: boolean;
  smcParts: Record<string, boolean>;
  /** Last applied chart template id (built-in or user-saved). */
  chartTemplateId: string | null;
  detailsOpen: boolean;
  bottomTab: BottomTab;
  bottomOpen: boolean;
  leftRailOpen: boolean;
  blotterFilter: BlotterFilter;
  dockHeight: number; // px, 180–560
  blotterSortOpen: BlotterSort;
  blotterSortClosed: BlotterSort;
  /**
   * Which open-positions columns are shown, by column id.
   *
   * Sparse on purpose: a column absent from this map is visible. New columns
   * therefore appear for existing users instead of being silently hidden by a
   * prefs blob written before they existed, and the stored object stays a
   * record of what the user turned OFF.
   */
  positionsColumns: Record<string, boolean>;
};

const STORAGE_KEY = "thive.workspace.prefs.v2";
const VALID_TABS: WorkspaceTab[] = ["watchlist", "order", "positions", "pending", "account", "alerts", "news"];
const VALID_BOTTOM: BottomTab[] = ["orders", "positions", "history", "journal", "notes"];
const VALID_FILTERS: BlotterFilter[] = ["open", "pending", "closed", "all", "winning", "losing", "today", "week"];

const DEFAULTS: WorkspacePrefs = {
  rightOpen: true,
  rightWidth: 320,
  activeTab: "order",
  focusMode: false,
  chartType: "candles",
  timeframe: null,
  indicators: { ema: true, volume: true },
  indicatorParams: {},
  smcOn: false,
  smcParts: { show_swings: true, show_bos: true, show_fvg: true, show_ob: true },
  chartTemplateId: null,
  detailsOpen: false,
  bottomTab: "positions",
  bottomOpen: true,
  leftRailOpen: true,
  blotterFilter: "open",
  dockHeight: 220,
  blotterSortOpen: { key: "time", dir: "desc" },
  blotterSortClosed: { key: "time", dir: "desc" },
  positionsColumns: {},
};


function readStorage(): WorkspacePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs> & { bottomTab?: string; activeTab?: string };
    const merged: WorkspacePrefs = { ...DEFAULTS, ...parsed };
    if (!VALID_TABS.includes(merged.activeTab)) merged.activeTab = DEFAULTS.activeTab;
    if (!VALID_BOTTOM.includes(merged.bottomTab)) merged.bottomTab = DEFAULTS.bottomTab;
    if (!VALID_FILTERS.includes(merged.blotterFilter)) merged.blotterFilter = "open";
    merged.dockHeight = Math.min(560, Math.max(180, Number(merged.dockHeight) || DEFAULTS.dockHeight));
    // A non-object here (an older build, or a hand-edited blob) would make
    // every `visibility[id]` lookup throw inside render rather than fall back.
    if (!merged.positionsColumns || typeof merged.positionsColumns !== "object") {
      merged.positionsColumns = {};
    }

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
