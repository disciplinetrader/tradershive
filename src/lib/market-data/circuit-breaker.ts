/**
 * Provider circuit breaker.
 *
 * Providers can be "up" on paper (`status() !== "disabled"`) while failing
 * every request — rate limits (HTTP 429), upstream outages, expired keys.
 * The breaker records runtime outcomes so the engine can route to a
 * fallback provider *before* the user sees an error, and can recover
 * automatically once the upstream is healthy again.
 *
 * States:
 *   closed    — normal operation
 *   open      — too many consecutive failures; provider is skipped
 *   half-open — cool-down elapsed; one trial request is allowed through
 */

export type BreakerState = "closed" | "open" | "half-open";

export type BreakerSnapshot = {
  code: string;
  state: BreakerState;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  lastError: string | null;
  openedAt: number | null;
  retryAt: number | null;
};

const FAILURE_THRESHOLD = 3;
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

type Entry = {
  consecutiveFailures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  trips: number;
};

export class CircuitBreakerRegistry {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(s: BreakerSnapshot) => void>();

  private entry(code: string): Entry {
    let e = this.entries.get(code);
    if (!e) {
      e = { consecutiveFailures: 0, openedAt: null, lastFailureAt: null, lastError: null, trips: 0 };
      this.entries.set(code, e);
    }
    return e;
  }

  private cooldown(e: Entry): number {
    return Math.min(BASE_COOLDOWN_MS * 2 ** Math.max(0, e.trips - 1), MAX_COOLDOWN_MS);
  }

  state(code: string, now = Date.now()): BreakerState {
    const e = this.entries.get(code);
    if (!e || e.openedAt === null) return "closed";
    return now - e.openedAt >= this.cooldown(e) ? "half-open" : "open";
  }

  /** True when a request is allowed to reach this provider. */
  canRequest(code: string, now = Date.now()): boolean {
    return this.state(code, now) !== "open";
  }

  recordSuccess(code: string) {
    const e = this.entry(code);
    if (e.consecutiveFailures === 0 && e.openedAt === null) return;
    e.consecutiveFailures = 0;
    e.openedAt = null;
    e.lastError = null;
    e.trips = 0;
    this.emit(code);
  }

  recordFailure(code: string, error: unknown, now = Date.now()) {
    const e = this.entry(code);
    e.consecutiveFailures += 1;
    e.lastFailureAt = now;
    e.lastError = error instanceof Error ? error.message : String(error);
    if (e.consecutiveFailures >= FAILURE_THRESHOLD && e.openedAt === null) {
      e.openedAt = now;
      e.trips += 1;
      console.warn(`[market-data] circuit OPEN for "${code}" after ${e.consecutiveFailures} failures: ${e.lastError}`);
    } else if (e.openedAt !== null) {
      // Failed the half-open trial — re-open with a longer cool-down.
      e.openedAt = now;
      e.trips += 1;
    }
    this.emit(code);
  }

  snapshot(code: string, now = Date.now()): BreakerSnapshot {
    const e = this.entry(code);
    return {
      code,
      state: this.state(code, now),
      consecutiveFailures: e.consecutiveFailures,
      lastFailureAt: e.lastFailureAt,
      lastError: e.lastError,
      openedAt: e.openedAt,
      retryAt: e.openedAt === null ? null : e.openedAt + this.cooldown(e),
    };
  }

  all(now = Date.now()): BreakerSnapshot[] {
    return [...this.entries.keys()].map((c) => this.snapshot(c, now));
  }

  reset(code?: string) {
    if (code) this.entries.delete(code);
    else this.entries.clear();
  }

  onChange(fn: (s: BreakerSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(code: string) {
    const snap = this.snapshot(code);
    for (const l of this.listeners) { try { l(snap); } catch { /* noop */ } }
  }
}

export const breakers = new CircuitBreakerRegistry();
