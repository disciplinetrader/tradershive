import { describe, it, expect } from "vitest";
import {
  evaluateTick, exitFor, fillPriceFor, quoteAt, triggersEntry, type ExecutionCosts,
} from "../engine";
import type { PositionOrder } from "../model";

/**
 * Simulated spread and slippage.
 *
 * Every case uses ONE set of numbers so the arithmetic can be checked by hand:
 *
 *   observed price   100.00
 *   spread            0.10   → half 0.05 → bid 99.95, ask 100.05
 *   slippage          0.05   → adverse only
 *
 * The point of the feature is that a demo account hides friction. These tests
 * exist to prove the friction is actually charged, on both sides, and that it
 * changes WHICH orders trigger — not only what they cost.
 */

const COSTS: ExecutionCosts = { spread: 0.1, slippage: 0.05 };
const PRICE = 100;

function order(over: Partial<PositionOrder> = {}): PositionOrder {
  return {
    id: "o1",
    symbol: "EUR/USD",
    direction: "buy",
    orderType: "market",
    entry: 100,
    stop: 99,
    target: 101,
    size: 1,
    status: "pending",
    ...(over as object),
  } as PositionOrder;
}

describe("quoteAt", () => {
  it("splits the spread either side of the observed price", () => {
    expect(quoteAt(PRICE, COSTS)).toEqual({ bid: 99.95, ask: 100.05, mid: 100 });
  });

  it("collapses to the observed price with no costs", () => {
    expect(quoteAt(PRICE)).toEqual({ bid: 100, ask: 100, mid: 100 });
  });
});

describe("market fills pay the spread and the slippage", () => {
  it("buys at ask + slippage = 100.10", () => {
    const r = fillPriceFor(order({ direction: "buy", orderType: "market" }), PRICE, COSTS);
    expect(r.fillPrice).toBeCloseTo(100.1, 10);
  });

  it("sells at bid − slippage = 99.90", () => {
    const r = fillPriceFor(order({ direction: "sell", orderType: "market" }), PRICE, COSTS);
    expect(r.fillPrice).toBeCloseTo(99.9, 10);
  });

  it("costs 0.20 per unit on a round trip at an unchanged price", () => {
    // The headline number: buy and sell at the same observed 100.00 and you
    // are down the full spread plus slippage twice. Charging spread on entry
    // only would report half this, and every backtest would look better than
    // the market allowed.
    const buy = fillPriceFor(order({ direction: "buy", orderType: "market" }), PRICE, COSTS);
    const sell = fillPriceFor(order({ direction: "sell", orderType: "market" }), PRICE, COSTS);
    expect(buy.fillPrice - sell.fillPrice).toBeCloseTo(0.2, 10);
  });

  it("is frictionless by default, so existing behaviour is unchanged", () => {
    expect(fillPriceFor(order({ orderType: "market" }), PRICE).fillPrice).toBe(100);
  });
});

describe("spread changes WHICH orders trigger", () => {
  it("a buy limit at 100.00 does NOT fill while the ask is 100.05", () => {
    // Without spread this triggers: the mid has reached the level. With it,
    // the ask has not, so the fill would be a trade that could not happen.
    expect(triggersEntry("buy_limit", 100, PRICE, COSTS)).toBe(false);
    expect(triggersEntry("buy_limit", 100, PRICE)).toBe(true);
  });

  it("the same buy limit fills once the price drops to 99.95", () => {
    expect(triggersEntry("buy_limit", 100, 99.95, COSTS)).toBe(true);
  });

  it("a sell limit at 100.00 needs the price up at 100.05", () => {
    expect(triggersEntry("sell_limit", 100, PRICE, COSTS)).toBe(false);
    expect(triggersEntry("sell_limit", 100, 100.05, COSTS)).toBe(true);
  });

  it("a buy stop at 100.00 triggers EARLY, at 99.95, because the ask gets there first", () => {
    expect(triggersEntry("buy_stop", 100, 99.95, COSTS)).toBe(true);
    expect(triggersEntry("buy_stop", 100, 99.94, COSTS)).toBe(false);
  });

  it("a filled limit still fills at its own level, never slipped", () => {
    const r = fillPriceFor(order({ direction: "buy", orderType: "buy_limit", entry: 100 }), 99.95, COSTS);
    expect(r.fillPrice).toBe(100);
    expect(r.slippage).toBe(0);
  });

  it("a buy stop fills at ask + slippage = 100.10", () => {
    const r = fillPriceFor(order({ direction: "buy", orderType: "buy_stop", entry: 100 }), PRICE, COSTS);
    expect(r.fillPrice).toBeCloseTo(100.1, 10);
  });
});

describe("exits are measured on the closing side", () => {
  it("a long's stop at 99.00 fires when the BID reaches it, at price 99.05", () => {
    const o = order({ direction: "buy", status: "open", stop: 99, target: 101 });
    expect(exitFor(o, 99.06, COSTS)).toBeNull();
    const hit = exitFor(o, 99.05, COSTS);
    expect(hit?.reason).toBe("stop_loss");
    expect(hit?.closePrice).toBeCloseTo(99, 10);
  });

  it("a long's target at 101.00 needs the bid there, at price 101.05", () => {
    const o = order({ direction: "buy", status: "open", stop: 99, target: 101 });
    expect(exitFor(o, 101, COSTS)).toBeNull();
    const hit = exitFor(o, 101.05, COSTS);
    expect(hit?.reason).toBe("take_profit");
    expect(hit?.closePrice).toBe(101);
  });

  it("a gap through a long's stop is eaten at the bid, not the mid", () => {
    const o = order({ direction: "buy", status: "open", stop: 99, target: 101 });
    // Price gaps to 98.00 → bid 97.95, which is what the trader gets.
    expect(exitFor(o, 98, COSTS)?.closePrice).toBeCloseTo(97.95, 10);
  });

  it("a short's stop at 101.00 fires when the ASK reaches it, at price 100.95", () => {
    const o = order({ direction: "sell", status: "open", stop: 101, target: 99 });
    expect(exitFor(o, 100.94, COSTS)).toBeNull();
    expect(exitFor(o, 100.95, COSTS)?.reason).toBe("stop_loss");
  });
});

describe("evaluateTick threads the costs through", () => {
  it("fills a market buy at 100.10 and leaves a limit unfilled", () => {
    const intents = evaluateTick(
      [order({ id: "m", orderType: "market", direction: "buy" }),
       order({ id: "l", orderType: "buy_limit", direction: "buy", entry: 100 })],
      { price: PRICE },
      COSTS,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0].orderId).toBe("m");
    expect((intents[0] as { fillPrice: number }).fillPrice).toBeCloseTo(100.1, 10);
  });
});
