/** Simple TTL cache used by the engine and providers. */
export class TTLCache<T> {
  private store = new Map<string, { value: T; expires: number; storedAt: number }>();
  constructor(private defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      // Keep the entry so `getStale()` can serve it during provider outages.
      return undefined;
    }
    return hit.value;
  }

  /**
   * Read an entry regardless of expiry. Used only for explicit degraded
   * responses, where the caller labels the data as stale for the user.
   */
  getStale(key: string, maxAgeMs?: number): { value: T; ageMs: number } | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    const ageMs = Date.now() - hit.storedAt;
    if (maxAgeMs !== undefined && ageMs > maxAgeMs) {
      this.store.delete(key);
      return undefined;
    }
    return { value: hit.value, ageMs };
  }

  set(key: string, value: T, ttlMs?: number) {
    const now = Date.now();
    this.store.set(key, { value, expires: now + (ttlMs ?? this.defaultTtlMs), storedAt: now });
  }

  delete(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  size() { return this.store.size; }
}

