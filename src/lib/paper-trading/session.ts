/**
 * Session state for the trading UI — which centres are open right now, and
 * whether they overlap.
 *
 * A view of the canonical rule in `@/lib/market-sessions`. The windows used to
 * be defined here in fixed UTC hours, which made the Session badge on every
 * position and blotter row an hour wrong from October to March.
 */
import {
  sessionAt,
  activeSessions as canonicalActiveSessions,
  SESSION_HOURS,
  SESSION_LABELS,
  type SessionKey,
} from "@/lib/market-sessions";

export type { SessionKey };

const LABELS: Record<SessionKey, string> = {
  sydney: SESSION_LABELS.sydney,
  tokyo: SESSION_LABELS.tokyo,
  london: SESSION_LABELS.london,
  new_york: SESSION_LABELS.new_york,
};

export function activeSessions(date: Date | string | number = new Date()): SessionKey[] {
  return canonicalActiveSessions(date);
}

export type SessionInfo = {
  primary: SessionKey | "off_hours";
  active: SessionKey[];
  overlap: boolean;
  label: string;
};

export function detectSession(date: Date | string | number = new Date()): SessionInfo {
  const active = activeSessions(date);
  if (active.length === 0) {
    return { primary: "off_hours", active, overlap: false, label: "Off-hours" };
  }

  // `sessionAt` already encodes the priority (overlap > NY > London > Tokyo >
  // Sydney); deriving `primary` from it rather than re-listing the order here
  // is what stops this module drifting from the rule again.
  const label = sessionAt(date);
  const primary: SessionKey =
    label === "london_ny_overlap" ? "new_york"
      : label === "off_hours" ? active[0]
        : label;

  const overlap = active.length >= 2;
  return {
    primary,
    active,
    overlap,
    label: overlap ? `${active.map((k) => LABELS[k]).join(" × ")} overlap` : LABELS[primary],
  };
}

export const SESSION_LABEL = LABELS;
/** Local trading hours per centre, for anything that needs to render them. */
export const SESSION_WINDOWS = SESSION_HOURS;
