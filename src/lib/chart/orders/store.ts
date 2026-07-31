/**
 * Pending order store — React-free observable with per-symbol localStorage
 * persistence, mirroring the DrawingStore so orders survive refresh, replay,
 * zoom, pan and timeframe changes exactly like the drawings they reference.
 *
 * Phase 2 keeps everything local: nothing here talks to an execution API.
 */

import type { PositionOrder } from "./model";

type Listener = () => void;

function storageKey(scope: string) {
  return `thive.chart.orders.${scope}`;
}

export class PositionOrderStore {
  private orders: PositionOrder[] = [];
  private listeners = new Set<Listener>();
  private scope = "default";

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const l of this.listeners) l(); }

  list() { return this.orders; }
  /** Current persistence scope (symbol). */
  scopeValue() { return this.scope; }
  pending() { return this.orders.filter((o) => o.status === "pending"); }
  byId(id: string) { return this.orders.find((o) => o.id === id) ?? null; }
  byDrawing(drawingId: string) {
    return this.orders.find((o) => o.drawingId === drawingId && o.status === "pending") ?? null;
  }

  setScope(scope: string) {
    if (scope === this.scope) return;
    this.persist();
    this.scope = scope;
    this.orders = this.read();
    this.emit();
  }

  hydrate(scope: string) {
    this.scope = scope;
    this.orders = this.read();
    this.emit();
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

  persist() {
    if (typeof window === "undefined") return;
    (window as any).__persistLog = [...((window as any).__persistLog ?? []), { scope: this.scope, n: this.orders.length, stack: new Error().stack?.split('\n').slice(1,6).join(' | ') }];
    try {
      window.localStorage.setItem(storageKey(this.scope), JSON.stringify(this.orders));
    } catch { /* quota */ }
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
  reconcile(drawingIds: Set<string>) {
    const next = this.orders.filter((o) => drawingIds.has(o.drawingId));
    if (next.length === this.orders.length) return;
    this.orders = next;
    this.persist();
    this.emit();
  }
}

/** Shared singleton — the chart, ticket and tables all read the same state. */
export const positionOrderStore = new PositionOrderStore();
