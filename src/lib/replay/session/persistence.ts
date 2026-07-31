/**
 * Phase 8A · durable session state.
 *
 * The snapshot rides in `replay_sessions.settings.engine_v1`, alongside the
 * denormalised cursor/speed/completion columns the library UI already reads.
 * Local storage is the fast path; the server is the cross-device truth.
 */

import { getReplaySession, updateReplaySession } from "@/lib/replay.functions";
import { SNAPSHOT_SETTINGS_KEY, type SessionSnapshot } from "./model";
import { pickFreshestSnapshot } from "./resume";

const localKey = (sessionId: string) => `thive.replay.session.${sessionId}`;

export function readLocalSnapshot(sessionId: string): SessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localKey(sessionId));
    return raw ? (JSON.parse(raw) as SessionSnapshot) : null;
  } catch {
    return null;
  }
}

export function writeLocalSnapshot(snapshot: SessionSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localKey(snapshot.meta.id), JSON.stringify(snapshot));
  } catch {
    /* quota — the server copy remains authoritative */
  }
}

export function clearLocalSnapshot(sessionId: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(localKey(sessionId)); } catch { /* ignore */ }
}

/** Writer for the AutosaveEngine: local first (instant), then server. */
export async function persistSnapshot(snapshot: SessionSnapshot): Promise<void> {
  writeLocalSnapshot(snapshot);
  await updateReplaySession({
    data: {
      id: snapshot.meta.id,
      playback_speed: snapshot.clock.speed,
      completion_pct: Math.round(
        (snapshot.clock.cursor / Math.max(1, snapshot.meta.dataset.observationCount)) * 100,
      ),
      duration_seconds: Math.round(snapshot.clock.elapsedMs / 1000),
      status: snapshot.meta.lifecycle === "completed" ? "completed" : "active",
      settings: { [SNAPSHOT_SETTINGS_KEY]: snapshot as unknown as Record<string, unknown> },
    },
  });
}

/** Newest of the local and server snapshots — the cross-device resume point. */
export async function loadSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
  const local = readLocalSnapshot(sessionId);
  let remote: SessionSnapshot | null = null;
  try {
    const res = await getReplaySession({ data: { id: sessionId } });
    const settings = (res?.session?.settings ?? {}) as Record<string, unknown>;
    const candidate = settings[SNAPSHOT_SETTINGS_KEY];
    if (candidate && typeof candidate === "object") remote = candidate as SessionSnapshot;
  } catch {
    /* offline — fall back to the local copy */
  }
  return pickFreshestSnapshot(local, remote);
}
