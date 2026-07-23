/**
 * Production observability entry point.
 *
 * Call {@link initObservability} once from the client root. It boots every
 * probe that has its feature flag enabled — Web Vitals, API monitor, resource
 * health — and installs error forwarding via {@link installGlobalErrorHandlers}.
 * All signals converge on the shared telemetry sink so a single subscriber can
 * ship them anywhere later without touching call sites.
 */
import { installGlobalErrorHandlers } from "@/lib/lovable-error-reporting";

import { installApiMonitor } from "./api-monitor";
import { isEnabled } from "./feature-flags";
import { startResourceHealth } from "./resource-health";
import { startWebVitals } from "./web-vitals";

let booted = false;

export function initObservability(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;

  if (isEnabled("obs.errorReporting")) installGlobalErrorHandlers();
  startWebVitals();
  installApiMonitor();
  startResourceHealth();
}

export { setTelemetryUser, getRecentEvents } from "./sink";
export { isEnabled, setFlag, listFlags } from "./feature-flags";
export { trackChannelStatus, subscribeAndTrack } from "./realtime-health";
