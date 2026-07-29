import * as React from "react";

const KEY = "th.auth.signup-draft.v1";

// Never persist these — even to localStorage
const REDACT = new Set(["password", "confirm_password"]);

export type SignupDraft = Record<string, unknown>;

function read(): SignupDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as SignupDraft;
  } catch {
    /* ignore */
  }
  return null;
}

function write(data: SignupDraft) {
  if (typeof window === "undefined") return;
  try {
    const safe: SignupDraft = {};
    for (const [k, v] of Object.entries(data)) {
      if (REDACT.has(k)) continue;
      if (v === undefined || v === null || v === "") continue;
      safe[k] = v;
    }
    if (Object.keys(safe).length === 0) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, JSON.stringify(safe));
    }
  } catch {
    /* ignore */
  }
}

export function loadSignupDraft(): SignupDraft | null {
  return read();
}

export function clearSignupDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Debounced persistence for a react-hook-form `watch()` object.
 * Password fields are stripped before write.
 */
export function useSignupDraftPersistence(values: Record<string, unknown>, enabled = true) {
  React.useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => write(values), 300);
    return () => clearTimeout(t);
  }, [values, enabled]);
}
