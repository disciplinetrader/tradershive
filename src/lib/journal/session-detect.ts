/**
 * Journal V2 — session detection, mapped onto the `journal_session` DB enum.
 *
 * The rule itself lives in `@/lib/market-sessions` and is mirrored in SQL by
 * `public.detect_session()` for the draft trigger; both are held together by
 * `check:sessions`. This module is only the enum adapter.
 *
 * It used to carry its own fixed-UTC windows. Two consequences of that, both
 * measured on the live journal 2026-08-16:
 *
 *  · The windows were the summer values, so every label written between the
 *    October and March transitions was an hour out — latent in the data only
 *    because every entry in it happened to be from northern summer.
 *  · Nothing was returned at all for 21:00-22:00 UTC, an hour-shaped hole in
 *    every session report. The canonical rule labels every hour.
 */
import { sessionAt, type SessionLabel } from "@/lib/market-sessions";

export type SessionValue =
  | "sydney"
  | "tokyo"
  | "asia"
  | "london"
  | "london_ny_overlap"
  | "new_york"
  | "custom";

/**
 * `null` means no session was open, and is what the column stores for it.
 *
 * Deliberately not the `asia` enum value: `asia` is a legacy member no detector
 * has ever produced (Tokyo always outranked it), and `custom` belongs to the
 * user, not to us.
 */
export function detectSession(
  openedAt: Date | string | null | undefined,
): SessionValue | null {
  if (!openedAt) return null;
  const label: SessionLabel = sessionAt(openedAt);
  return label === "off_hours" ? null : label;
}

/** Guess the browser's IANA timezone; falls back to UTC when unavailable. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
