/**
 * Deterministic Phase 4 scenarios. Each returns `{ name, pass, detail }`.
 * The runner exercises the OrderManager against a fresh engine with a
 * known starting balance and controlled price ticks — no randomness, no
 * network calls.
 */

import { TradingEngine, defaultConfig } from "@/lib/trading-engine";
import { OrderManager } from "./manager";
import { createBracket } from "./brackets";
import type { PlaceResult } from "./manager";

export type Phase4Scenario = { name: string; pass: boolean; detail: string };

function newManager(startingBalance = 10_000): OrderManager {
  const engine = new TradingEngine(defaultConfig({ starting_balance: startingBalance }));
  engine.onPrice("EURUSD", 1.1000);
  return new OrderManager(engine);
}

function ok(name: string, cond: boolean, detail: string): Phase4Scenario {
  return { name, pass: !!cond, detail };
}

function firstPositionId(mgr: OrderManager): string | null {
  return mgr.engine.getPositions()[0]?.id ?? null;
}

export function runPhase4Scenarios(): Phase4Scenario[] {
  const out: Phase4Scenario[] = [];

  /* 1. Market order — fixed lots */
  {
    const mgr = newManager();
    const r: PlaceResult = mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.10 },
      stopLoss: 1.0950, takeProfit: 1.1100,
    });
    out.push(ok("market order fills", r.ok && r.order?.status === "filled",
      r.message ?? `status=${r.order?.status}`));
  }

  /* 2. Limit order becomes working, triggers on price */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "limit",
      limitPrice: 1.0900, entryPrice: 1.0900,
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    const wasWorking = r.order?.status === "working";
    mgr.onPrice("EURUSD", 1.0899);
    const filled = mgr.engine.getOrders().some((o) => o.id === r.order?.id && o.status === "filled");
    out.push(ok("limit order triggers", wasWorking && filled, `working=${wasWorking} filled=${filled}`));
  }

  /* 3. Stop order triggers on breakout */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "stop",
      stopPrice: 1.1050, entryPrice: 1.1050,
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    mgr.onPrice("EURUSD", 1.1051);
    const filled = mgr.engine.getOrders().some((o) => o.id === r.order?.id && o.status === "filled");
    out.push(ok("stop order triggers on breakout", filled, `filled=${filled}`));
  }

  /* 4. Stop-limit converts to limit */
  {
    const mgr = newManager();
    mgr.place({
      symbol: "EURUSD", side: "long", kind: "stop_limit",
      stopPrice: 1.1050, limitPrice: 1.1055, entryPrice: 1.1055,
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    mgr.onPrice("EURUSD", 1.1051); // triggers stop → becomes limit
    mgr.onPrice("EURUSD", 1.1054); // fills limit
    const filled = mgr.engine.getPositions().length === 1;
    out.push(ok("stop-limit becomes limit and fills", filled, `positions=${mgr.engine.getPositions().length}`));
  }

  /* 5. Percent-risk sizing */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "percent_risk", percent: 1 },
      stopLoss: 1.0950,
    });
    const risk = r.preflight.risk_amount;
    out.push(ok("percent-risk sizes to ~1% equity",
      risk > 90 && risk < 110, `risk=${risk.toFixed(2)}`));
  }

  /* 6. Partial close */
  {
    const mgr = newManager();
    mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.20 },
    });
    const id = firstPositionId(mgr)!;
    mgr.onPrice("EURUSD", 1.1020);
    mgr.partialClose(id, 0.5);
    const remaining = mgr.engine.getPositions().find((p) => p.id === id)?.quantity ?? 0;
    out.push(ok("partial close halves quantity",
      Math.abs(remaining - 0.1) < 1e-6, `remaining=${remaining}`));
  }

  /* 7. Multi-target bracket fires TP1 */
  {
    const mgr = newManager();
    mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.40 },
      brackets: createBracket([0.25, 0.25, 0.25], [1.1020, 1.1040, 1.1060]),
    });
    const id = firstPositionId(mgr)!;
    // Re-attach because place() above did — verify summary tracking
    mgr.onPrice("EURUSD", 1.1021);
    const summary = mgr.getBracketSummary(id);
    out.push(ok("bracket TP1 fires",
      summary != null && summary.filled >= 1,
      `summary=${JSON.stringify(summary)}`));
  }

  /* 8. Break-even at 1R */
  {
    const mgr = newManager();
    mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.10 },
      stopLoss: 1.0950,
      breakEven: { trigger: "rr", rr: 1 },
    });
    const id = firstPositionId(mgr)!;
    mgr.onPrice("EURUSD", 1.1050); // 1R advance
    const sl = mgr.engine.getPositions().find((p) => p.id === id)?.stop_loss ?? 0;
    out.push(ok("break-even at 1R moves SL to entry",
      Math.abs(sl - 1.10) < 1e-6, `sl=${sl}`));
  }

  /* 9. Trailing stop tightens as price advances */
  {
    const mgr = newManager();
    mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.10 },
      stopLoss: 1.0950,
      trailing: { method: "distance", distance: 0.0020 },
    });
    const id = firstPositionId(mgr)!;
    mgr.onPrice("EURUSD", 1.1030);
    const sl = mgr.engine.getPositions().find((p) => p.id === id)?.stop_loss ?? 0;
    out.push(ok("trailing stop tightens", sl > 1.0950, `sl=${sl}`));
  }

  /* 10. Reverse position */
  {
    const mgr = newManager();
    mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    const id = firstPositionId(mgr)!;
    mgr.reverse(id);
    const remaining = mgr.engine.getPositions().filter((p) => p.status === "open" || p.status === "partially_closed");
    const isShort = remaining.length === 1 && remaining[0].side === "short";
    out.push(ok("reverse position flips side", isShort,
      `sides=${remaining.map((p) => p.side).join(",")}`));
  }

  /* 11. Modify pending order */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "limit",
      limitPrice: 1.0900, entryPrice: 1.0900,
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    const modified = mgr.modifyPending(r.order!.id, { limit_price: 1.0910 });
    out.push(ok("modify pending order updates limit price", modified,
      `modified=${modified}`));
  }

  /* 12. Reject: insufficient margin */
  {
    const mgr = newManager(500); // tiny account
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 5 },
    });
    out.push(ok("insufficient margin is rejected", !r.ok, r.message ?? ""));
  }

  /* 13. Reject: invalid SL orientation */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.10 },
      stopLoss: 1.2000, // above price for a long — invalid
    });
    out.push(ok("invalid SL orientation is rejected", !r.ok, r.message ?? ""));
  }

  /* 14. Cancel pending */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "limit",
      limitPrice: 1.0800, entryPrice: 1.0800,
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    const cancelled = mgr.cancel(r.order!.id);
    out.push(ok("cancel pending order", cancelled, `cancelled=${cancelled}`));
  }

  /* 15. Audit trail records lifecycle */
  {
    const mgr = newManager();
    const r = mgr.place({
      symbol: "EURUSD", side: "long", kind: "market",
      sizing: { mode: "fixed_lots", lots: 0.10 },
    });
    const trail = mgr.getAuditForOrder(r.order!.id);
    out.push(ok("audit trail records order lifecycle",
      trail.length >= 2, `entries=${trail.length}`));
  }

  return out;
}

export function summarizePhase4(results = runPhase4Scenarios()): {
  passed: number; failed: number; total: number; failures: Phase4Scenario[];
} {
  const failures = results.filter((r) => !r.pass);
  return {
    passed: results.length - failures.length,
    failed: failures.length,
    total: results.length,
    failures,
  };
}
