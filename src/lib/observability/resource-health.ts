/**
 * Resource health probes.
 *
 * - Long task observer flags any main-thread block >50ms (spec threshold),
 *   which correlates with INP regressions.
 * - Memory sampler polls Chromium's `performance.memory.usedJSHeapSize` at a
 *   low frequency (60s) and flags growth above {@link MEMORY_ALERT_MB}, which
 *   surfaces slow leaks in long-lived sessions like Trading Workspace.
 * Both probes are cheap and opt-out via feature flags.
 */
import { isEnabled } from "./feature-flags";
import { emit } from "./sink";

const MEMORY_ALERT_MB = 400;
const MEMORY_INTERVAL_MS = 60_000;

let started = false;

type ChromiumPerformance = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
};

export function startResourceHealth(): { dispose: () => void } {
  if (started || typeof window === "undefined") return { dispose: () => {} };
  started = true;

  const disposers: Array<() => void> = [];

  if (isEnabled("obs.longTasks") && "PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 50) continue;
          emit("resource", "long_task", {
            value: entry.duration,
            data: { name: entry.name, startTime: entry.startTime },
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      disposers.push(() => observer.disconnect());
    } catch {
      /* longtask entry type unsupported (Safari) */
    }
  }

  if (isEnabled("obs.memorySampling")) {
    const perf = performance as ChromiumPerformance;
    if (perf.memory) {
      const timer = window.setInterval(() => {
        const mem = (performance as ChromiumPerformance).memory;
        if (!mem) return;
        const usedMb = mem.usedJSHeapSize / (1024 * 1024);
        emit("resource", "memory_sample", {
          value: usedMb,
          data: { limitMb: mem.jsHeapSizeLimit / (1024 * 1024) },
        });
        if (usedMb > MEMORY_ALERT_MB) {
          emit("resource", "memory_high", { value: usedMb });
        }
      }, MEMORY_INTERVAL_MS);
      disposers.push(() => window.clearInterval(timer));
    }
  }

  return {
    dispose() {
      for (const fn of disposers) fn();
      started = false;
    },
  };
}
