/**
 * useAutosave — debounced, optimistic field-level autosave.
 *
 * Wraps a mutation function and returns a `save(patch)` callable that:
 *   - merges pending patches (last write wins per field)
 *   - flushes after `delay` ms of inactivity
 *   - exposes a status ("idle" | "saving" | "saved" | "error") for the
 *     save indicator, and retries once on transient failure
 *   - flushes immediately on `flush()` or on unmount
 *
 * Autosave replaces the explicit Save button. The consumer is expected
 * to update local state optimistically and let this hook reconcile
 * with the server in the background.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutosave<Patch extends Record<string, unknown>>(
  save: (patch: Patch) => Promise<unknown>,
  opts: { delay?: number; retry?: boolean } = {},
) {
  const { delay = 700, retry = true } = opts;
  const pendingRef = useRef<Patch | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    if (!patch || savingRef.current) return;
    pendingRef.current = null;
    savingRef.current = true;
    setStatus("saving");
    setError(null);
    try {
      await saveRef.current(patch);
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (err) {
      setError(err as Error);
      if (retry) {
        try {
          await new Promise((r) => setTimeout(r, 400));
          await saveRef.current(patch);
          setStatus("saved");
          setLastSavedAt(Date.now());
          setError(null);
        } catch (err2) {
          setError(err2 as Error);
          setStatus("error");
        }
      } else {
        setStatus("error");
      }
    } finally {
      savingRef.current = false;
      // Chain the next queued patch if consumers wrote during the round-trip.
      if (pendingRef.current) void flush();
    }
  }, [retry]);

  const schedule = useCallback(
    (patch: Patch) => {
      pendingRef.current = { ...(pendingRef.current ?? ({} as Patch)), ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { save: schedule, flush, status, error, lastSavedAt };
}
