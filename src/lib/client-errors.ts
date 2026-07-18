/**
 * Client-side error helpers.
 *
 * Normalizes anything thrown by a server function, fetch, or Supabase call
 * into a human-readable message and (optionally) surfaces it via toast.
 *
 * The server sanitizes messages before they reach the client (see
 * `src/lib/server-errors.ts`), so `getErrorMessage` is always safe to display.
 */
import { toast } from "sonner";

export type ClientErrorLike = {
  code?: string;
  message?: string;
  details?: unknown;
  status?: number;
};

const FALLBACK = "Something went wrong. Please try again.";

/** Best-effort extraction of a user-safe message from any thrown value. */
export function getErrorMessage(err: unknown, fallback = FALLBACK): string {
  if (!err) return fallback;
  if (typeof err === "string") return err.trim() || fallback;
  if (err instanceof Error) return err.message?.trim() || fallback;
  if (typeof err === "object") {
    const e = err as ClientErrorLike & { error?: { message?: string } };
    return (
      e.message?.trim() ||
      e.error?.message?.trim() ||
      fallback
    );
  }
  return fallback;
}

/** Best-effort extraction of a machine code (unauthorized/forbidden/…). */
export function getErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as ClientErrorLike).code;
  return typeof code === "string" ? code : undefined;
}

export function isUnauthorized(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code === "unauthorized" || code === "forbidden") return true;
  const status = (err as ClientErrorLike | null)?.status;
  return status === 401 || status === 403;
}

/**
 * Show an error toast with a normalized message. Always logs the raw error
 * to the console so devs still get the stack trace.
 */
export function showError(err: unknown, opts?: { title?: string; fallback?: string }) {
  const msg = getErrorMessage(err, opts?.fallback);
  console.error("[client-error]", err);
  toast.error(opts?.title ?? msg, opts?.title ? { description: msg } : undefined);
  return msg;
}

/**
 * Wrap an async operation so any throw shows a toast and resolves to
 * `{ ok: false }`. Useful in event handlers where you don't want to
 * re-throw and unmount.
 */
export async function tryAsync<T>(
  op: () => Promise<T>,
  opts?: { title?: string; fallback?: string; onError?: (e: unknown) => void },
): Promise<{ ok: true; data: T } | { ok: false; error: unknown }> {
  try {
    const data = await op();
    return { ok: true, data };
  } catch (error) {
    showError(error, opts);
    opts?.onError?.(error);
    return { ok: false, error };
  }
}
