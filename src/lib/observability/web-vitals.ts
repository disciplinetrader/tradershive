/**
 * Web Vitals capture.
 *
 * Uses the `web-vitals` library to observe LCP, INP, CLS, FCP, and TTFB with
 * Google-recommended thresholds. Each metric is emitted once when its value
 * stabilizes (page hidden or navigation), rated `good | needs-improvement |
 * poor`, and forwarded to the shared telemetry sink for trend analysis.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

import { isEnabled } from "./feature-flags";
import { emit } from "./sink";

let started = false;

function handle(metric: Metric) {
  emit("web_vital", metric.name, {
    value: metric.value,
    data: {
      rating: metric.rating,
      id: metric.id,
      delta: metric.delta,
      navigationType: metric.navigationType,
    },
  });
}

export function startWebVitals(): void {
  if (started || typeof window === "undefined") return;
  if (!isEnabled("obs.webVitals")) return;
  started = true;
  onLCP(handle);
  onINP(handle);
  onCLS(handle);
  onFCP(handle);
  onTTFB(handle);
}
