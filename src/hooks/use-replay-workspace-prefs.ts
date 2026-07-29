/**
 * Sprint 4 — Persistent replay workspace preferences.
 *
 * Mirrors `use-workspace-prefs` but scoped to Replay Studio so the trader
 * resumes exactly where they left off: side rail state, active tab and
 * playback speed. Writes are debounced (150ms) to keep localStorage cheap
 * during rapid setting changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ReplaySideTab = "trade" | "notes" | "review";

export type ReplayWorkspacePrefs = {
  sideOpen: boolean;
  sideTab: ReplaySideTab;
  speed: number;
};

const STORAGE_KEY = "thive.replay.workspace.prefs.v1";
const VALID_TABS: ReplaySideTab[] = ["trade", "notes", "review"];
const VALID_SPEEDS = new Set([0.5, 1, 2, 4, 8, 16, 32, 64]);

const DEFAULTS: ReplayWorkspacePrefs = {
  sideOpen: true,
  sideTab: "trade",
  speed: 1,
};

function readStorage(): ReplayWorkspacePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReplayWorkspacePrefs>;
    const merged: ReplayWorkspacePrefs = { ...DEFAULTS, ...parsed };
    if (!VALID_TABS.includes(merged.sideTab)) merged.sideTab = "trade";
    if (!VALID_SPEEDS.has(merged.speed)) merged.speed = 1;
    merged.sideOpen = !!merged.sideOpen;
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export function useReplayWorkspacePrefs() {
  const [prefs, setPrefs] = useState<ReplayWorkspacePrefs>(DEFAULTS);
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
      } catch { /* quota — ignore */ }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [prefs]);

  const update = useCallback(<K extends keyof ReplayWorkspacePrefs>(key: K, value: ReplayWorkspacePrefs[K]) => {
    setPrefs((p) => (p[key] === value ? p : { ...p, [key]: value }));
  }, []);

  return { prefs, update, hydrated: hydrated.current };
}
