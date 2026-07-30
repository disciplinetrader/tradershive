/**
 * Persistent Replay workspace preferences (Replay Studio X).
 *
 * Everything the trader touches in the workspace is restored on return:
 * dock open state, active dock tab, dock height, HUD visibility, playback
 * speed, and legacy side-rail values. Debounced (150ms) to keep
 * localStorage writes cheap during drag/resize.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RX } from "@/lib/replay/design-tokens";

export type ReplaySideTab = "trade" | "notes";
export type ReplayDockTab = "trades" | "journal" | "coach" | "marks" | "results";
/** Studio X Phase 2 — how orders are entered: on the chart, or in the panel. */
export type ReplayTradeMode = "chart" | "panel";

export type ReplayWorkspacePrefs = {
  /** legacy right-rail state — kept so older sessions restore cleanly */
  sideOpen: boolean;
  sideTab: ReplaySideTab;
  railWidth: number;
  /** Studio X */
  speed: number;
  dockOpen: boolean;
  dockTab: ReplayDockTab;
  dockHeight: number;
  hudVisible: boolean;
  /** Chart-native trading (default) vs classic panel trading. */
  tradeMode: ReplayTradeMode;
  /** Floating order ticket visibility in chart-trading mode. */
  ticketOpen: boolean;
};

const STORAGE_KEY = "thive.replay.workspace.prefs.v4";
const LEGACY_KEYS = [
  "thive.replay.workspace.prefs.v3",
  "thive.replay.workspace.prefs.v2",
  "thive.replay.workspace.prefs.v1",
];
const VALID_TABS: ReplaySideTab[] = ["trade", "notes"];
const VALID_DOCK_TABS: ReplayDockTab[] = ["trades", "journal", "coach", "marks", "results"];
const VALID_SPEEDS = new Set([0.5, 1, 2, 4, 8, 16, 32, 64]);

export const RAIL_MIN = 280;
export const RAIL_DEFAULT = 360;
export const RAIL_MAX = 420;

const DEFAULTS: ReplayWorkspacePrefs = {
  sideOpen: false,
  sideTab: "trade",
  railWidth: RAIL_DEFAULT,
  speed: 1,
  dockOpen: false,
  dockTab: "trades",
  dockHeight: RX.dockDefaultH,
  hudVisible: true,
  tradeMode: "chart",
  ticketOpen: true,
};

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
};

function readStorage(): ReplayWorkspacePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    for (const k of LEGACY_KEYS) {
      if (raw) break;
      raw = window.localStorage.getItem(k);
    }
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReplayWorkspacePrefs>;
    const merged: ReplayWorkspacePrefs = { ...DEFAULTS, ...parsed };
    if (!VALID_TABS.includes(merged.sideTab)) merged.sideTab = "trade";
    if (!VALID_DOCK_TABS.includes(merged.dockTab)) merged.dockTab = "trades";
    if (!VALID_SPEEDS.has(merged.speed)) merged.speed = 1;
    merged.sideOpen = !!merged.sideOpen;
    merged.dockOpen = !!merged.dockOpen;
    merged.hudVisible = merged.hudVisible !== false;
    if (merged.tradeMode !== "panel") merged.tradeMode = "chart";
    merged.ticketOpen = merged.ticketOpen !== false;
    merged.railWidth = clamp(merged.railWidth, RAIL_MIN, RAIL_MAX, RAIL_DEFAULT);
    merged.dockHeight = clamp(merged.dockHeight, RX.dockMinH, RX.dockMaxH, RX.dockDefaultH);
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
      let next: any = value;
      if (key === "railWidth") next = clamp(value as number, RAIL_MIN, RAIL_MAX, RAIL_DEFAULT);
      if (key === "dockHeight") next = clamp(value as number, RX.dockMinH, RX.dockMaxH, RX.dockDefaultH);
      return p[key] === next ? p : { ...p, [key]: next };
    });
  }, []);

  return { prefs, update, hydrated: hydrated.current };
}
