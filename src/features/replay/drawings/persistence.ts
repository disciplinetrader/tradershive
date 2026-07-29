/**
 * Session-scoped drawing persistence.
 *
 * Drawings are keyed by replay session id and stored in localStorage. Coord
 * space is (timeMs, price) so they remain valid across zoom/pan/resize and
 * on reload. Malformed payloads are discarded silently to avoid crashing
 * the workspace on schema drift.
 */
import type { Drawing } from "./types";

const KEY = (sessionId: string) => `thive.replay.drawings.v1.${sessionId}`;

export function loadDrawings(sessionId: string): Drawing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidDrawing) as Drawing[];
  } catch {
    return [];
  }
}

export function saveDrawings(sessionId: string, drawings: Drawing[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(sessionId), JSON.stringify(drawings));
  } catch {
    /* quota exceeded — ignore */
  }
}

function isValidDrawing(d: unknown): d is Drawing {
  if (!d || typeof d !== "object") return false;
  const x = d as any;
  if (typeof x.id !== "string" || typeof x.kind !== "string") return false;
  const anchor = (a: any) => a && typeof a.t === "number" && typeof a.p === "number";
  switch (x.kind) {
    case "trend_line":
    case "rectangle":
    case "fibonacci":
      return anchor(x.a) && anchor(x.b);
    case "horizontal_ray":
      return anchor(x.a);
    default:
      return false;
  }
}
