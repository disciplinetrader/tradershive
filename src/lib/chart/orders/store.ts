/**
 * Pending order store — React-free observable with per-symbol localStorage
 * persistence, mirroring the DrawingStore so orders survive refresh, replay,
 * zoom, pan and timeframe changes exactly like the drawings they reference.
 *
 * Phase 8 adds an optional durable mirror (`attachRemote`) so a pending order
 * or an OPEN position — including its full execution tape — survives a new
 * device or a cleared cache. Local state stays authoritative for rendering;
 * the mirror is best-effort and resolves conflicts last-write-wins on the
 * client `updatedAt` stamp.
 */

import type { PositionOrder } from "./model";
import { isLive } from "./lifecycle";
import { isSyncable, type OrderRemote } from "./order-sync";
import { trace } from "./debug";

type Listener = () => void;

export type HydrationStatus = "idle" | "hydrating" | "hydrated" | "failed";

function storageKey(scope: string) {
  return `thive.chart.orders.${scope}`;
}

export class PositionOrderStore {
  private orders: PositionOrder[] = [];
  private listeners = new Set<Listener>();
  private scope = "default";
  private status: HydrationStatus = "idle";
  private remote: OrderRemote | null = null;
  /** id → last `updatedAt` pushed remotely, so mirroring stays idempotent. */
  private pushed = new Map<string, number>();


  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const l of this.listeners) l(); }

  list() { return this.orders; }
  /** Current persistence scope (symbol). */
  scopeValue() { return this.scope; }
  /** Explicit hydration state — never infer hydration from list length. */
  hydration(): HydrationStatus { return this.status; }
  pending() { return this.orders.filter((o) => o.status === "pending"); }
  /** Live, market-exposed positions (Phase 3). */
  positions() { return this.orders.filter((o) => isLive(o.status)); }
  /** Closed but not yet archived — the session's result tape. */
  closed() { return this.orders.filter((o) => o.status === "closed"); }
  byId(id: string) { return this.orders.find((o) => o.id === id) ?? null; }
  byDrawing(drawingId: string) {
    return this.orders.find((o) => o.drawingId === drawingId && o.status === "pending") ?? null;
  }
  /** The live position attached to a drawing, if any. */
  positionByDrawing(drawingId: string) {
    return this.orders.find((o) => o.drawingId === drawingId && isLive(o.status)) ?? null;
  }
  /** Anything still actionable on this drawing: pending order or live position. */
  activeByDrawing(drawingId: string) {
    return this.positionByDrawing(drawingId) ?? this.byDrawing(drawingId);
  }


  setScope(scope: string) {
    if (scope === this.scope && this.status === "hydrated") return;
    trace({ op: "setScope", source: "orderStore", scope, prev: this.orders.length, reason: `from ${this.scope} (${this.status})` });
    // Only flush the outgoing scope when it actually held hydrated state.
    // Persisting an un-hydrated (empty) list would erase the stored orders.
    if (this.status === "hydrated" && scope !== this.scope) this.persist("scope-change");
    this.scope = scope;
    this.hydrate(scope);
  }

  hydrate(scope: string) {
    this.scope = scope;
    this.status = "hydrating";
    this.orders = this.read();
    this.pushed.clear();
    this.status = "hydrated";
    trace({ op: "hydrate", source: "orderStore", scope, next: this.orders.length });
    this.emit();
    void this.syncRemote(scope);
  }

  /**
   * Attach the durable backend. Safe to call repeatedly; attaching syncs the
   * current scope so a fresh device recovers open positions immediately.
   */
  attachRemote(remote: OrderRemote) {
    if (this.remote === remote) return;
    this.remote = remote;
    if (this.status === "hydrated") void this.syncRemote(this.scope);
  }

  /**
   * Two-way reconcile for one scope. The execution tape is append-only, so
   * the record with the newer client `updatedAt` is a strict superset and
   * last-write-wins is lossless. Terminal orders are never resurrected.
   */
  private async syncRemote(scope: string) {
    const remote = this.remote;
    if (!remote) return;
    let incoming: PositionOrder[] = [];
    try {
      incoming = await remote.pull(scope);
    } catch { return; }
    if (this.scope !== scope || this.status !== "hydrated") return;

    const byId = new Map(this.orders.map((o) => [o.id, o]));
    let changed = false;

    for (const r of incoming) {
      if (!isSyncable(r)) { void remote.remove(r.id).catch(() => {}); continue; }
      const local = byId.get(r.id);
      if (!local) { byId.set(r.id, r); changed = true; continue; }
      // Terminal locally → the server copy is stale; drop it there.
      if (!isSyncable(local)) { void remote.remove(r.id).catch(() => {}); continue; }
      if ((r.updatedAt ?? 0) > (local.updatedAt ?? 0)) { byId.set(r.id, r); changed = true; }
      this.pushed.set(r.id, r.updatedAt ?? 0);
    }

    if (changed) {
      this.orders = [...byId.values()];
      this.persistLocal("remote-sync");
      this.emit();
    }
    this.mirror();
    trace({
      op: "remote:sync", source: "orderStore", scope,
      next: this.orders.length, reason: `pulled=${incoming.length}`,
    });
  }

  /** Push local changes up: new/updated syncable orders, drops for the rest. */
  private mirror() {
    const remote = this.remote;
    if (!remote || this.status !== "hydrated") return;
    const seen = new Set<string>();
    for (const order of this.orders) {
      seen.add(order.id);
      if (!isSyncable(order)) {
        if (this.pushed.has(order.id)) {
          this.pushed.delete(order.id);
          void remote.remove(order.id).catch(() => {});
        }
        continue;
      }
      const stamp = order.updatedAt ?? order.createdAt ?? 0;
      if (this.pushed.get(order.id) === stamp) continue;
      this.pushed.set(order.id, stamp);
      void remote.upsert(order).catch(() => {});
    }
    for (const id of [...this.pushed.keys()]) {
      if (seen.has(id)) continue;
      this.pushed.delete(id);
      void remote.remove(id).catch(() => {});
    }
  }

  private read(): PositionOrder[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey(this.scope));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PositionOrder[]) : [];
    } catch { return []; }
  }

  private persistLocal(reason: string) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(this.scope), JSON.stringify(this.orders));
      trace({ op: "persist", source: "orderStore", scope: this.scope, next: this.orders.length, reason });
    } catch { /* quota */ }
  }

  persist(reason = "write") {
    // Never let an un-hydrated store overwrite persisted state.
    if (this.status !== "hydrated") {
      trace({ op: "persist:skipped", source: "orderStore", scope: this.scope, next: this.orders.length, reason: `status=${this.status}` });
      return;
    }
    this.persistLocal(reason);
    this.mirror();
  }



  /** Idempotent by drawing: a drawing can only carry one pending order. */
  add(order: PositionOrder) {
    const existing = this.byDrawing(order.drawingId);
    if (existing) {
      this.replace({ ...order, id: existing.id, createdAt: existing.createdAt });
      return existing.id;
    }
    this.orders = [...this.orders, order];
    this.persist();
    this.emit();
    return order.id;
  }

  replace(order: PositionOrder) {
    this.orders = this.orders.map((o) => (o.id === order.id ? order : o));
    this.persist();
    this.emit();
  }

  update(id: string, patch: Partial<PositionOrder>) {
    this.orders = this.orders.map((o) =>
      o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o,
    );
    this.persist();
    this.emit();
  }

  cancel(id: string) {
    const now = Date.now();
    this.orders = this.orders.map((o) =>
      o.id === id ? { ...o, status: "cancelled" as const, cancelledAt: now, updatedAt: now } : o,
    );
    this.persist();
    this.emit();
  }

  remove(id: string) {
    this.orders = this.orders.filter((o) => o.id !== id);
    this.persist();
    this.emit();
  }

  /** Drop orders whose drawing no longer exists (drawing deleted / cleared). */
  reconcile(drawingIds: Set<string>, source = "unknown") {
    if (this.status !== "hydrated") {
      trace({ op: "reconcile:skipped", source, scope: this.scope, reason: `orders ${this.status}` });
      return;
    }
    // A live position outlives its drawing: deleting the chart object must
    // never silently vaporise market exposure. It can only leave via an
    // explicit close, so live orders are exempt from reconciliation.
    const next = this.orders.filter((o) => drawingIds.has(o.drawingId) || isLive(o.status));
    if (next.length === this.orders.length) return;
    trace({
      op: "reconcile", source, scope: this.scope,
      prev: this.orders.length, next: next.length,
      extra: { drawingIds: [...drawingIds] },
    });
    this.orders = next;
    this.persist("reconcile");
    this.emit();
  }

}

/** Shared singleton — the chart, ticket and tables all read the same state. */
export const positionOrderStore = new PositionOrderStore();
