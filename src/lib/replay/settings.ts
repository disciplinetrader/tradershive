/**
 * Replay Trading Settings
 * ----------------------------------------------------------------------------
 * Per-user preferences that shape how the Replay engine executes trades.
 * Persisted in localStorage so selections carry across sessions without a
 * round-trip. Reads/writes are guarded so SSR never touches window.
 *
 * These settings only control execution *behavior* — they do NOT change the
 * schema of replay_trades or any server function contract. Backward compat:
 * unknown/absent keys fall back to DEFAULTS.
 */
import { useCallback, useEffect, useState } from "react";

export type TradingMode = "netting" | "hedging";

export type ReplaySettings = {
  /** Netting = 1 net position per symbol; Hedging = multiple positions allowed */
  tradingMode: TradingMode;
  /** Default lot size prefilled in the order ticket */
  defaultLotSize: number;
  /** Default risk % prefilled in the order ticket */
  defaultRiskPct: number;
  /** Commission per lot per side (currency units) */
  commissionPerLot: number;
  /** Spread applied to market entries (price units) */
  spread: number;
  /** Reserved for future — slippage in price units */
  slippage: number;
};

export const DEFAULT_REPLAY_SETTINGS: ReplaySettings = {
  tradingMode: "hedging",
  defaultLotSize: 1,
  defaultRiskPct: 1,
  commissionPerLot: 0,
  spread: 0,
  slippage: 0,
};

const STORAGE_KEY = "traders-hive:replay-settings:v1";

function readFromStorage(): ReplaySettings {
  if (typeof window === "undefined") return DEFAULT_REPLAY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REPLAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReplaySettings>;
    return { ...DEFAULT_REPLAY_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_REPLAY_SETTINGS;
  }
}

function writeToStorage(next: ReplaySettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Notify other tabs / hooks in this tab
    window.dispatchEvent(new CustomEvent("replay-settings-changed", { detail: next }));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

/**
 * React hook wrapping the persisted Replay settings.
 * All Replay components should read execution preferences from here so a
 * setting change immediately propagates through the running session.
 */
export function useReplaySettings(): {
  settings: ReplaySettings;
  updateSettings: (patch: Partial<ReplaySettings>) => void;
  resetSettings: () => void;
} {
  // SSR-safe: start with defaults, hydrate from storage on mount.
  const [settings, setSettings] = useState<ReplaySettings>(DEFAULT_REPLAY_SETTINGS);

  useEffect(() => {
    setSettings(readFromStorage());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ReplaySettings>).detail;
      if (detail) setSettings(detail);
      else setSettings(readFromStorage());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(readFromStorage());
    };
    window.addEventListener("replay-settings-changed", onChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("replay-settings-changed", onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<ReplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeToStorage(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    writeToStorage(DEFAULT_REPLAY_SETTINGS);
    setSettings(DEFAULT_REPLAY_SETTINGS);
  }, []);

  return { settings, updateSettings, resetSettings };
}
