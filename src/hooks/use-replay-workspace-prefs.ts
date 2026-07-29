/**
 * Persistent Replay workspace preferences.
 *
 * Scoped to Replay Studio so the trader resumes exactly where they left off:
 * side rail state, active tab, playback speed, and right-rail width.
 * Debounced (150ms) to keep localStorage writes cheap during drag/resize.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ReplaySideTab = "trade" | "notes";

export type ReplayWorkspacePrefs = {
  sideOpen: boolean;
  sideTab: ReplaySideTab;
  speed: number;
  railWidth: number;
};

const STORAGE_KEY = "thive.replay.workspace.prefs.v2";
const LEGACY_KEY = "thive.replay.workspace.prefs.v1";
const VALID_TABS: ReplaySideTab[] = ["trade", "notes"];
const VALID_SPEEDS = new Set([0.5, 1, 2, 4, 8, 16, 32, 64]);

export const RAIL_MIN = 280;
export const RAIL_DEFAULT = 360;
export const RAIL_MAX = 420;

const DEFAULTS: ReplayWorkspacePrefs = {
  sideOpen: true,
  sideTab: "trade",
  speed: 1,
  railWidth: RAIL_DEFAULT,
};

function clampWidth(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : RAIL_DEFAULT;
  return Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(v)));
}

function readStorage(): ReplayWorkspacePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReplayWorkspacePrefs>;
    const merged: ReplayWorkspacePrefs = { ...DEFAULTS, ...parsed };
    if (!VALID_TABS.includes(merged.sideTab)) merged.sideTab = "trade";
    if (!VALID_SPEEDS.has(merged.speed)) merged.speed = 1;
    merged.sideOpen = !!merged.sideOpen;
    merged.railWidth = clampWidth(merged.railWidth);
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
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* quota */ }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [prefs]);

  const update = useCallback(<K extends keyof ReplayWorkspacePrefs>(key: K, value: ReplayWorkspacePrefs[K]) => {
    setPrefs((p) => {
      const next = key === "railWidth" ? clampWidth(value as number) : (value as any);
      return p[key] === next ? p : { ...p, [key]: next };
    });
  }, []);

  return { prefs, update, hydrated: hydrated.current };
}
