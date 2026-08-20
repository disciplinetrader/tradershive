/**
 * Session display metadata for the market-data layer.
 *
 * ── This file no longer decides anything ───────────────────────────────────
 *
 * It used to carry a SECOND implementation of the session rule: fixed UTC
 * minutes plus a `weekdays` array, evaluated by a local `inWindow`. Commit
 * `0281df96` ("five session definitions become one") consolidated four
 * consumers onto `@/lib/market-sessions` and missed this one, so two rules
 * survived and disagreed — see MD-6.
 *
 * The irony worth recording: this module's weekday model was the CORRECT half
 * of that disagreement. It reported nothing active on a Saturday while the
 * canonical rule reported `london_ny_overlap`. That model has been ported into
 * `market-sessions` (expressed as each centre's LOCAL Monday-to-Friday, which
 * makes the ragged UTC week edges fall out for free), and the rule here is
 * deleted rather than kept in sync.
 *
 * What remains is metadata: names, colours, and the market each centre serves.
 * `getActiveSessions` and `getNextSession` now delegate.
 */
import type { SessionWindow } from "./types";
import {
  SESSION_HOURS,
  SESSION_LABELS,
  activeSessions as canonicalActive,
  nextSessionOpen,
  type SessionKey,
} from "@/lib/market-sessions";

/** Display order, and the colour each centre is drawn with. */
const DISPLAY: { key: SessionKey; color: string }[] = [
  { key: "sydney", color: "#22c55e" },
  { key: "tokyo", color: "#3b82f6" },
  { key: "london", color: "#a855f7" },
  { key: "new_york", color: "#ef4444" },
];

/**
 * The four FX centres, as display metadata.
 *
 * `openUtcMinute` / `closeUtcMinute` are NOMINAL — each centre's local hours
 * rendered as if it were on standard time. They are here because
 * `SessionWindow` is the shape four providers return from `getSessions()`, and
 * they are safe only for labelling. **Nothing may compute with them:** they are
 * an hour out for half the year, which is the entire reason
 * `@/lib/market-sessions` resolves hours per-instant in each centre's own zone.
 *
 * `weekdays` is likewise nominal. The authoritative gate is each centre's LOCAL
 * weekday, which a UTC array cannot express — Sydney's local Monday begins on
 * Sunday in UTC.
 */
export const DEFAULT_SESSIONS: SessionWindow[] = DISPLAY.map(({ key, color }) => {
  const { zone, open, close } = SESSION_HOURS[key];
  return {
    code: key,
    name: SESSION_LABELS[key],
    market: "forex",
    zone,
    openUtcMinute: open * 60,
    closeUtcMinute: close * 60,
    weekdays: [1, 2, 3, 4, 5],
    color,
  };
});

const BY_KEY = new Map(DEFAULT_SESSIONS.map((s) => [s.code, s]));

/** Centres trading right now. Delegates — no rule lives here. */
export function getActiveSessions(now: Date = new Date()): SessionWindow[] {
  return canonicalActive(now)
    .map((k) => BY_KEY.get(k))
    .filter((s): s is SessionWindow => Boolean(s));
}

/**
 * The soonest upcoming open across all four centres.
 *
 * Weekend-correct for free: `nextSessionOpen` skips opens that do not happen,
 * so asking on a Saturday returns Sydney's local Monday open — which is Sunday
 * evening in UTC, and is genuinely the next time anything trades.
 */
export function getNextSession(
  now: Date = new Date(),
): { session: SessionWindow; opensInMinutes: number } | null {
  let best: { session: SessionWindow; opensInMinutes: number } | null = null;

  for (const s of DEFAULT_SESSIONS) {
    const at = nextSessionOpen(s.code as SessionKey, now);
    if (!at) continue;
    const opensInMinutes = Math.round((at.getTime() - now.getTime()) / 60_000);
    if (opensInMinutes < 0) continue;
    if (!best || opensInMinutes < best.opensInMinutes) best = { session: s, opensInMinutes };
  }

  return best;
}
