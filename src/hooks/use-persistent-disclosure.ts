import { useCallback, useEffect, useState } from "react";

/**
 * Boolean open/closed state persisted to localStorage under a stable key.
 * Used across the app to remember a user's expand/collapse choices for
 * progressive-disclosure surfaces so beginners see essentials and power
 * users don't have to re-expand every visit.
 */
export function usePersistentDisclosure(
  key: string,
  defaultOpen = false,
): [boolean, (v: boolean) => void, () => void] {
  const storageKey = `thv:disclose:${key}`;
  const [open, setOpenState] = useState<boolean>(defaultOpen);

  // Hydrate after mount to avoid SSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "1") setOpenState(true);
      else if (raw === "0") setOpenState(false);
    } catch { /* noop */ }
  }, [storageKey]);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try { localStorage.setItem(storageKey, v ? "1" : "0"); } catch { /* noop */ }
  }, [storageKey]);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  return [open, setOpen, toggle];
}
