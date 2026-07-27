/**
 * QA Mode — hidden developer overlay toggle.
 *
 * Persisted in localStorage under `th:qa-mode`. Only surfaced when the current
 * user is an admin OR we are running in dev (import.meta.env.DEV).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

const STORAGE_KEY = "th:qa-mode";
const EVT = "th:qa-mode-change";

export function isQaModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setQaModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useQaMode() {
  const { isAdmin } = useAuth();
  const available = isAdmin || import.meta.env.DEV;
  const [enabled, setEnabled] = useState<boolean>(() => isQaModeEnabled());

  useEffect(() => {
    const onChange = () => setEnabled(isQaModeEnabled());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return {
    available,
    enabled: available && enabled,
    toggle: (next?: boolean) => setQaModeEnabled(next ?? !enabled),
  };
}
