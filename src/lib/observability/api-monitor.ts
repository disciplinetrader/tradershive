/**
 * API performance monitor.
 *
 * Wraps `window.fetch` once at startup to record duration, status, and
 * failure of every network call. Slow requests (>{@link SLOW_MS}) and
 * failed responses (network error or >=500) are emitted as telemetry so
 * regressions in server function latency surface without a proxy or APM.
 *
 * Requests to browser-extension URLs and Lovable's own telemetry endpoints
 * are skipped to avoid noise.
 */
import { isEnabled } from "./feature-flags";
import { emit } from "./sink";

const SLOW_MS = 2000;
const TIMEOUT_MS = 15000;

let installed = false;

function shouldSkip(url: string): boolean {
  return (
    url.startsWith("chrome-extension:") ||
    url.startsWith("moz-extension:") ||
    url.includes("/__lovable") ||
    url.includes("lovable.dev/telemetry")
  );
}

function urlOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return (input as Request).url;
  } catch {
    return "unknown";
  }
}

export function installApiMonitor(): void {
  if (installed || typeof window === "undefined") return;
  if (!isEnabled("obs.apiMonitor")) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function monitoredFetch(input, init) {
    const url = urlOf(input as RequestInfo);
    if (shouldSkip(url)) return originalFetch(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const start = performance.now();
    let timedOut = false;

    // Passive monitoring only: never abort the caller's request. Injecting our
    // own AbortController here cancelled in-flight server-function calls and
    // surfaced as "TypeError: Failed to fetch" in the app.
    const timer = window.setTimeout(() => {
      timedOut = true;
      emit("api", "slow", { value: TIMEOUT_MS, data: { url, method, status: 0 } });
    }, TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await originalFetch(input as RequestInfo, init);
      } catch (err) {
        // One retry for transient network blips (server-fn RPC calls fail with
        // "Failed to fetch" during HMR reloads / brief connectivity drops).
        const retryable =
          !init?.signal?.aborted && /Failed to fetch|NetworkError|Load failed/i.test(String(err));
        if (!retryable) throw err;
        await new Promise((r) => window.setTimeout(r, 400));
        response = await originalFetch(input as RequestInfo, init);
      }
      const duration = performance.now() - start;


      if (response.status >= 500) {
        emit("api", "server_error", {
          value: duration,
          data: { url, method, status: response.status },
        });
      } else if (duration > SLOW_MS) {
        emit("api", "slow", {
          value: duration,
          data: { url, method, status: response.status },
        });
      }
      return response;
    } catch (err) {
      const duration = performance.now() - start;
      emit("api", timedOut ? "timeout" : "network_error", {
        value: duration,
        data: { url, method, message: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  } as typeof window.fetch;
}
