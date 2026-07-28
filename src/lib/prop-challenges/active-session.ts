/**
 * Active Prop Challenge — persistent per-user selection that binds the
 * Trading Workspace to a specific challenge. When set, every closed paper
 * trade on the challenge's linked account automatically ticks its progress.
 *
 * Single source of truth: `localStorage.th_active_prop_challenge` (a JSON
 * blob with `{ id, paper_account_id }`). Multiple tabs stay in sync via
 * the browser's native `storage` event.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "th_active_prop_challenge";
const EVENT = "th:active-prop-challenge";

export type ActivePropChallenge = {
  id: string;
  paper_account_id: string | null;
};

function readRaw(): ActivePropChallenge | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivePropChallenge;
    if (!parsed?.id) return null;
    return { id: parsed.id, paper_account_id: parsed.paper_account_id ?? null };
  } catch {
    return null;
  }
}

export function getActivePropChallenge(): ActivePropChallenge | null {
  return readRaw();
}

export function setActivePropChallenge(v: ActivePropChallenge): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    if (v.paper_account_id) {
      window.localStorage.setItem("th_paper_account", v.paper_account_id);
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function clearActivePropChallenge(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

/** React hook — subscribes to same-tab and cross-tab updates. */
export function useActivePropChallenge(): {
  active: ActivePropChallenge | null;
  setActive: (v: ActivePropChallenge) => void;
  clear: () => void;
} {
  const [active, setState] = useState<ActivePropChallenge | null>(null);

  useEffect(() => {
    setState(readRaw());
    const sync = () => setState(readRaw());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setActive = useCallback((v: ActivePropChallenge) => {
    setActivePropChallenge(v);
    setState(v);
  }, []);
  const clear = useCallback(() => {
    clearActivePropChallenge();
    setState(null);
  }, []);

  return { active, setActive, clear };
}
