/**
 * OrderManager — the primary interface between the UI and the
 * TradingEngine. Wraps the engine to add:
 *
 *   - Managed order lifecycle + audit trail
 *   - Preflight validation
 *   - Multi-target bracket plans
 *   - Trailing stop watcher
 *   - Break-even automation
 *   - High-level position actions (partial / increase / reduce / reverse)
 *
 * The engine remains the single source of truth for balance, margin, and
 * positions. The manager only orchestrates.
 */

import type {
  AccountConfig, AccountSnapshot, Order, OrderIntent, Position, TradingEngine,
} from "@/lib/trading-engine";
import { preflight, type PreflightReport } from "./preflight";
import { AuditLog, createRecord, transition, type ManagedOrderRecord } from "./lifecycle";
import {
  bracketSummary, createBracket, findFiringTargets, markTargetFilled,
} from "./brackets";
import { computeTrailingStop, shouldTightenStop } from "./trailing";
import { evaluateBreakEven, moveToBreakEven } from "./breakeven";
import { computeMetrics, buildIntentFromTicket } from "./ticket";
import type {
  BracketPlan, BreakEvenConfig, TicketInput, TicketMetrics,
  TrailingConfig,
} from "./types";

export type ManagedOrder = ManagedOrderRecord & {
  intent: OrderIntent;
  order?: Order;
  brackets?: BracketPlan | null;
  trailing?: TrailingConfig | null;
  breakEven?: BreakEvenConfig | null;
};

export type PlaceResult = {
  ok: boolean;
  preflight: PreflightReport;
  managed?: ManagedOrder;
  order?: Order;
  message?: string;
};

export type PositionAdjustment = {
  positionId: string;
  kind: "modify_stops" | "partial_close" | "increase" | "reduce" | "reverse" | "close" | "break_even";
  data?: Record<string, unknown>;
};

export class OrderManager {
  readonly engine: TradingEngine;
  private orders = new Map<string, ManagedOrder>();
  private byPosition = new Map<string, ManagedOrder[]>();
  readonly globalAudit = new AuditLog();

  constructor(engine: TradingEngine) {
    this.engine = engine;
  }

  /* ------------------------------------------------------------- ticket */

  quote(input: TicketInput): TicketMetrics {
    const snap = this.engine.snapshot();
    const price = this.engine.getPrice(input.symbol) ?? input.entryPrice ?? 0;
    return computeMetrics(input, this.engine.getConfig(), snap, price);
  }

  /* -------------------------------------------------------------- place */

  place(input: TicketInput): PlaceResult {
    const config: AccountConfig = this.engine.getConfig();
    const snapshot: AccountSnapshot = this.engine.snapshot();
    const livePrice = this.engine.getPrice(input.symbol) ?? input.entryPrice ?? 0;
    const metrics = computeMetrics(input, config, snapshot, livePrice);
    const intent = buildIntentFromTicket(input, metrics);
    const report = preflight(config, snapshot, intent, livePrice);

    if (!report.ok) {
      this.globalAudit.record("rejected", `Preflight failed: ${report.errors.join(", ")}`);
      return { ok: false, preflight: report, message: report.errors.join(", ") };
    }

    const { order } = this.engine.submitOrder(intent);
    const record = createRecord(order.id, input.clientId);
    const managed: ManagedOrder = {
      ...record,
      intent,
      order,
      brackets: input.brackets ?? null,
      trailing: input.trailing ?? null,
      breakEven: input.breakEven ?? null,
    };

    transition(managed, "validated", "preflight passed");
    transition(managed, "accepted", "engine accepted intent");

    if (order.status === "rejected") {
      transition(managed, "rejected", order.reject_reason ?? "engine rejected");
      managed.audit.record("rejected", order.reject_reason ?? "engine rejected");
    } else if (order.status === "working") {
      transition(managed, "pending", "resting order in book");
      managed.audit.record("accepted", `Pending ${input.kind} @ ${intent.limit_price ?? intent.stop_price}`);
    } else if (order.status === "filled") {
      transition(managed, "filled", "market order filled");
      managed.audit.record("filled", `Filled at ${order.filled_price}`);
      if (order.position_id) this.linkOrderToPosition(order.position_id, managed);
    }

    this.orders.set(order.id, managed);
    return { ok: true, preflight: report, managed, order };
  }

  /* -------------------------------------------------------- modify order */

  modifyPending(orderId: string, patch: {
    limit_price?: number | null;
    stop_price?: number | null;
    stop_loss?: number | null;
    take_profit?: number | null;
    quantity?: number;
  }): boolean {
    const managed = this.orders.get(orderId);
    if (!managed || !managed.order) return false;
    if (managed.order.status !== "working") return false;
    Object.assign(managed.order, patch);
    Object.assign(managed.intent, patch);
    transition(managed, "modified", "pending order modified");
    managed.audit.record("modified", "Pending order modified", patch);
    return true;
  }

  cancel(orderId: string, reason = "user cancelled"): boolean {
    const managed = this.orders.get(orderId);
    if (!managed) return false;
    const cancelled = this.engine.cancelOrder(orderId);
    if (!cancelled) return false;
    transition(managed, "cancelled", reason);
    managed.audit.record("cancelled", reason);
    return true;
  }

  /* ----------------------------------------------------- position actions */

  modifyStops(positionId: string, patch: { stop_loss?: number | null; take_profit?: number | null }): Position | null {
    const p = this.engine.modifyStops(positionId, patch);
    if (p) this.recordPositionEvent(positionId, "modified", "SL/TP modified", patch);
    return p;
  }

  partialClose(positionId: string, fraction: number): Position | null {
    const price = this.priceForPosition(positionId);
    if (price == null) return null;
    const p = this.engine.partialClose(positionId, fraction, price);
    if (p) this.recordPositionEvent(positionId, "partial_close",
      `Closed ${Math.round(fraction * 100)}%`, { fraction, price });
    return p;
  }

  close(positionId: string): Position | null {
    const price = this.priceForPosition(positionId);
    if (price == null) return null;
    const p = this.engine.closePosition(positionId, price, "manual");
    if (p) this.recordPositionEvent(positionId, "closed", "Position closed manually", { price });
    return p;
  }

  increase(positionId: string, quantity: number): PlaceResult {
    const pos = this.engine.getPositions().find((p) => p.id === positionId);
    if (!pos) return this.dummyResult("Unknown position");
    return this.place({
      symbol: pos.symbol, side: pos.side, kind: "market",
      sizing: { mode: "fixed_lots", lots: quantity },
    });
  }

  reduce(positionId: string, quantity: number): PlaceResult {
    const pos = this.engine.getPositions().find((p) => p.id === positionId);
    if (!pos) return this.dummyResult("Unknown position");
    const opp = pos.side === "long" ? "short" : "long";
    const qty = Math.min(quantity, pos.quantity);
    return this.place({
      symbol: pos.symbol, side: opp, kind: "market",
      sizing: { mode: "fixed_lots", lots: qty },
      reduceOnly: true,
    });
  }

  reverse(positionId: string): PlaceResult {
    const pos = this.engine.getPositions().find((p) => p.id === positionId);
    if (!pos) return this.dummyResult("Unknown position");
    const opp = pos.side === "long" ? "short" : "long";
    return this.place({
      symbol: pos.symbol, side: opp, kind: "market",
      sizing: { mode: "fixed_lots", lots: pos.quantity * 2 },
    });
  }

  breakEven(positionId: string, offsetPips = 0): Position | null {
    const pos = this.engine.getPositions().find((p) => p.id === positionId);
    if (!pos) return null;
    const sl = moveToBreakEven(pos.symbol, pos.side, pos.entry_price, offsetPips);
    const p = this.engine.modifyStops(positionId, { stop_loss: sl });
    if (p) this.recordPositionEvent(positionId, "break_even_activated",
      `Break even set at ${sl.toFixed(5)}`, { sl });
    return p;
  }

  attachBracket(positionId: string, fractions: number[], prices: number[]): BracketPlan {
    const plan = createBracket(fractions, prices);
    const managed = this.firstManagedFor(positionId);
    if (managed) managed.brackets = plan;
    return plan;
  }

  attachTrailing(positionId: string, config: TrailingConfig): void {
    const managed = this.firstManagedFor(positionId);
    if (managed) managed.trailing = config;
  }

  attachBreakEven(positionId: string, config: BreakEvenConfig): void {
    const managed = this.firstManagedFor(positionId);
    if (managed) managed.breakEven = config;
  }

  /* ------------------------------------------------------- price handling */

  /**
   * Push a price into the engine, then react to bracket, trailing, and
   * break-even conditions for positions attached to that symbol.
   */
  onPrice(symbol: string, price: number): AccountSnapshot {
    const snap = this.engine.onPrice(symbol, price);
    for (const pos of this.engine.getPositions()) {
      if (pos.symbol !== symbol) continue;
      if (pos.status !== "open" && pos.status !== "partially_closed") continue;
      const managed = this.firstManagedFor(pos.id);
      if (!managed) continue;

      // Break-even
      if (managed.breakEven && !managed.breakEven.fired) {
        const r = evaluateBreakEven(managed.breakEven, {
          symbol: pos.symbol, side: pos.side, entry: pos.entry_price,
          stop: pos.stop_loss, price,
        });
        if (r.activated && r.newStopLoss != null) {
          managed.breakEven = r.config;
          this.engine.modifyStops(pos.id, { stop_loss: r.newStopLoss });
          this.recordPositionEvent(pos.id, "break_even_activated",
            `Auto break-even @ ${r.newStopLoss.toFixed(5)}`);
        }
      }

      // Trailing stop
      if (managed.trailing) {
        const r = computeTrailingStop(managed.trailing, pos.side, price);
        managed.trailing = r.next;
        if (r.newStopLoss != null && shouldTightenStop(pos.side, pos.stop_loss, r.newStopLoss)) {
          this.engine.modifyStops(pos.id, { stop_loss: r.newStopLoss });
          this.recordPositionEvent(pos.id, "trailing_stop_updated",
            `Trailing stop → ${r.newStopLoss.toFixed(5)}`);
        }
      }

      // Bracket targets
      if (managed.brackets) {
        const firing = findFiringTargets(managed.brackets, pos.side, price);
        for (const t of firing) {
          const before = pos.realized_pnl;
          this.engine.partialClose(pos.id, t.fraction, t.price, "take_profit");
          const after = this.engine.getPositions().find((x) => x.id === pos.id)?.realized_pnl ?? before;
          managed.brackets = markTargetFilled(managed.brackets, t.id, after - before);
          this.recordPositionEvent(pos.id, "partial_close",
            `TP target @ ${t.price} (${Math.round(t.fraction * 100)}%)`);
        }
      }
    }
    return snap;
  }

  onQuotes(map: Record<string, number>): AccountSnapshot {
    let snap = this.engine.snapshot();
    for (const [s, p] of Object.entries(map)) {
      if (p > 0) snap = this.onPrice(s, p);
    }
    return snap;
  }

  /* ----------------------------------------------------------- accessors */

  listOrders(): ManagedOrder[] { return Array.from(this.orders.values()); }
  getOrder(id: string): ManagedOrder | null { return this.orders.get(id) ?? null; }
  getAuditForOrder(id: string) { return this.orders.get(id)?.audit.list() ?? []; }
  getBracketSummary(positionId: string) {
    const m = this.firstManagedFor(positionId);
    return m?.brackets ? bracketSummary(m.brackets) : null;
  }

  /* ------------------------------------------------------------ internals */

  private linkOrderToPosition(positionId: string, managed: ManagedOrder): void {
    const bucket = this.byPosition.get(positionId) ?? [];
    bucket.push(managed);
    this.byPosition.set(positionId, bucket);
  }

  private firstManagedFor(positionId: string): ManagedOrder | null {
    const bucket = this.byPosition.get(positionId);
    return bucket?.[0] ?? null;
  }

  private recordPositionEvent(
    positionId: string, kind: Parameters<AuditLog["record"]>[0], message: string,
    detail?: Record<string, unknown>,
  ): void {
    this.globalAudit.record(kind, `[pos ${positionId}] ${message}`, detail);
    const bucket = this.byPosition.get(positionId) ?? [];
    for (const m of bucket) m.audit.record(kind, message, detail);
  }

  private priceForPosition(positionId: string): number | null {
    const pos = this.engine.getPositions().find((p) => p.id === positionId);
    if (!pos) return null;
    return this.engine.getPrice(pos.symbol) ?? pos.entry_price;
  }

  private dummyResult(message: string): PlaceResult {
    return {
      ok: false, message,
      preflight: {
        ok: false, errors: [message], warnings: [],
        required_margin: 0, free_margin_after: 0, risk_amount: 0,
        risk_pct: 0, liquidation_price: null, buying_power_after: 0,
        fill_price: 0, cost_estimate: 0,
        session_open: false, instrument_status: "unknown",
      },
    };
  }
}
