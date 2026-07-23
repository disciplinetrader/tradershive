/**
 * Telemetry sink.
 *
 * Observability signals (web vitals, API timings, realtime events, resource
 * health) all funnel through {@link emit}. In the Lovable editor preview we
 * forward to `window.__lovableEvents` when available; in production we buffer
 * events in a bounded ring so devtools / an admin panel can inspect them
 * without a third-party service.
 *
 * The sink is intentionally dependency-free — swapping in a real analytics
 * backend later only requires editing `dispatch()`.
 */

export type TelemetryCategory =
  | "web_vital"
  | "api"
  | "realtime"
  | "resource"
  | "error"
  | "flag";

export type TelemetryEvent = {
  category: TelemetryCategory;
  name: string;
  value?: number;
  route?: string;
  userId?: string;
  data?: Record<string, unknown>;
  at: number;
};

const RING_SIZE = 200;
const ring: TelemetryEvent[] = [];

let currentUserId: string | undefined;
export function setTelemetryUser(userId: string | undefined) {
  currentUserId = userId;
}

function currentRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname + window.location.search;
}

type LovableAnalytics = { track?: (name: string, data?: Record<string, unknown>) => void };

function dispatch(evt: TelemetryEvent) {
  if (typeof window === "undefined") return;
  const bag = (window as unknown as { __lovableEvents?: LovableAnalytics }).__lovableEvents;
  bag?.track?.(`th.${evt.category}.${evt.name}`, {
    value: evt.value,
    route: evt.route,
    userId: evt.userId,
    ...evt.data,
  });
}

export function emit(
  category: TelemetryCategory,
  name: string,
  payload: { value?: number; data?: Record<string, unknown> } = {},
): void {
  const evt: TelemetryEvent = {
    category,
    name,
    value: payload.value,
    data: payload.data,
    route: currentRoute(),
    userId: currentUserId,
    at: Date.now(),
  };
  if (ring.length >= RING_SIZE) ring.shift();
  ring.push(evt);
  dispatch(evt);
}

export function getRecentEvents(): TelemetryEvent[] {
  return ring.slice();
}

// Expose ring buffer for devtools inspection.
if (typeof window !== "undefined") {
  (window as unknown as { __thTelemetry?: unknown }).__thTelemetry = {
    events: getRecentEvents,
    emit,
  };
}
