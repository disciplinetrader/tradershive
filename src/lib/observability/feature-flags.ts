/**
 * Lightweight feature flag registry.
 *
 * Flags are declared in {@link DEFAULT_FLAGS} with a compile-time-safe default.
 * Runtime overrides live in `localStorage` under `th:flags` as a JSON object of
 * `{ [flag]: boolean }`. Overrides are read once at startup and cached; call
 * {@link setFlag} to update them from devtools or an admin toggle without
 * redeploying.
 *
 * Usage:
 *   import { isEnabled } from "@/lib/observability/feature-flags";
 *   if (isEnabled("obs.longTasks")) { ... }
 */

export const DEFAULT_FLAGS = {
  /** Emit Web Vitals to the analytics sink. */
  "obs.webVitals": true,
  /** Track slow / failed API calls via the fetch monitor. */
  "obs.apiMonitor": true,
  /** Monitor realtime channel connection health. */
  "obs.realtimeHealth": true,
  /** Observe long tasks (>50ms) via PerformanceObserver. */
  "obs.longTasks": true,
  /** Sample JS heap usage periodically (Chromium only). */
  "obs.memorySampling": true,
  /** Ship errors to the Lovable telemetry sink. */
  "obs.errorReporting": true,
} as const;

export type FeatureFlag = keyof typeof DEFAULT_FLAGS;

const STORAGE_KEY = "th:flags";

let overrides: Partial<Record<FeatureFlag, boolean>> | null = null;

function loadOverrides(): Partial<Record<FeatureFlag, boolean>> {
  if (overrides) return overrides;
  overrides = {};
  if (typeof window === "undefined") return overrides;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) overrides = JSON.parse(raw) ?? {};
  } catch {
    /* ignore */
  }
  return overrides!;
}

export function isEnabled(flag: FeatureFlag): boolean {
  const o = loadOverrides();
  if (flag in o && typeof o[flag] === "boolean") return o[flag]!;
  return DEFAULT_FLAGS[flag];
}

export function setFlag(flag: FeatureFlag, value: boolean | null): void {
  if (typeof window === "undefined") return;
  const o = loadOverrides();
  if (value === null) delete o[flag];
  else o[flag] = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export function listFlags(): Array<{ flag: FeatureFlag; enabled: boolean; overridden: boolean }> {
  const o = loadOverrides();
  return (Object.keys(DEFAULT_FLAGS) as FeatureFlag[]).map((flag) => ({
    flag,
    enabled: isEnabled(flag),
    overridden: flag in o,
  }));
}

// Expose to devtools for zero-friction toggling in production.
if (typeof window !== "undefined") {
  (window as unknown as { __thFlags?: unknown }).__thFlags = { isEnabled, setFlag, listFlags };
}
