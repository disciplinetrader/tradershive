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
};

const STORAGE_KEY = "thive.workspace.prefs.v1";
const VALID_TABS: WorkspaceTab[] = ["trade", "notes", "insights"];

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
};

function readStorage(): WorkspacePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>;
    const merged: WorkspacePrefs = { ...DEFAULTS, ...parsed };
    // Migrate legacy tabs (journal/playbook/stats) → trade.
    if (!VALID_TABS.includes(merged.activeTab)) merged.activeTab = "trade";
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

  // Debounced write so rapid toggles (indicator checks, resize drag) don't
  // storm localStorage. Writes at most every 150 ms after the last change.
  useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch {
        /* quota / private mode — silently ignore */
      }
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
