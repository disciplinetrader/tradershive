/**
 * §16 Analytics cache.
 *
 * Cached results are DISPOSABLE derived data. Canonical records remain the
 * source of truth, so the cache is memory-only (never persisted) and any
 * change to an input silently produces a different key rather than being
 * patched in place.
 *
 * Key = account scope · trade version · journal version · filters · timezone
 *       · resolution · min sample.
 */

import { filtersFingerprint, type AnalyticsFilters } from "./filters";
import { runAnalytics, type AnalyticsResult, type EngineOptions } from "./engine";
import type { AnalyticsDataset } from "./model";

export function analyticsCacheKey(
  dataset: AnalyticsDataset,
  filters: AnalyticsFilters,
  options: EngineOptions = {},
): string {
  const scope = filters.accounts.length ? [...filters.accounts].sort().join("+") : "all";
  return [
    scope,
    dataset.tradeVersion,
    dataset.journalVersion,
    dataset.timezone,
    options.resolution ?? "trade",
    options.minSample ?? "default",
    filtersFingerprint(filters),
  ].join("::");
}

const MAX_ENTRIES = 12;

export class AnalyticsCache {
  private entries = new Map<string, AnalyticsResult>();

  get(key: string): AnalyticsResult | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    // Refresh LRU position.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key: string, value: AnalyticsResult): void {
    this.entries.set(key, value);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest == null) break;
      this.entries.delete(oldest);
    }
  }

  /** Drop everything — used when the dataset identity changes wholesale. */
  clear(): void {
    this.entries.clear();
  }

  /** Drop every entry whose key no longer matches the live versions. */
  invalidateStale(dataset: AnalyticsDataset): void {
    const stamp = `::${dataset.tradeVersion}::${dataset.journalVersion}::`;
    for (const key of [...this.entries.keys()]) {
      if (!key.includes(stamp)) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export const analyticsCache = new AnalyticsCache();

/** Memoized engine run. Identical inputs return the identical object. */
export function runAnalyticsCached(
  dataset: AnalyticsDataset,
  filters: AnalyticsFilters,
  options: EngineOptions = {},
  cache: AnalyticsCache = analyticsCache,
): AnalyticsResult {
  const key = analyticsCacheKey(dataset, filters, options);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = runAnalytics(dataset, filters, options);
  cache.set(key, result);
  return result;
}

/**
 * Version stamps derived from the canonical records themselves — cheap,
 * deterministic and automatically different after an add / archive / edit.
 */
export function tradeVersionOf(records: readonly { tradeId: string; exitTime: number; netPnl: number; archived: boolean }[]): string {
  let h = 0;
  for (const r of records) {
    const s = `${r.tradeId}:${r.exitTime}:${r.netPnl}:${r.archived ? 1 : 0}`;
    for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `${records.length}.${h >>> 0}`;
}

export function journalVersionOf(entries: readonly { id: string; updated_at: string }[]): string {
  let h = 0;
  for (const e of entries) {
    const s = `${e.id}:${e.updated_at}`;
    for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `${entries.length}.${h >>> 0}`;
}
