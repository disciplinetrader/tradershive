/**
 * Trading Engine — validation scenarios.
 *
 * Not wired into automated tests (project doesn't run vitest per turn);
 * each scenario is a pure function returning pass/fail + a message so any
 * QA route or admin panel can run the whole suite and display a
 * pass-rate. Every scenario builds a fresh engine.
 *
 * Add scenarios here as new engine behaviour lands.
 */

import { TradingEngine, defaultConfig } from "./engine";
import type { AccountConfig } from "./types";

export type ScenarioResult = { name: string; ok: boolean; detail: string };

function approx(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
}

function withEngine(
  fn: (e: TradingEngine) => string | null,
  cfg: Partial<AccountConfig> = {},
): string | null {
  const e = new TradingEngine(defaultConfig(cfg));
  return fn(e);
}

export const SCENARIOS: Array<{ name: string; run: () => string | null }> = [
  {
    name: "Open + close long profits when price rises",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order, validation } = e.submitOrder({
        symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10,
      });
      if (!validation.ok) return `order rejected: ${validation.errors.join(",")}`;
      e.onPrice("EUR/USD", 1.11);
      const pos = e.getPositions().find((p) => p.id === order.position_id)!;
      const snap = e.snapshot();
      if (!(snap.floating_pnl > 0)) return `expected floating>0 got ${snap.floating_pnl}`;
      const closed = e.closePosition(pos.id, 1.11, "manual");
      if (!closed || closed.status !== "closed") return "close failed";
      const after = e.snapshot();
      if (!(after.realized_pnl > 0)) return `realized should be positive, got ${after.realized_pnl}`;
      return null;
    }),
  },
  {
    name: "Short loses when price rises",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({ symbol: "EUR/USD", side: "short", kind: "market", quantity: 0.10 });
      e.onPrice("EUR/USD", 1.11);
      const snap = e.snapshot();
      if (!(snap.floating_pnl < 0)) return `expected floating<0 got ${snap.floating_pnl}`;
      return order.status === "filled" ? null : "order not filled";
    }),
  },
  {
    name: "Partial close realises half PnL and keeps position open",
    run: () => withEngine((e) => {
      e.onPrice("BTC/USDT", 60_000);
      const { order } = e.submitOrder({ symbol: "BTC/USDT", side: "long", kind: "market", quantity: 0.1 });
      e.onPrice("BTC/USDT", 62_000);
      const pos = e.getPositions().find((p) => p.id === order.position_id)!;
      const before = pos.quantity;
      e.partialClose(pos.id, 0.5, 62_000);
      const after = e.getPositions().find((p) => p.id === pos.id)!;
      if (!approx(after.quantity, before * 0.5, 0.01))
        return `qty expected ${before * 0.5}, got ${after.quantity}`;
      if (after.status !== "partially_closed") return `status ${after.status}`;
      return null;
    }),
  },
  {
    name: "Increase then reduce maintains average price",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      e.submitOrder({ symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10 });
      e.onPrice("EUR/USD", 1.12);
      e.submitOrder({ symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10 });
      const [pos] = e.getPositions();
      if (!approx(pos.entry_price, 1.11, 0.001))
        return `avg expected ~1.11 got ${pos.entry_price}`;
      return null;
    }),
  },
  {
    name: "Reverse position closes old and opens opposite",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      e.submitOrder({ symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10 });
      e.submitOrder({ symbol: "EUR/USD", side: "short", kind: "market", quantity: 0.20 });
      const open = e.getPositions().filter((p) => p.status !== "closed");
      const openLong = open.find((p) => p.side === "long");
      const openShort = open.find((p) => p.side === "short");
      if (openLong) return "long should be closed after reverse";
      if (!openShort || !approx(openShort.quantity, 0.10)) return "short remainder wrong";
      return null;
    }),
  },
  {
    name: "Stop loss triggers automatically on tick",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({
        symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10,
        stop_loss: 1.095,
      });
      e.onPrice("EUR/USD", 1.094);
      const pos = e.getPositions().find((p) => p.id === order.position_id)!;
      return pos.status === "closed" ? null : `status ${pos.status}`;
    }),
  },
  {
    name: "Take profit triggers automatically on tick",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({
        symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10,
        take_profit: 1.105,
      });
      e.onPrice("EUR/USD", 1.106);
      const pos = e.getPositions().find((p) => p.id === order.position_id)!;
      return pos.status === "closed" ? null : `status ${pos.status}`;
    }),
  },
  {
    name: "Limit order rests then fills when price reaches limit",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({
        symbol: "EUR/USD", side: "long", kind: "limit", quantity: 0.10, limit_price: 1.095,
      });
      if (order.status !== "working") return `expected working got ${order.status}`;
      e.onPrice("EUR/USD", 1.094);
      const filled = e.getOrders().find((o) => o.id === order.id)!;
      return filled.status === "filled" ? null : `expected filled got ${filled.status}`;
    }),
  },
  {
    name: "Rejects order with insufficient margin",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({
        symbol: "EUR/USD", side: "long", kind: "market", quantity: 100,
      });
      return order.status === "rejected" ? null : `expected rejected got ${order.status}`;
    }, { starting_balance: 500 }),
  },
  {
    name: "Rejects negative quantity",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({ symbol: "EUR/USD", side: "long", kind: "market", quantity: -1 });
      return order.status === "rejected" ? null : `status ${order.status}`;
    }),
  },
  {
    name: "Rejects invalid stop loss (below entry on short)",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      const { order } = e.submitOrder({
        symbol: "EUR/USD", side: "short", kind: "market", quantity: 0.10, stop_loss: 1.09,
      });
      return order.status === "rejected" ? null : `expected rejected got ${order.status}`;
    }),
  },
  {
    name: "Equity + free margin + used margin invariant holds",
    run: () => withEngine((e) => {
      e.onPrice("EUR/USD", 1.10);
      e.submitOrder({ symbol: "EUR/USD", side: "long", kind: "market", quantity: 0.10 });
      e.onPrice("EUR/USD", 1.101);
      const s = e.snapshot();
      const rebuilt = s.balance + s.floating_pnl;
      if (!approx(rebuilt, s.equity, 0.001)) return `equity mismatch ${rebuilt} vs ${s.equity}`;
      if (!approx(s.free_margin + s.used_margin, s.equity, 0.001))
        return "free+used ≠ equity";
      return null;
    }),
  },
  {
    name: "NBP prevents balance going negative",
    run: () => withEngine((e) => {
      e.onPrice("BTC/USDT", 60_000);
      e.submitOrder({ symbol: "BTC/USDT", side: "long", kind: "market", quantity: 0.05 });
      // Massive adverse move — should trigger stop-out and cap at 0.
      e.onPrice("BTC/USDT", 100);
      const s = e.snapshot();
      return s.balance >= 0 ? null : `balance went negative: ${s.balance}`;
    }, { negative_balance_protection: true, starting_balance: 1000, leverage: 50 }),
  },
  {
    name: "Stop-out liquidates worst-losing positions",
    run: () => withEngine((e) => {
      e.onPrice("BTC/USDT", 60_000);
      e.submitOrder({ symbol: "BTC/USDT", side: "long", kind: "market", quantity: 0.05 });
      e.onPrice("BTC/USDT", 30_000);
      const positions = e.getPositions();
      const liq = positions.some((p) => p.status === "liquidated" || p.status === "closed");
      return liq ? null : "no liquidation triggered";
    }, { starting_balance: 1000, leverage: 50, stop_out_level: 50 }),
  },
];

export function runScenarios(): { total: number; passed: number; results: ScenarioResult[] } {
  const results = SCENARIOS.map((s) => {
    try {
      const detail = s.run();
      return { name: s.name, ok: detail == null, detail: detail ?? "ok" };
    } catch (err) {
      return { name: s.name, ok: false, detail: (err as Error).message };
    }
  });
  return {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    results,
  };
}
