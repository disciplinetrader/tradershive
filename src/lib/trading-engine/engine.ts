/**
 * Trading Engine — in-memory orchestrator.
 *
 * Owns account balance, open positions, resting orders, and a typed event
 * stream. Consumes price ticks via `onPrice(symbol, price)`. It is the
 * single source of truth for every trading surface (Trading Workspace,
 * Replay, Analytics, Journal, Championships, AI Coach) that reads live
 * simulated state.
 *
 * Design constraints:
 *  - Does NOT fetch market data (see Yahoo Finance layer).
 *  - Does NOT persist. Server functions handle DB writes; this engine can
 *    be hydrated from DB rows via `hydrate()`.
 *  - Every state change goes through a public method that returns a
 *    snapshot AND emits a typed event.
 *  - All math delegated to the shared paper-trading calculators so the
 *    engine and legacy server functions agree.
 */

import { findSymbol } from "@/lib/paper-trading/symbols";
import {
  pnl as computePnl, marginRequired, notionalValue,
} from "@/lib/paper-trading/calculations";
import { liquidationPrice, sortForStopOut } from "@/lib/paper-trading/risk";

import {
  effectiveLeverage, maintenanceMargin,
} from "./leverage";
import { COST_PROFILES, computeFill, dailySwap } from "./costs";
import { EventBus } from "./events";
import { validateIntent } from "./validation";
import type {
  AccountConfig, AccountSnapshot, AccountStatus, CloseReason,
  Order, OrderIntent, Position, PositionSnapshot, QuoteMap, Side,
  ValidationResult,
} from "./types";

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

export class TradingEngine {
  readonly bus = new EventBus();
  private config: AccountConfig;
  private balance: number;
  private realized = 0;
  private positions: Position[] = [];
  private orders: Order[] = [];
  private quotes: QuoteMap = new Map();

  constructor(config: AccountConfig) {
    this.config = { ...config };
    this.balance = config.starting_balance;
  }

  /* -------------------------------------------------- config */
  updateConfig(patch: Partial<AccountConfig>): AccountSnapshot {
    this.config = { ...this.config, ...patch };
    return this.snapshot();
  }
  getConfig(): AccountConfig { return { ...this.config }; }

  /* -------------------------------------------------- hydration */
  hydrate(state: {
    balance?: number;
    realized_pnl?: number;
    positions?: Position[];
    orders?: Order[];
  }): AccountSnapshot {
    if (typeof state.balance === "number") this.balance = state.balance;
    if (typeof state.realized_pnl === "number") this.realized = state.realized_pnl;
    if (state.positions) this.positions = state.positions.slice();
    if (state.orders) this.orders = state.orders.slice();
    return this.snapshot();
  }

  /* -------------------------------------------------- prices */
  onPrice(symbol: string, price: number): AccountSnapshot {
    if (!(price > 0)) return this.snapshot();
    this.quotes.set(symbol, price);
    this.processResting(symbol, price);
    this.processStops(symbol, price);
    const snap = this.snapshot();
    this.enforceMargin(snap);
    this.bus.emit({ type: "account_updated", snapshot: snap });
    return snap;
  }
  onQuotes(map: Record<string, number>): AccountSnapshot {
    for (const [s, p] of Object.entries(map)) {
      if (p > 0) this.quotes.set(s, p);
    }
    // Process order triggers per symbol.
    for (const s of Object.keys(map)) {
      const p = this.quotes.get(s);
      if (p) { this.processResting(s, p); this.processStops(s, p); }
    }
    const snap = this.snapshot();
    this.enforceMargin(snap);
    this.bus.emit({ type: "account_updated", snapshot: snap });
    return snap;
  }
  getPrice(symbol: string): number | null {
    return this.quotes.get(symbol) ?? null;
  }

  /* -------------------------------------------------- validation */
  validate(intent: OrderIntent): ValidationResult {
    const px = this.priceFor(intent);
    return validateIntent(this.config, this.snapshot(), intent, px);
  }

  /* -------------------------------------------------- orders */
  submitOrder(intent: OrderIntent): { order: Order; validation: ValidationResult } {
    const validation = this.validate(intent);
    const order: Order = {
      ...intent,
      id: nextId("ord"),
      status: "submitted",
      created_at: Date.now(),
    };
    if (!validation.ok) {
      order.status = "rejected";
      order.reject_reason = validation.errors.join("; ");
      this.orders.push(order);
      this.bus.emit({ type: "order_submitted", order });
      this.bus.emit({ type: "order_rejected", order, reason: order.reject_reason });
      return { order, validation };
    }
    this.orders.push(order);
    this.bus.emit({ type: "order_submitted", order });

    // Market orders fill immediately.
    if (intent.kind === "market") {
      this.fill(order, validation.fill_price);
    } else {
      order.status = "working";
    }
    return { order, validation };
  }

  cancelOrder(id: string): Order | null {
    const o = this.orders.find((x) => x.id === id);
    if (!o) return null;
    if (o.status !== "working" && o.status !== "submitted") return o;
    o.status = "cancelled";
    this.bus.emit({ type: "order_cancelled", order: o });
    return o;
  }

  private priceFor(intent: OrderIntent): number {
    const live = this.quotes.get(intent.symbol);
    if (live && live > 0) return live;
    const meta = findSymbol(intent.symbol);
    return meta?.refPrice ?? 0;
  }

  private processResting(symbol: string, price: number): void {
    for (const o of this.orders) {
      if (o.symbol !== symbol) continue;
      if (o.status !== "working") continue;
      let trigger = false;
      if (o.kind === "limit") {
        // Buy limit: price ≤ limit; Sell limit: price ≥ limit
        trigger = o.side === "long"
          ? price <= (o.limit_price ?? 0)
          : price >= (o.limit_price ?? Infinity);
      } else if (o.kind === "stop") {
        // Buy stop: price ≥ stop; Sell stop: price ≤ stop
        trigger = o.side === "long"
          ? price >= (o.stop_price ?? Infinity)
          : price <= (o.stop_price ?? 0);
      } else if (o.kind === "stop_limit") {
        // Convert to limit once triggered.
        const stopHit = o.side === "long"
          ? price >= (o.stop_price ?? Infinity)
          : price <= (o.stop_price ?? 0);
        if (stopHit) { o.kind = "limit"; continue; }
      }
      if (trigger) this.fill(o, price);
    }
  }

  private processStops(symbol: string, price: number): void {
    for (const p of this.positions) {
      if (p.symbol !== symbol) continue;
      if (p.status !== "open" && p.status !== "partially_closed") continue;
      if (p.stop_loss != null) {
        const hit = p.side === "long" ? price <= p.stop_loss : price >= p.stop_loss;
        if (hit) { this.closePosition(p.id, price, "stop_loss"); continue; }
      }
      if (p.take_profit != null) {
        const hit = p.side === "long" ? price >= p.take_profit : price <= p.take_profit;
        if (hit) { this.closePosition(p.id, price, "take_profit"); }
      }
    }
  }

  /* -------------------------------------------------- positions */
  private fill(order: Order, price: number): Position {
    const meta = findSymbol(order.symbol)!;
    const profile = COST_PROFILES[this.config.cost_profile] ?? COST_PROFILES.zero;
    const fill = computeFill(profile, meta, order.side, price, order.quantity, () => 0.5);
    const lev = effectiveLeverage(this.config.leverage, this.config.leverage_profile, meta.market);
    const mmr = maintenanceMargin(this.config.leverage_profile, meta.market);
    order.status = "filled";
    order.filled_at = Date.now();
    order.filled_price = fill.price;

    // Merge into existing position on same side (netting), else open new.
    const existing = this.positions.find(
      (p) => p.symbol === order.symbol && p.side === order.side
        && (p.status === "open" || p.status === "partially_closed"),
    );
    let position: Position;
    if (existing) {
      const totalQty = existing.quantity + order.quantity;
      const newAvg = (existing.entry_price * existing.quantity + fill.price * order.quantity) / totalQty;
      existing.entry_price = newAvg;
      existing.quantity = totalQty;
      existing.original_quantity += order.quantity;
      existing.commission += fill.commission;
      existing.liquidation_price = liquidationPrice(newAvg, existing.side, lev, mmr);
      position = existing;
      this.bus.emit({ type: "position_modified", position, change: { kind: "increase", added: order.quantity, new_avg_price: newAvg } });
    } else {
      // Opposite-side fill against an existing position → reduce or reverse.
      const opposite = this.positions.find(
        (p) => p.symbol === order.symbol && p.side !== order.side
          && (p.status === "open" || p.status === "partially_closed"),
      );
      if (opposite) {
        if (order.quantity < opposite.quantity) {
          const fraction = order.quantity / opposite.quantity;
          this.partialClose(opposite.id, fraction, fill.price, "manual");
          order.position_id = opposite.id;
          this.bus.emit({ type: "order_filled", order, position: opposite });
          return opposite;
        }
        // Full close (or reverse).
        const remaining = order.quantity - opposite.quantity;
        this.closePosition(opposite.id, fill.price, remaining > 0 ? "reverse" : "manual");
        if (remaining > 0) {
          position = this.createPosition(order, meta, fill.price, remaining, fill.commission, lev, mmr);
          this.bus.emit({
            type: "position_modified",
            position,
            change: { kind: "reverse", from_side: opposite.side, new_position_id: position.id },
          });
        } else {
          order.position_id = opposite.id;
          this.bus.emit({ type: "order_filled", order, position: opposite });
          return opposite;
        }
      } else {
        position = this.createPosition(order, meta, fill.price, order.quantity, fill.commission, lev, mmr);
        this.bus.emit({ type: "position_opened", position });
      }
    }
    order.position_id = position.id;
    this.bus.emit({ type: "order_filled", order, position });
    return position;
  }

  private createPosition(
    order: Order, meta: import("@/lib/paper-trading/symbols").SymbolMeta,
    fillPrice: number, qty: number, commission: number,
    lev: number, mmr: number,
  ): Position {
    const position: Position = {
      id: nextId("pos"),
      symbol: order.symbol,
      side: order.side,
      entry_price: fillPrice,
      quantity: qty,
      original_quantity: qty,
      stop_loss: order.stop_loss ?? null,
      take_profit: order.take_profit ?? null,
      commission,
      swap: 0,
      realized_pnl: 0,
      status: "open",
      opened_at: Date.now(),
      closed_at: null,
      liquidation_price: liquidationPrice(fillPrice, order.side, lev, mmr),
    };
    void meta;
    this.positions.push(position);
    return position;
  }

  modifyStops(id: string, patch: { stop_loss?: number | null; take_profit?: number | null }): Position | null {
    const p = this.positions.find((x) => x.id === id);
    if (!p) return null;
    if (patch.stop_loss !== undefined) p.stop_loss = patch.stop_loss;
    if (patch.take_profit !== undefined) p.take_profit = patch.take_profit;
    this.bus.emit({
      type: "position_modified", position: p,
      change: { kind: "modify_stops", stop_loss: p.stop_loss, take_profit: p.take_profit },
    });
    return p;
  }

  partialClose(id: string, fraction: number, price: number, reason: CloseReason = "manual"): Position | null {
    const p = this.positions.find((x) => x.id === id);
    if (!p || p.status === "closed" || p.status === "liquidated") return null;
    const f = Math.max(0, Math.min(1, fraction));
    if (f >= 1) return this.closePosition(id, price, reason);
    const meta = findSymbol(p.symbol);
    if (!meta) return null;
    const closedQty = p.quantity * f;
    const gross = computePnl(meta, p.side, p.entry_price, price, closedQty);
    const commShare = p.commission * f;
    const swapShare = p.swap * f;
    const realized = gross - commShare - swapShare;
    this.applyRealized(realized);
    p.quantity -= closedQty;
    p.commission -= commShare;
    p.swap -= swapShare;
    p.realized_pnl += realized;
    p.status = "partially_closed";
    this.bus.emit({
      type: "position_modified", position: p,
      change: { kind: "partial_close", fraction: f, realized_pnl: realized },
    });
    return p;
  }

  closePosition(id: string, price: number, reason: CloseReason = "manual"): Position | null {
    const p = this.positions.find((x) => x.id === id);
    if (!p || p.status === "closed" || p.status === "liquidated") return null;
    const meta = findSymbol(p.symbol);
    if (!meta) return null;
    const gross = computePnl(meta, p.side, p.entry_price, price, p.quantity);
    const realized = gross - p.commission - p.swap;
    this.applyRealized(realized);
    p.realized_pnl += realized;
    p.status = reason === "liquidation" ? "liquidated" : "closed";
    p.closed_at = Date.now();
    p.quantity = 0;
    this.bus.emit({ type: "position_closed", position: p, realized_pnl: realized, reason });
    if (reason === "liquidation") {
      this.bus.emit({ type: "liquidation", position: p, price });
    }
    return p;
  }

  chargeSwap(): number {
    // Charge daily swap on every open position. Callers can run this on a UTC rollover cron.
    const profile = COST_PROFILES[this.config.cost_profile] ?? COST_PROFILES.zero;
    let total = 0;
    for (const p of this.positions) {
      if (p.status !== "open" && p.status !== "partially_closed") continue;
      const meta = findSymbol(p.symbol); if (!meta) continue;
      const s = dailySwap(profile, meta, p.side, p.quantity);
      p.swap += Math.abs(Math.min(0, s));
      total += s;
      if (s !== 0) this.bus.emit({
        type: "position_modified", position: p,
        change: { kind: "swap_charged", amount: s },
      });
    }
    return total;
  }

  private applyRealized(delta: number): void {
    const withNBP = this.config.negative_balance_protection;
    const beforeBalance = this.balance;
    let newBalance = this.balance + delta;
    if (withNBP && newBalance < 0) newBalance = 0;
    this.balance = newBalance;
    this.realized += delta;
    this.bus.emit({ type: "balance_updated", balance: this.balance, delta: this.balance - beforeBalance });
  }

  /* -------------------------------------------------- snapshot / margin */
  private buildPositionSnapshots(): PositionSnapshot[] {
    const out: PositionSnapshot[] = [];
    for (const p of this.positions) {
      if (p.status === "closed" || p.status === "liquidated") continue;
      const meta = findSymbol(p.symbol); if (!meta) continue;
      const live = this.quotes.get(p.symbol) ?? p.entry_price;
      const lev = effectiveLeverage(this.config.leverage, this.config.leverage_profile, meta.market);
      const floating = computePnl(meta, p.side, p.entry_price, live, p.quantity) - p.commission - p.swap;
      const margin = marginRequired(meta, p.quantity, p.entry_price, lev);
      const notional = notionalValue(meta, p.quantity, p.entry_price);
      const distToLiq = p.liquidation_price
        ? ((p.side === "long" ? live - p.liquidation_price : p.liquidation_price - live) / live) * 100
        : null;
      out.push({ position: p, meta, current_price: live, floating_pnl: floating, notional, margin, distance_to_liq: distToLiq });
    }
    return out;
  }

  snapshot(): AccountSnapshot {
    const positions = this.buildPositionSnapshots();
    const floating = positions.reduce((s, p) => s + p.floating_pnl, 0);
    const usedMargin = positions.reduce((s, p) => s + p.margin, 0);
    const totalNotional = positions.reduce((s, p) => s + p.notional, 0);
    const rawEquity = this.balance + floating;
    const equity = this.config.negative_balance_protection ? Math.max(0, rawEquity) : rawEquity;
    const freeMargin = equity - usedMargin;
    const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null;
    const marginRatio = equity > 0 ? usedMargin / equity : (usedMargin > 0 ? Infinity : 0);
    const buyingPower = Math.max(0, equity * (this.config.leverage || 1) - totalNotional);
    let status: AccountStatus = "safe";
    if (marginLevel != null) {
      if (marginLevel <= this.config.stop_out_level) status = "stop_out";
      else if (marginLevel <= this.config.margin_call_level) status = "margin_call";
      else if (marginLevel <= this.config.margin_call_level * 1.25) status = "warning";
    }
    return {
      balance: this.balance,
      equity,
      floating_pnl: floating,
      realized_pnl: this.realized,
      net_pnl: this.balance - this.config.starting_balance,
      used_margin: usedMargin,
      free_margin: freeMargin,
      margin_level: marginLevel,
      margin_ratio: marginRatio,
      buying_power: buyingPower,
      available_funds: freeMargin,
      status,
      positions,
      orders: this.orders.slice(),
      updated_at: Date.now(),
    };
  }

  private enforceMargin(snap: AccountSnapshot): void {
    if (snap.status === "margin_call") {
      this.bus.emit({ type: "margin_call", snapshot: snap });
    }
    if (snap.status !== "stop_out") return;
    // Liquidate worst-losing positions until margin level recovers.
    const worstFirst = sortForStopOut(
      snap.positions.map((p) => ({
        trade: {
          id: p.position.id, symbol: p.position.symbol, direction: p.position.side,
          entry_price: p.position.entry_price, lot_size: p.position.quantity,
        },
        sym: p.meta, currentPrice: p.current_price, floatingPnl: p.floating_pnl,
        notional: p.notional, margin: p.margin,
      })),
    );
    const liquidated: Position[] = [];
    for (const w of worstFirst) {
      const pos = this.positions.find((x) => x.id === w.trade.id);
      if (!pos) continue;
      const price = this.quotes.get(pos.symbol) ?? pos.entry_price;
      const closed = this.closePosition(pos.id, price, "liquidation");
      if (closed) liquidated.push(closed);
      const nextSnap = this.snapshot();
      if (nextSnap.status !== "stop_out") break;
    }
    this.bus.emit({ type: "stop_out", snapshot: this.snapshot(), liquidated });
  }

  /* -------------------------------------------------- convenience */
  getPositions(): Position[] { return this.positions.slice(); }
  getOrders(): Order[] { return this.orders.slice(); }
  reset(startingBalance?: number): void {
    if (startingBalance != null) {
      this.config.starting_balance = startingBalance;
      this.balance = startingBalance;
    } else {
      this.balance = this.config.starting_balance;
    }
    this.realized = 0;
    this.positions = [];
    this.orders = [];
    this.quotes.clear();
  }
}

// Re-exports for consumers
export { COST_PROFILES } from "./costs";
export { LEVERAGE_PROFILES } from "./leverage";
export type * from "./types";
export { validateIntent } from "./validation";

/** Default config for a fresh $10,000 retail-forex account. */
export function defaultConfig(overrides: Partial<AccountConfig> = {}): AccountConfig {
  return {
    starting_balance: 10_000,
    currency: "USD",
    leverage: 30,
    margin_call_level: 100,
    stop_out_level: 50,
    negative_balance_protection: true,
    max_trade_risk_pct: 2,
    max_daily_risk_pct: 5,
    max_open_positions: 50,
    cost_profile: "retail_forex",
    leverage_profile: "retail",
    ...overrides,
  };
}

void Side; // keep type-only import from tree-shaking
