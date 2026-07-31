/**
 * Closed-trade store — canonical, append-mostly historical tape.
 *
 * Mirrors `PositionOrderStore` (same scoping, same hydration gating, same
 * localStorage discipline) but with a fundamentally different contract:
 *
 *   · orders are mutable working state, trades are historical records
 *   · a trade is written exactly once, keyed by `positionId`
 *   · nothing here can rewrite execution facts — the only mutators are
 *     `linkJournal()` and `setArchived()`
 *   · reconciliation never deletes a trade; deleting a drawing or archiving
 *     an order leaves the trade untouched
 */

import type { ClosedTrade } from "./closed-trade";
import { trace } from "./debug";

type Listener = () => void;

export type HydrationStatus = "idle" | "hydrating" | "hydrated" | "failed";

function storageKey(scope: string) {
  return `thive.chart.trades.${scope}`;
}

export class ClosedTradeStore {
  private trades: ClosedTrade[] = [];
  private listeners = new Set<Listener>();
  private scope = "default";
  private status: HydrationStatus = "idle";

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const l of this.listeners) l(); }

  list() { return this.trades; }
  scopeValue() { return this.scope; }
  hydration(): HydrationStatus { return this.status; }

  /** Newest first — the natural reading order of a result tape. */
  recent() {
    return [...this.trades].filter((t) => !t.archivedAt).sort((a, b) => b.closedAt - a.closedAt);
  }

  archived() {
    return [...this.trades].filter((t) => !!t.archivedAt).sort((a, b) => b.closedAt - a.closedAt);
  }

  byId(id: string) { return this.trades.find((t) => t.id === id) ?? null; }
  /** The idempotency key: one trade per position, forever. */
  byPosition(positionId: string) {
    return this.trades.find((t) => t.positionId === positionId) ?? null;
  }
  byOrder(orderId: string) { return this.trades.find((t) => t.orderId === orderId) ?? null; }
  byDrawing(drawingId: string) {
    return this.trades.find((t) => t.drawingId === drawingId) ?? null;
  }

  setScope(scope: string) {
    if (scope === this.scope && this.status === "hydrated") return;
    if (this.status === "hydrated" && scope !== this.scope) this.persist("scope-change");
    this.scope = scope;
    this.hydrate(scope);
  }

  hydrate(scope: string) {
    this.scope = scope;
    this.status = "hydrating";
    this.trades = this.read();
    this.status = "hydrated";
    trace({ op: "hydrate", source: "tradeStore", scope, next: this.trades.length });
    this.emit();
  }

  private read(): ClosedTrade[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey(this.scope));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ClosedTrade[]) : [];
    } catch { return []; }
  }

  persist(reason = "write") {
    if (typeof window === "undefined") return;
    if (this.status !== "hydrated") {
      trace({ op: "persist:skipped", source: "tradeStore", scope: this.scope, reason: `status=${this.status}` });
      return;
    }
    try {
      window.localStorage.setItem(storageKey(this.scope), JSON.stringify(this.trades));
      trace({ op: "persist", source: "tradeStore", scope: this.scope, next: this.trades.length, reason });
    } catch { /* quota */ }
  }

  /**
   * Idempotent insert. A second attempt for the same `positionId` returns the
   * record that already exists rather than creating a duplicate — this is the
   * guard against repeated ticks, React re-renders, refresh and retries.
   */
  add(trade: ClosedTrade): { trade: ClosedTrade; created: boolean } {
    const existing = this.byPosition(trade.positionId);
    if (existing) return { trade: existing, created: false };
    this.trades = [...this.trades, trade];
    this.persist("add");
    this.emit();
    return { trade, created: true };
  }

  /** The ONLY journal mutator. Execution fields are untouchable. */
  linkJournal(tradeId: string, journalEntryId: string): ClosedTrade | null {
    const current = this.byId(tradeId);
    if (!current) return null;
    const next: ClosedTrade = { ...current, journalEntryId, journalStatus: "linked" };
    this.trades = this.trades.map((t) => (t.id === tradeId ? next : t));
    this.persist("link-journal");
    this.emit();
    return next;
  }

  /** Archive / un-archive. Storage and journal links are always retained. */
  setArchived(tradeId: string, archived: boolean, now = Date.now()): ClosedTrade | null {
    const current = this.byId(tradeId);
    if (!current) return null;
    const next: ClosedTrade = { ...current, archivedAt: archived ? now : undefined };
    this.trades = this.trades.map((t) => (t.id === tradeId ? next : t));
    this.persist("archive");
    this.emit();
    return next;
  }

  /** Test-only reset. Never called from product code. */
  reset(scope = "default") {
    this.trades = [];
    this.scope = scope;
    this.status = "hydrated";
    this.emit();
  }
}

export const closedTradeStore = new ClosedTradeStore();
