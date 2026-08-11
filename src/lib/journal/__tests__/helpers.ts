import { zonedParts } from "@/lib/analytics/periods";

/** Weekday index (0=Sun) in `tz` — the shape `buildDataset` expects. */
export function weekdayIndex(epochMs: number, tz: string): number {
  return zonedParts(epochMs, tz).weekday;
}
