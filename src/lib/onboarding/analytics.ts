/**
 * Onboarding analytics – lightweight client-side event tracking.
 *
 * Events are stored in localStorage under `thv:onboarding:events` so QA Mode
 * and the Admin Dashboard can visualise the funnel without a dedicated
 * table. If a `window.plausible` or `window.gtag` bridge is available, we
 * forward the event to it too.
 */

export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_skipped"
  | "onboarding_completed"
  | "first_backtest_launched"
  | "tour_started"
  | "tour_completed";

export type OnboardingEventPayload = {
  event: OnboardingEvent;
  step?: string;
  meta?: Record<string, unknown>;
  ts: number;
};

const KEY = "thv:onboarding:events";
const MAX_EVENTS = 250;

export function trackOnboarding(
  event: OnboardingEvent,
  extra: { step?: string; meta?: Record<string, unknown> } = {},
) {
  if (typeof window === "undefined") return;
  const payload: OnboardingEventPayload = {
    event,
    step: extra.step,
    meta: extra.meta,
    ts: Date.now(),
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: OnboardingEventPayload[] = raw ? JSON.parse(raw) : [];
    list.push(payload);
    while (list.length > MAX_EVENTS) list.shift();
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage disabled — ignore */
  }
  // Optional forwarders (no-op when absent).
  const w = window as unknown as {
    plausible?: (e: string, opts?: { props?: Record<string, unknown> }) => void;
    gtag?: (...args: unknown[]) => void;
  };
  try {
    w.plausible?.(event, { props: { step: extra.step, ...(extra.meta ?? {}) } });
    w.gtag?.("event", event, { step: extra.step, ...(extra.meta ?? {}) });
  } catch {
    /* ignore */
  }
}

export function readOnboardingEvents(): OnboardingEventPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OnboardingEventPayload[]) : [];
  } catch {
    return [];
  }
}

export function clearOnboardingEvents() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
